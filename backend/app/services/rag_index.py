import re
import uuid

from openai import OpenAI
from sqlalchemy import text
from sqlmodel import Session, col, select

from app.config import get_settings
from app.models import AlumniPost, CampusEvent, PostStatus, RagChunk
from app.services.ai_settings import build_siliconflow_openai_client, resolve_ai_settings

# 句末（含省略号）
_SENTENCE_END = re.compile(r"[。！？；.!?;…]+")
# 校史正文里 Markdown 插图（导入脚本写入），向量索引只保留文字
_MD_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")


def strip_markdown_images(text: str) -> str:
    s = _MD_IMAGE.sub("", text or "")
    s = re.sub(r"\n{3,}", "\n\n", s).strip()
    return s

# 校史正文 / 标题摘要 / 帖子 body 的默认参数
# 硅基流动等部分 embedding 接口单条 input 须 <512 tokens，中文宜偏小
CHUNK_EVENT_BODY_MAX = 320
CHUNK_EVENT_BODY_OVERLAP = 48
CHUNK_EVENT_HEAD_MAX = 320
CHUNK_EVENT_HEAD_OVERLAP = 40
CHUNK_POST_BODY_MAX = 320
CHUNK_POST_BODY_OVERLAP = 32

# 单条送入 embedding 的硬上限（字符级保险，避免 413）
_EMBED_CHAR_HARD_CAP = 400
_EMBED_BATCH_SIZE = 8


def _short_title_for_chunk(title: str, max_len: int = 72) -> str:
    t = (title or "").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


def _split_paragraphs(text: str) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


def _split_into_sentences(p: str) -> list[str]:
    """按句末标点切分，保留标点在本句末尾。"""
    p = p.strip()
    if not p:
        return []
    parts: list[str] = []
    start = 0
    for m in _SENTENCE_END.finditer(p):
        end = m.end()
        seg = p[start:end].strip()
        if seg:
            parts.append(seg)
        start = end
    tail = p[start:].strip()
    if tail:
        parts.append(tail)
    return parts if parts else [p]


def _hard_split(s: str, max_chars: int) -> list[str]:
    if len(s) <= max_chars:
        return [s] if s else []
    return [s[i : i + max_chars] for i in range(0, len(s), max_chars)]


def _pack_sentences_to_chunks(sentences: list[str], max_chars: int) -> list[str]:
    """将句子合并为长度不超过 max_chars 的块。"""
    chunks: list[str] = []
    buf = ""
    for sent in sentences:
        if not sent:
            continue
        if len(sent) > max_chars:
            if buf:
                chunks.append(buf)
                buf = ""
            chunks.extend(_hard_split(sent, max_chars))
            continue
        cand = f"{buf}{sent}" if buf else sent
        if len(cand) <= max_chars:
            buf = cand
        else:
            if buf:
                chunks.append(buf)
            buf = sent
    if buf:
        chunks.append(buf)
    return chunks


def _chunk_paragraph_with_overlap(p: str, max_chars: int, overlap_chars: int) -> list[str]:
    """单段内：句读 → 合并 → 超长硬切 → 块间重叠。"""
    sents = _split_into_sentences(p)
    raw = _pack_sentences_to_chunks(sents, max_chars)
    # 若某块仍超长（合并逻辑边界），再硬切
    flat: list[str] = []
    for c in raw:
        if len(c) <= max_chars:
            flat.append(c)
        else:
            flat.extend(_hard_split(c, max_chars))
    if overlap_chars <= 0 or len(flat) <= 1:
        return flat
    out: list[str] = [flat[0]]
    for i in range(1, len(flat)):
        prev = flat[i - 1]
        suf = prev[-overlap_chars:] if len(prev) > overlap_chars else prev
        out.append(suf + flat[i])
    return out


def _chunk_text_zh(text: str, max_chars: int, overlap_chars: int = 0) -> list[str]:
    """
    中文友好切片：空行分段 → 段内句读与合并 → 超长硬切 → 同段多块之间可选重叠。
    """
    paras = _split_paragraphs(text)
    if not paras:
        return []
    result: list[str] = []
    buf = ""
    for p in paras:
        cand = f"{buf}\n\n{p}" if buf else p
        if len(cand) <= max_chars:
            buf = cand
        else:
            if buf:
                result.extend(_chunk_paragraph_with_overlap(buf, max_chars, overlap_chars))
                buf = ""
            if len(p) <= max_chars:
                buf = p
            else:
                result.extend(_chunk_paragraph_with_overlap(p, max_chars, overlap_chars))
    if buf:
        result.extend(_chunk_paragraph_with_overlap(buf, max_chars, overlap_chars))
    return [x for x in result if x.strip()]


def _chunk_text(text: str, max_chars: int = 480) -> list[str]:
    """兼容旧调用：无重叠。"""
    return _chunk_text_zh(text, max_chars, 0)


def _embed_texts(client: OpenAI, model: str, texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    capped = [t[:_EMBED_CHAR_HARD_CAP] if len(t) > _EMBED_CHAR_HARD_CAP else t for t in texts]
    out: list[list[float]] = []
    for i in range(0, len(capped), _EMBED_BATCH_SIZE):
        batch = capped[i : i + _EMBED_BATCH_SIZE]
        resp = client.embeddings.create(model=model, input=batch)
        data = sorted(resp.data, key=lambda d: d.index)
        out.extend(list(d.embedding) for d in data)
    return out


def delete_chunks_for_source(session: Session, source_type: str, source_id: uuid.UUID) -> None:
    stmt = select(RagChunk).where(RagChunk.source_type == source_type, RagChunk.source_id == source_id)
    for ch in session.exec(stmt).all():
        session.delete(ch)


def index_campus_event(session: Session, event: CampusEvent) -> None:
    client = build_siliconflow_openai_client(session)
    if not client:
        return
    _, _, emb_model, _, _ = resolve_ai_settings(session)
    delete_chunks_for_source(session, "event", event.id)
    head = _chunk_text_zh(
        f"{event.title}\n{event.summary}",
        CHUNK_EVENT_HEAD_MAX,
        CHUNK_EVENT_HEAD_OVERLAP,
    )
    body_raw = _chunk_text_zh(
        strip_markdown_images(event.body),
        CHUNK_EVENT_BODY_MAX,
        CHUNK_EVENT_BODY_OVERLAP,
    )
    st = _short_title_for_chunk(event.title)
    body = [f"《{st}》\n{c}" for c in body_raw]
    texts = [p for p in (head + body) if p.strip()]
    if not texts:
        session.commit()
        return
    vectors = _embed_texts(client, emb_model, texts)
    settings = get_settings()
    dim = settings.EMBEDDING_DIMENSION
    for i, (t, vec) in enumerate(zip(texts, vectors)):
        if len(vec) != dim:
            continue
        session.add(
            RagChunk(
                source_type="event",
                source_id=event.id,
                campus_id=event.campus_id,
                chunk_index=i,
                content=t,
                meta={
                    "title": event.title,
                    "year": event.year,
                    "month": event.month,
                    "address": event.address,
                },
                embedding=vec,
            )
        )
    session.commit()


def index_alumni_post(session: Session, post: AlumniPost) -> None:
    if post.status != PostStatus.approved:
        return
    client = build_siliconflow_openai_client(session)
    if not client:
        return
    _, _, emb_model, _, _ = resolve_ai_settings(session)
    delete_chunks_for_source(session, "post", post.id)
    body_chunks = _chunk_text_zh(post.body, CHUNK_POST_BODY_MAX, CHUNK_POST_BODY_OVERLAP)
    texts: list[str] = []
    if post.excerpt and post.excerpt.strip():
        texts.append(post.excerpt.strip())
    texts.extend(body_chunks)
    texts = [t for t in texts if t.strip()]
    if not texts:
        session.commit()
        return
    vectors = _embed_texts(client, emb_model, texts)
    settings = get_settings()
    dim = settings.EMBEDDING_DIMENSION
    for i, (t, vec) in enumerate(zip(texts, vectors)):
        if len(vec) != dim:
            continue
        session.add(
            RagChunk(
                source_type="post",
                source_id=post.id,
                campus_id=post.campus_id,
                chunk_index=i,
                content=t,
                meta={"year": post.year, "month": post.month, "address": post.address},
                embedding=vec,
            )
        )
    session.commit()


def search_chunks(
    session: Session,
    query_embedding: list[float],
    campus_id: str,
    source_type: str,
    limit: int = 6,
) -> list[tuple[RagChunk, float]]:
    """Cosine distance (`<=>`) ascending; returns (chunk, distance)."""
    dim = get_settings().EMBEDDING_DIMENSION
    if len(query_embedding) != dim:
        return []
    vec_lit = "[" + ",".join(str(float(x)) for x in query_embedding) + "]"
    res = session.execute(
        text(
            """
            SELECT id, embedding <=> CAST(:qv AS vector) AS dist
            FROM ragchunk
            WHERE campus_id = :campus AND source_type = :stype
            ORDER BY dist
            LIMIT :lim
            """
        ),
        {"campus": campus_id, "stype": source_type, "qv": vec_lit, "lim": limit},
    )
    rows = [(row[0], float(row[1])) for row in res.fetchall()]
    if not rows:
        return []
    ids = [r[0] for r in rows]
    dist_map = {r[0]: r[1] for r in rows}
    chunks = list(session.exec(select(RagChunk).where(col(RagChunk.id).in_(ids))).all())
    order = {cid: i for i, cid in enumerate(ids)}
    ordered = sorted(chunks, key=lambda c: order.get(c.id, 999))
    return [(c, dist_map[c.id]) for c in ordered]
