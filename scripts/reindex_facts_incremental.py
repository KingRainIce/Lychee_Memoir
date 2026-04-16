"""
在不清库的前提下，把 fact_based_articles 里「尚未写入库」的 FACT_*.md
注入 CampusEvent + RagChunk（与 reindex_facts_v2.py 同逻辑）。

去重依据：CampusEvent.id == uuid5(NAMESPACE_DNS, title)，title 与 v2 一致为
文件名去掉 FACT_ 前缀后的 stem。

用法：
  python scripts/reindex_facts_incremental.py
  python scripts/reindex_facts_incremental.py --dry-run
"""

from __future__ import annotations

import argparse
import re
import uuid
from pathlib import Path

from dotenv import load_dotenv
from sqlmodel import Session, create_engine, select

import sys

backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.append(str(backend_path))

from app.models import CampusEvent, RagChunk
from app.services.rag_index import _chunk_text_zh, _embed_texts, CHUNK_EVENT_BODY_MAX, CHUNK_EVENT_BODY_OVERLAP
from app.services.ai_settings import build_siliconflow_openai_client, resolve_ai_settings
from app.config import get_settings

load_dotenv()

FACT_DIR = Path("docs/fact_based_articles")
DB_URL = "postgresql+psycopg://szu:szu@localhost:5432/szu_memoir"
engine = create_engine(DB_URL)


def fact_stem_to_title(stem: str) -> str:
    if stem.startswith("FACT_"):
        return stem[5:]
    return stem


def extract_meta(content: str) -> tuple[str, str, str]:
    theme = ""
    url = ""
    theme_match = re.search(r"---主题:\s*(.*?)\s*---", content)
    if theme_match:
        theme = theme_match.group(1).strip()
    url_match = re.search(r"- \*\*官方原文\*\*:\s*(https?://[^\s\n]+)", content)
    if not url_match:
        url_match = re.search(r"- 官方原文:\s*(https?://[^\s\n]+)", content)
    if url_match:
        url = url_match.group(1).strip()
    body_match = re.search(r"### 事实精炼\s*(.*?)\s*(?:---|\Z)", content, re.DOTALL)
    body = body_match.group(1).strip() if body_match else content
    return theme, url, body


def ingest_one_file(
    session: Session,
    f: Path,
    client,
    emb_model: str,
    dim: int,
    *,
    dry_run: bool,
) -> str:
    title = fact_stem_to_title(f.stem)
    event_id = uuid.uuid5(uuid.NAMESPACE_DNS, title)

    existing = session.get(CampusEvent, event_id)
    if existing is not None:
        return "skip_exists"

    content = f.read_text(encoding="utf-8")
    theme, url, body = extract_meta(content)

    if dry_run:
        print(f"  [dry-run] 将新增: {title}")
        return "would_insert"

    full_body = (
        f"{body}\n\n---\n\n> [!TIP]\n> 本内容由 AI 提炼自原文事实。\n\n[查看大荔知原文链接]({url})"
    )
    event = CampusEvent(
        id=event_id,
        campus_id="yuehai",
        year=2024,
        month=6,
        title=title,
        summary=f"关于 {theme} 的事实总结",
        body=full_body,
        address="深圳大学",
        image_url="https://picsum.photos/seed/szu_fact/800/450",
    )
    session.add(event)
    session.flush()

    body_raw = _chunk_text_zh(body, CHUNK_EVENT_BODY_MAX, CHUNK_EVENT_BODY_OVERLAP)
    texts = [f"《{title}》| {theme}\n{c}" for c in body_raw]
    if not texts:
        session.commit()
        return "ok_no_chunks"

    vectors = _embed_texts(client, emb_model, texts)
    for i, (t, vec) in enumerate(zip(texts, vectors)):
        if len(vec) != dim:
            continue
        chunk = RagChunk(
            source_type="event",
            source_id=event.id,
            campus_id=event.campus_id,
            chunk_index=i,
            content=t,
            meta={"title": title, "url": url, "theme": theme},
            embedding=vec,
        )
        session.add(chunk)
    session.commit()
    print(f"  [OK] 已入库+向量: {title} ({len(texts)} chunks)")
    return "inserted"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fact-dir", type=str, default=str(FACT_DIR))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    fact_dir = Path(args.fact_dir)

    files = sorted(fact_dir.glob("FACT_*.md"))
    if not files:
        print("[!] 未找到 FACT_*.md")
        return

    with Session(engine) as session:
        client = build_siliconflow_openai_client(session)
        if not client and not args.dry_run:
            print("[!] 无法创建 AI Client，检查 .env / 数据库配置")
            return
        _, _, emb_model, _, _ = resolve_ai_settings(session)
        dim = get_settings().EMBEDDING_DIMENSION

        print(f"[*] 扫描 {len(files)} 个 FACT 文件，增量写入（已存在同 id 则跳过）…")
        stats: dict[str, int] = {}
        for f in files:
            try:
                st = ingest_one_file(
                    session,
                    f,
                    client,
                    emb_model,
                    dim,
                    dry_run=args.dry_run,
                )
            except Exception as e:
                print(f"  [!] 失败 {f.name}: {e}")
                session.rollback()
                st = "error"
            stats[st] = stats.get(st, 0) + 1
        print("\n[*] 完成:", stats)


if __name__ == "__main__":
    main()
