import json
import logging
import uuid
from collections.abc import Iterator
from typing import Any

import httpx
from sqlmodel import Session

from app.config import get_settings
from app.models import AlumniPost, CampusEvent, User

logger = logging.getLogger(__name__)
from app.schemas import RagChatRequest, RagCitation, RagChatResponse
from app.services.ai_settings import build_siliconflow_openai_client, resolve_ai_settings
from app.services.rag_index import _embed_texts, search_chunks

try:
    from openai import APIConnectionError, APITimeoutError

    _OPENAI_NET_ERRORS: tuple[type[BaseException], ...] = (APITimeoutError, APIConnectionError)
except ImportError:  # pragma: no cover
    _OPENAI_NET_ERRORS = ()

MAX_SLICE_CHARS = 4000
MAX_AGENT_STEPS = 8
EXCERPT_FOR_MODEL = 420


def _memory_tools() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "search_campus_memory",
                "description": (
                    "检索「深大记忆」站内向量库中的校史事件与校友帖子原文切片。"
                    "仅在需要校内事实、时间、地点、活动、人名或帖子内容时调用；"
                    "日常寒暄、编程帮助、与深大记忆无关的泛泛闲聊不要调用。"
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "用于向量检索的短语，可改写为用户问题的核心关键词以提高命中率",
                        },
                        "scope": {
                            "type": "string",
                            "enum": ["all", "events", "posts"],
                            "description": (
                                "检索范围：all=校史事件与校友帖子都查（默认）；"
                                "events=仅校史记录；posts=仅校友帖子。用户明确只要其中一类时用对应值。"
                            ),
                        },
                    },
                    "required": ["query"],
                },
            },
        }
    ]


def _load_post_author(session: Session, pid: uuid.UUID) -> str:
    post = session.get(AlumniPost, pid)
    if not post:
        return str(pid)
    u = session.get(User, post.author_id)
    if u and u.display_name:
        return u.display_name
    if u:
        return u.email.split("@")[0]
    return "校友"


def _meta_ym(meta: dict[str, Any]) -> tuple[int, int]:
    y = int(meta.get("year", 0))
    m = int(meta.get("month", 12))
    return y, m


def _not_after_ctx(meta: dict[str, Any], ctx_y: int, ctx_m: int) -> bool:
    y, m = _meta_ym(meta)
    return (y, m) <= (ctx_y, ctx_m)


def _is_upstream_timeout_or_connect(exc: BaseException) -> bool:
    if _OPENAI_NET_ERRORS and isinstance(exc, _OPENAI_NET_ERRORS):
        return True
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout)):
        return True
    if exc.__cause__ is not None:
        return _is_upstream_timeout_or_connect(exc.__cause__)
    msg = str(exc).lower()
    return "timed out" in msg or "timeout" in msg


def _is_upstream_auth_401(exc: BaseException) -> bool:
    try:
        from openai import APIStatusError, AuthenticationError

        if isinstance(exc, AuthenticationError):
            return True
        if isinstance(exc, APIStatusError) and getattr(exc, "status_code", None) == 401:
            return True
    except ImportError:
        pass
    if exc.__cause__ is not None:
        return _is_upstream_auth_401(exc.__cause__)
    s = str(exc).lower()
    return "401" in str(exc) and ("api key" in s or "invalid" in s or "unauthorized" in s)


def _rag_error_response(session: Session, e: BaseException) -> RagChatResponse:
    logger.exception("rag_chat failed")
    _, key, _, _, src = resolve_ai_settings(session)
    if _is_upstream_timeout_or_connect(e) and key:
        src_cn = {"env": "环境变量", "database": "数据库", "none": "未配置"}.get(src, src)
        base, _, _, _, _ = resolve_ai_settings(session)
        tout = float(get_settings().SILICONFLOW_HTTP_TIMEOUT)
        return RagChatResponse(
            answer=(
                "后端已加载硅基流动 API 密钥（来源："
                f"{src_cn}），本次是请求超时或无法连接上游，不是「没配 Key」。"
                f" 当前生效 Base：{base}；读超时约 {tout:.0f} 秒（可在环境变量 SILICONFLOW_HTTP_TIMEOUT 调大）。"
                " 请检查：Docker/本机能否访问该域名、是否需要代理、DNS 是否正常。"
                " 管理员可打开 GET /api/admin/ai-diagnostics 核对配置（不发外网请求）。"
                f" 技术信息：{type(e).__name__}"
            ),
            events=[],
            posts=[],
        )
    if _is_upstream_auth_401(e) and key:
        src_cn = {"env": "环境变量", "database": "数据库", "none": "未配置"}.get(src, src)
        return RagChatResponse(
            answer=(
                "硅基流动返回 401：上游判定当前 Key 无效（与「没连上网」不同）。"
                f" 当前密钥来源：{src_cn}。"
                " 后端不会对 Key 做额外加密或改写；请打开「API 设置」查看自检里的「密钥字符数」是否与控制台复制的 sk- 长度一致。"
                " 若字符数恰好为 500，多半是旧版库表截断了长密钥，请拉取最新代码并执行数据库迁移后重新粘贴完整 Key 保存。"
                " 另请确认 Base URL 与控制台文档一致：国内一般为 https://api.siliconflow.cn/v1（勿与 .com 混用），且无多余空格。"
            ),
            events=[],
            posts=[],
        )
    hint = str(e).strip() or type(e).__name__
    if len(hint) > 200:
        hint = hint[:200] + "…"
    return RagChatResponse(
        answer=(
            "记忆助手调用失败（已避免整页报错）。请检查：① 管理员「API 设置」或环境变量里的 Key / 模型名是否正确；"
            "② 网络能否访问硅基流动；③ 数据库向量检索是否正常。"
            f" 详情：{hint}"
        ),
        events=[],
        posts=[],
    )


def _citation_key(c: RagCitation) -> tuple[str, str, str]:
    return (c.source_type, c.source_id, (c.snippet or "")[:200])


def _merge_rag_citations(
    ev_acc: list[RagCitation],
    po_acc: list[RagCitation],
    ev_new: list[RagCitation],
    po_new: list[RagCitation],
) -> tuple[list[RagCitation], list[RagCitation]]:
    seen = {_citation_key(c) for c in ev_acc + po_acc}
    for c in ev_new:
        k = _citation_key(c)
        if k not in seen:
            seen.add(k)
            ev_acc.append(c)
    for c in po_new:
        k = _citation_key(c)
        if k not in seen:
            seen.add(k)
            po_acc.append(c)
    return ev_acc, po_acc


def _event_image_url(session: Session, sid: uuid.UUID) -> str | None:
    ev = session.get(CampusEvent, sid)
    if not ev or not (ev.image_url or "").strip():
        return None
    return ev.image_url


def _post_image_url(session: Session, sid: uuid.UUID) -> str | None:
    p = session.get(AlumniPost, sid)
    if not p or not (p.image_url or "").strip():
        return None
    return p.image_url


def _to_citation(session: Session, c: Any, is_event: bool, dist: float) -> RagCitation:
    sid = c.source_id if isinstance(c.source_id, uuid.UUID) else uuid.UUID(str(c.source_id))
    title = c.meta.get("title") if is_event else _load_post_author(session, sid)
    if not is_event and not title:
        title = "帖子"
    score = round(1.0 / (1.0 + dist), 4)
    raw = (c.content or "").strip()
    if len(raw) > MAX_SLICE_CHARS:
        raw = raw[:MAX_SLICE_CHARS] + "…"
    img = _event_image_url(session, sid) if is_event else _post_image_url(session, sid)
    return RagCitation(
        source_type="event" if is_event else "post",
        source_id=str(sid),
        title=str(title),
        snippet=raw,
        score=score,
        image_url=img,
    )


def _vector_search_for_query(
    session: Session,
    body: RagChatRequest,
    client: Any,
    emb_model: str,
    search_query: str,
    *,
    scope: str = "all",
) -> tuple[list[RagCitation], list[RagCitation], dict[str, Any]]:
    qvec = _embed_texts(client, emb_model, [search_query])
    if not qvec:
        return [], [], {"ok": False, "error": "无法生成查询向量，请检查 embedding 模型配置。"}
    query_embedding = qvec[0]
    sc = (scope or "all").strip().lower()
    if sc not in ("all", "events", "posts"):
        sc = "all"
    ev_chunks: list[tuple[Any, float]] = []
    post_chunks: list[tuple[Any, float]] = []
    if sc in ("all", "events"):
        ev_chunks = search_chunks(session, query_embedding, body.campus_id, "event", limit=8)
    if sc in ("all", "posts"):
        post_chunks = search_chunks(session, query_embedding, body.campus_id, "post", limit=8)
    if not body.is_latest and body.year is not None:
        ctx_m = body.month if body.month is not None else 12
        ev_chunks = [(c, d) for c, d in ev_chunks if _not_after_ctx(c.meta, body.year, ctx_m)]
        post_chunks = [(c, d) for c, d in post_chunks if _not_after_ctx(c.meta, body.year, ctx_m)]
    ev_cits = [_to_citation(session, c, True, d) for c, d in ev_chunks]
    po_cits = [_to_citation(session, c, False, d) for c, d in post_chunks]
    hits: list[dict[str, str]] = []
    for c in ev_cits:
        ex = (c.snippet or "")[:EXCERPT_FOR_MODEL]
        hits.append({"type": "event", "title": c.title, "excerpt": ex})
    for c in po_cits:
        ex = (c.snippet or "")[:EXCERPT_FOR_MODEL]
        hits.append({"type": "post", "title": c.title, "excerpt": ex})
    payload = {
        "ok": True,
        "scope": sc,
        "hit_count": len(ev_cits) + len(po_cits),
        "hits": hits,
        "hint": "界面将展示配图卡片；请据此作答，勿编造未出现在 hits 中的事实。",
    }
    return ev_cits, po_cits, payload


def _system_prompt(body: RagChatRequest) -> str:
    ctx_m = body.month if body.month is not None else 12
    if body.is_latest:
        time_line = "时间模式：最新（检索不过滤年月，仍可按需调用工具）。"
    elif body.year is not None:
        time_line = f"时间模式：历史时间轴，截至 {body.year}-{ctx_m:02d}（工具检索结果会按此过滤）。"
    else:
        time_line = "时间模式：未指定历史月份（与「最新」一致处理）。"
    return (
        "你是「深大记忆」网站的对话助手，帮助用户了解深圳大学校史与校友分享。\n"
        "你可以使用工具 search_campus_memory：仅在需要查询站内校史事件、校友帖子、地点与时间等事实时调用；"
        "参数 query 会单独做向量检索，请写成简短、可检索的关键词或短语；"
        "可选参数 scope：all（默认，校史+帖子）、events（仅校史）、posts（仅帖子）。\n"
        "不要为调用工具而调用：闲聊、问候、与站内记忆无关的问题请直接自然回复。\n"
        f"当前校区 campus_id：{body.campus_id}。{time_line}\n"
        "用户界面会在你调用工具后展示检索到的原文卡片；请结合工具返回的 hits 摘要作答，语气自然，不要大段复述原文。"
    )


def _build_initial_messages(body: RagChatRequest) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = [{"role": "system", "content": _system_prompt(body)}]
    for turn in body.history or []:
        if turn.role not in ("user", "assistant"):
            continue
        c = (turn.content or "").strip()
        if not c:
            continue
        out.append({"role": turn.role, "content": c[:8000]})
    out.append({"role": "user", "content": body.message.strip()[:8000]})
    return out


def _msg_to_dict(msg: Any) -> dict[str, Any]:
    if hasattr(msg, "model_dump"):
        return msg.model_dump(exclude_none=True)
    raise TypeError("unsupported message type")


def _chunk_text_for_stream(text: str, chunk_size: int = 28) -> list[str]:
    if not text:
        return []
    return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]


def _memory_agent_events(
    session: Session,
    body: RagChatRequest,
) -> Iterator[tuple[str, Any]]:
    """
    Yields:
      ("fatal", RagChatResponse) — 配置错误等，应立即结束
      ("citations", (ev_list, po_list)) — 累积引用更新
      ("final_text", str) — 模型最终自然语言（无后续工具）
    """
    client = build_siliconflow_openai_client(session)
    if not client:
        yield (
            "fatal",
            RagChatResponse(
                answer="尚未配置硅基流动 API：请在管理员「API 设置」中填写 Base URL 与 Key，或在服务器环境变量设置 SILICONFLOW_API_KEY。",
                events=[],
                posts=[],
            ),
        )
        return
    _, _, emb_model, chat_model, _ = resolve_ai_settings(session)
    messages: list[dict[str, Any]] = _build_initial_messages(body)
    tools = _memory_tools()
    all_ev: list[RagCitation] = []
    all_po: list[RagCitation] = []

    for _ in range(MAX_AGENT_STEPS):
        base_kw: dict[str, Any] = {
            "model": chat_model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "temperature": 0.55,
            "stream": False,
        }
        try:
            resp = client.chat.completions.create(**base_kw, parallel_tool_calls=False)
        except TypeError:
            resp = client.chat.completions.create(**base_kw)
        msg = resp.choices[0].message
        tcalls = getattr(msg, "tool_calls", None) or []
        if tcalls:
            messages.append(_msg_to_dict(msg))
            for tc in tcalls:
                fn = tc.function
                name = fn.name
                try:
                    args = json.loads(fn.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                if name != "search_campus_memory":
                    out = json.dumps({"ok": False, "error": f"未知工具：{name}"}, ensure_ascii=False)
                else:
                    q = (args.get("query") or "").strip()
                    if not q:
                        out = json.dumps({"ok": False, "error": "query 不能为空"}, ensure_ascii=False)
                    else:
                        scope_arg = (args.get("scope") or "all").strip().lower()
                        if scope_arg not in ("all", "events", "posts"):
                            scope_arg = "all"
                        ev, po, payload = _vector_search_for_query(
                            session, body, client, emb_model, q, scope=scope_arg
                        )
                        if not payload.get("ok", True):
                            out = json.dumps(payload, ensure_ascii=False)
                        else:
                            all_ev, all_po = _merge_rag_citations(all_ev, all_po, ev, po)
                            yield ("citations", (list(all_ev), list(all_po)))
                            out = json.dumps(payload, ensure_ascii=False)
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": out})
            continue
        text = (msg.content or "").strip()
        yield ("final_text", text)
        return

    yield ("final_text", "工具调用轮次过多，请缩短或拆分问题后再试。")


def run_rag_chat(session: Session, body: RagChatRequest) -> RagChatResponse:
    try:
        answer = ""
        ev: list[RagCitation] = []
        po: list[RagCitation] = []
        for kind, data in _memory_agent_events(session, body):
            if kind == "fatal":
                return data
            if kind == "citations":
                ev, po = data[0], data[1]
            elif kind == "final_text":
                answer = data
        return RagChatResponse(answer=answer, events=ev, posts=po)
    except Exception as e:
        logger.exception("rag_chat failed")
        return _rag_error_response(session, e)


def _sse(ev: str, data: dict[str, Any]) -> str:
    return f"event: {ev}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def iter_rag_chat_sse(session: Session, body: RagChatRequest) -> Iterator[str]:
    try:
        for kind, data in _memory_agent_events(session, body):
            if kind == "fatal":
                yield _sse("final", data.model_dump(mode="json"))
                yield _sse("done", {})
                return
            if kind == "citations":
                ev, po = data[0], data[1]
                yield _sse(
                    "citations",
                    {
                        "events": [c.model_dump(mode="json") for c in ev],
                        "posts": [c.model_dump(mode="json") for c in po],
                    },
                )
            elif kind == "final_text":
                for part in _chunk_text_for_stream(data, 28):
                    yield _sse("token", {"text": part})
        yield _sse("done", {})
    except Exception as e:
        logger.exception("rag_chat stream failed")
        err = _rag_error_response(session, e)
        yield _sse("final", err.model_dump(mode="json"))
        yield _sse("done", {})
