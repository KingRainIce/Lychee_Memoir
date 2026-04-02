"""
从「成对」的 .docx + .json 导入校史事件到数据库（CampusEvent）。

约定（每篇文章）：
  - 仅读取同名的 .docx 与 .json（忽略 .md）。
  - JSON：至少含 id、title；建议含 year、month；若无则从 publish_time（Unix 秒）推导。
    可选：url、pic_url、description、publish_time；可选手动覆盖 address。
  - DOCX：按段落/表格单元顺序抽取文字与内嵌图片；正文写入 body 为 Markdown 文本
   （段落为纯文本行，图片为 ![](URL)），便于前端按顺序渲染。
  - campus_id 固定为 yuehai。
  - summary：正文第一个非空段落（纯文本）。
  - address：全文（各段纯文本拼接）中，按 annotations 里 label 命中的「最先出现」地点；
    若无命中则用 JSON 的 address 字段，再否则「深圳大学粤海校区」。

用法（在 backend 目录下，需已配置 DATABASE_URL，与运行 API 相同环境）：

  pip install -r requirements.txt
  python scripts/import_campus_articles_from_docx.py "../docs/全部文章"
  python scripts/import_campus_articles_from_docx.py "../docs/全部文章" --dry-run
  python scripts/import_campus_articles_from_docx.py "../docs/全部文章" --annotations "../frontend/public/annotations.json"

导入的图片写入 backend/app/uploads/event_import/，URL 路径为 /api/media/event_import/<文件名>。
同一 json id 重复导入：使用确定性 UUID，已存在则跳过（可用 --force 更新标题/摘要/正文等字段）。
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import uuid
from pathlib import Path

# 保证可从 backend 根目录以「python scripts/...」运行
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from docx.document import Document as DocumentType
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.oxml.ns import qn
from docx.table import Table, _Cell
from docx.text.paragraph import Paragraph
from docx import Document
from sqlmodel import Session

from app.db import engine
from app.models import CampusEvent
from app.places import resolve_map_binding
from app.services.rag_index import index_campus_event

# 与 seed / API 一致的稳定命名空间，避免重复导入产生多条主键
_IMPORT_NS = uuid.uuid5(uuid.NAMESPACE_DNS, "szu-memoir.campus-article-import")

MEDIA_PREFIX = "/api/media/event_import"


def _iter_block_items(parent: DocumentType | _Cell):
    if isinstance(parent, DocumentType):
        parent_elm = parent.element.body
    elif isinstance(parent, _Cell):
        parent_elm = parent._tc
    else:
        raise ValueError("parent must be Document or _Cell")
    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)


def _run_embed_id(run) -> str | None:
    el = run._element
    blips = el.findall(".//{http://schemas.openxmlformats.org/drawingml/2006/main}blip")
    if not blips:
        return None
    eid = blips[0].get(qn("r:embed"))
    return eid if eid else None


_CT_TO_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
}


def _ext_for_content_type(ct: str | None) -> str:
    if not ct:
        return "bin"
    return _CT_TO_EXT.get(ct.split(";")[0].strip().lower(), "bin")


def _slug_from_stem(stem: str) -> str:
    s = re.sub(r"[^\w\u4e00-\u9fff\-]+", "_", stem).strip("_")
    base = (s[:40] if s else "article") or "article"
    h = hashlib.sha256(stem.encode("utf-8")).hexdigest()[:10]
    return f"{base}_{h}"


def _load_place_labels(annotations_path: Path | None) -> list[str]:
    paths: list[Path] = []
    if annotations_path and annotations_path.is_file():
        paths.append(annotations_path)
    repo = _BACKEND_ROOT.parent
    paths.extend(
        [
            repo / "frontend" / "public" / "annotations.json",
            repo / "frontend-demo" / "public" / "annotations.json",
            _BACKEND_ROOT / "data" / "annotations.json",
        ],
    )
    for p in paths:
        try:
            with open(p, encoding="utf-8") as f:
                data = json.load(f)
            items = data.get("items")
            if not isinstance(items, list):
                continue
            labels: list[str] = []
            for it in items:
                if isinstance(it, dict):
                    lb = it.get("label")
                    if isinstance(lb, str) and lb.strip():
                        labels.append(lb.strip())
            if labels:
                return labels
        except (OSError, json.JSONDecodeError):
            continue
    return []


def _first_place_in_text(text: str, labels: list[str]) -> str | None:
    if not text.strip() or not labels:
        return None
    # 长 label 优先参与「同位置」比较
    by_len = sorted(set(labels), key=len, reverse=True)
    best: tuple[int, str] | None = None
    for lb in by_len:
        idx = text.find(lb)
        if idx < 0:
            continue
        if best is None or idx < best[0] or (idx == best[0] and len(lb) > len(best[1])):
            best = (idx, lb)
    return best[1] if best else None


def _year_month(meta: dict) -> tuple[int, int]:
    if "year" in meta and "month" in meta:
        return int(meta["year"]), int(meta["month"])
    ts = meta.get("publish_time")
    if isinstance(ts, (int, float)):
        d = dt.datetime.fromtimestamp(float(ts), tz=dt.timezone.utc)
        return d.year, d.month
    raise ValueError("JSON 中缺少 year/month，且无法从 publish_time 推导")


def docx_to_markdown_and_plain(
    docx_path: Path,
    img_dir: Path,
    slug: str,
    *,
    dry_run: bool,
) -> tuple[str, str, str]:
    """返回 (markdown_body, first_paragraph, full_plain_for_match)。"""
    doc = Document(str(docx_path))
    out_md: list[str] = []
    plain_parts: list[str] = []
    counter = [0]

    def paragraph_to_md(paragraph: Paragraph) -> None:
        for run in paragraph.runs:
            rid = _run_embed_id(run)
            if rid:
                try:
                    part = doc.part.related_parts[rid]
                except KeyError:
                    continue
                blob = part.blob
                if not blob:
                    continue
                counter[0] += 1
                ext = _ext_for_content_type(getattr(part, "content_type", None))
                fname = f"{slug}_{counter[0]}.{ext}"
                if not dry_run:
                    img_dir.mkdir(parents=True, exist_ok=True)
                    (img_dir / fname).write_bytes(blob)
                url = f"{MEDIA_PREFIX}/{fname}"
                out_md.append(f"\n\n![]({url})\n\n")
            elif run.text:
                out_md.append(run.text)
        out_md.append("\n\n")

    def walk_block(block) -> None:
        if isinstance(block, Paragraph):
            paragraph_to_md(block)
            t = block.text.strip()
            if t:
                plain_parts.append(t)
        elif isinstance(block, Table):
            for row in block.rows:
                for cell in row.cells:
                    for child in _iter_block_items(cell):
                        walk_block(child)

    for block in _iter_block_items(doc):
        walk_block(block)

    md = "".join(out_md).strip()
    md = re.sub(r"\n{3,}", "\n\n", md).strip()
    full_plain = "\n".join(plain_parts)
    first_para = plain_parts[0] if plain_parts else ""
    return md, first_para, full_plain


def _stable_event_id(source_id: str) -> uuid.UUID:
    return uuid.uuid5(_IMPORT_NS, str(source_id).strip())


def import_folder(
    folder: Path,
    *,
    dry_run: bool,
    annotations_path: Path | None,
    force: bool,
) -> int:
    labels = _load_place_labels(annotations_path)
    json_files = sorted(folder.glob("*.json"))
    uploads = _BACKEND_ROOT / "app" / "uploads" / "event_import"
    if not dry_run:
        uploads.mkdir(parents=True, exist_ok=True)

    ok = 0
    skipped = 0
    errors = 0

    for jpath in json_files:
        stem = jpath.stem
        docx_path = jpath.with_suffix(".docx")
        if not docx_path.is_file():
            continue
        try:
            with open(jpath, encoding="utf-8") as f:
                meta = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            print(f"[skip] {jpath.name}: JSON 无效 ({e})")
            errors += 1
            continue
        if not isinstance(meta, dict):
            print(f"[skip] {jpath.name}: JSON 根须为对象")
            errors += 1
            continue
        sid = meta.get("id")
        title = meta.get("title")
        if not sid or not title:
            print(f"[skip] {jpath.name}: 缺少 id 或 title")
            errors += 1
            continue
        try:
            year, month = _year_month(meta)
        except ValueError as e:
            print(f"[skip] {jpath.name}: {e}")
            errors += 1
            continue

        slug = _slug_from_stem(stem)
        try:
            md_body, first_para, full_plain = docx_to_markdown_and_plain(
                docx_path, uploads, slug, dry_run=dry_run
            )
        except Exception as e:
            print(f"[err] {jpath.name}: 读取 docx 失败: {e}")
            errors += 1
            continue

        summary = (first_para or "").strip() or (title.strip() if isinstance(title, str) else "")

        src_url = meta.get("url")
        if isinstance(src_url, str) and src_url.strip():
            u = src_url.strip()
            md_body = f"{md_body}\n\n来源：{u}".strip()

        addr_override = meta.get("address")
        if isinstance(addr_override, str) and addr_override.strip():
            address = addr_override.strip()
        else:
            hit = _first_place_in_text(full_plain, labels)
            address = hit if hit else "深圳大学粤海校区"

        pic = meta.get("pic_url") or meta.get("image_url") or ""
        image_url = pic if isinstance(pic, str) else ""

        ev_id = _stable_event_id(str(sid))
        campus_id = "yuehai"

        if dry_run:
            print(f"[dry-run] would import {jpath.name} -> id={ev_id} {year}-{month:02d} [{title}]")
            print(f"          address={address!r} summary_len={len(summary)} body_len={len(md_body)}")
            ok += 1
            continue

        with Session(engine) as session:
            existing = session.get(CampusEvent, ev_id)
            if existing and not force:
                print(f"[skip] exists {jpath.name} db_id={ev_id}")
                skipped += 1
                continue

            nx, ny, lng, lat = resolve_map_binding(campus_id, None, None, None, 0.0, 0.0)
            payload = dict(
                id=ev_id,
                campus_id=campus_id,
                year=year,
                month=month,
                lng=lng,
                lat=lat,
                nx=nx,
                ny=ny,
                place_id=None,
                title=str(title)[:500],
                summary=summary,
                body=md_body,
                image_url=str(image_url)[:2000] if image_url else "",
                address=str(address)[:500],
            )
            if existing and force:
                for k, v in payload.items():
                    if k == "id":
                        continue
                    setattr(existing, k, v)
                session.add(existing)
                session.commit()
                session.refresh(existing)
                index_campus_event(session, existing)
            else:
                ev = CampusEvent(**payload)
                session.add(ev)
                session.commit()
                session.refresh(ev)
                index_campus_event(session, ev)
            print(f"[ok] {jpath.name} -> {ev_id}")
            ok += 1

    print(f"完成: 成功/跳过/错误 = {ok}/{skipped}/{errors}（仅统计本次处理的 .json+.docx 对）")
    return 0 if errors == 0 else 1


def _stdio_utf8() -> None:
    if sys.platform == "win32":
        for s in (sys.stdout, sys.stderr):
            try:
                s.reconfigure(encoding="utf-8")
            except Exception:
                pass


def main() -> int:
    _stdio_utf8()
    parser = argparse.ArgumentParser(description="从 docx+json 导入校史 CampusEvent")
    parser.add_argument("folder", type=Path, help="文章目录，如 docs/全部文章")
    parser.add_argument("--dry-run", action="store_true", help="只打印，不写库、不写图片")
    parser.add_argument("--annotations", type=Path, default=None, help="annotations.json 路径（地点词典）")
    parser.add_argument("--force", action="store_true", help="已存在则更新该条")
    args = parser.parse_args()
    folder = args.folder.resolve()
    if not folder.is_dir():
        print(f"目录不存在: {folder}", file=sys.stderr)
        return 1
    return import_folder(
        folder,
        dry_run=args.dry_run,
        annotations_path=args.annotations.resolve() if args.annotations else None,
        force=args.force,
    )


if __name__ == "__main__":
    raise SystemExit(main())
