"""
将「深圳大学_文章」等目录下的 md+json 经 DeepSeek 清洗为 docs/fact_based_articles/FACT_*.md。

去重规则（与历史批次合并）：
1) 若 fact_based_articles 已存在同名 FACT_{stem}.md，则跳过（同一文件 stem）。
2) 若「官方原文」URL 已在已有 FACT 文件或可选 registry 目录的 json 中出现过，则跳过（同文不同文件名）。

依赖：.env 中 DEEPSEEK_API_KEY；与 cleanup_szu_articles.py 相同提示词与输出格式。

用法示例：
  python scripts/process_sz_articles_to_facts.py
  python scripts/process_sz_articles_to_facts.py --source docs/深圳大学_文章 --registry-json docs/全部文章
  python scripts/process_sz_articles_to_facts.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path

# Windows 控制台默认 GBK，标题含 emoji 时 print 会崩
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import httpx
from dotenv import load_dotenv

load_dotenv()

DEFAULT_SOURCE = Path("docs/深圳大学_文章")
FACT_OUT = Path("docs/fact_based_articles")
URL_IN_FACT_MD = re.compile(
    r"- \*\*官方原文\*\*:\s*(https?://[^\s\n]+)|"
    r"- 官方原文:\s*(https?://[^\s\n]+)",
    re.IGNORECASE,
)

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")

PROMPT_FACT_EXTRACTOR = """
作为深圳大学（SZU）校园记忆守护者，请清洗并重构以下文章内容。

任务要求：
1. **内容相关性判定**：如果文章内容与深圳大学校内的活动、历史、建筑、人物或校园生活无关（例如是纯社会动态、通用技术文等），请在回复开头写 "SKIP"，无需输出其他。
2. **事实性重组**：若相关，请剔除所有抒情修辞、主观感言、非必要的空泛表述。
3. **原子级事实提取**：只保留客观、独立的事实。结构化为「时间/地点/事件/核心数据」。
4. **分主题归类**：指定 1-3 个客观主题标签。

---
文章原始正文：
{content}
---

请以 JSON 格式输出（不要包含 Markdown 代码块标记，只输出 JSON 本身）：
{{
  "is_relevant": true,
  "themes": ["主题1", "主题2"],
  "factual_summary": "提取后的客观事实段落，保持逻辑连贯且全是干货。"
}}
"""


def normalize_url(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    try:
        from urllib.parse import urlparse, urlunparse

        p = urlparse(u)
        # 微信文章：去掉 query 里无关参数，保留 path 为主键
        if "mp.weixin.qq.com" in (p.netloc or "").lower():
            return urlunparse((p.scheme, p.netloc.lower(), p.path.rstrip("/") or "/", "", "", "")).lower()
        return urlunparse((p.scheme, p.netloc.lower(), p.path, "", "", "")).lower()
    except Exception:
        return u.lower()


def collect_existing_stems(fact_dir: Path) -> set[str]:
    stems: set[str] = set()
    if not fact_dir.is_dir():
        return stems
    for p in fact_dir.glob("FACT_*.md"):
        name = p.stem
        if name.startswith("FACT_"):
            stems.add(name[5:])
    return stems


def collect_urls_from_fact_md_dir(fact_dir: Path) -> set[str]:
    urls: set[str] = set()
    if not fact_dir.is_dir():
        return urls
    for p in fact_dir.glob("FACT_*.md"):
        try:
            text = p.read_text(encoding="utf-8")
        except OSError:
            continue
        m = URL_IN_FACT_MD.search(text)
        if m:
            u = m.group(1) or m.group(2)
            nu = normalize_url(u)
            if nu:
                urls.add(nu)
    return urls


def collect_urls_from_json_dirs(dirs: list[Path]) -> set[str]:
    urls: set[str] = set()
    for d in dirs:
        if not d.is_dir():
            continue
        for jp in d.glob("*.json"):
            try:
                meta = json.loads(jp.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            u = meta.get("url") or meta.get("link")
            if isinstance(u, str):
                nu = normalize_url(u)
                if nu:
                    urls.add(nu)
    return urls


def build_registry(
    fact_dir: Path,
    extra_json_dirs: list[Path],
) -> tuple[set[str], set[str]]:
    stems = collect_existing_stems(fact_dir)
    urls = collect_urls_from_fact_md_dir(fact_dir)
    urls |= collect_urls_from_json_dirs(extra_json_dirs)
    return stems, urls


def select_candidates(
    all_stems: list[str],
    source_dir: Path,
    seen_stems: set[str],
    seen_urls: set[str],
) -> tuple[list[str], dict[str, int]]:
    """同步阶段：去重 + 同批次内 URL 互斥，避免并发重复请求。"""
    skip_counts: dict[str, int] = {}
    reserved_stems = set(seen_stems)
    reserved_urls = set(seen_urls)
    candidates: list[str] = []

    for item_stem in all_stems:
        json_path = source_dir / f"{item_stem}.json"
        md_path = source_dir / f"{item_stem}.md"
        if not json_path.exists() or not md_path.exists():
            skip_counts["missing_pair"] = skip_counts.get("missing_pair", 0) + 1
            continue
        if item_stem in reserved_stems:
            skip_counts["skip_stem"] = skip_counts.get("skip_stem", 0) + 1
            continue
        try:
            meta = json.loads(json_path.read_text(encoding="utf-8"))
            original_url = meta.get("url", "") or "未知 URL"
        except (OSError, json.JSONDecodeError):
            skip_counts["bad_json"] = skip_counts.get("bad_json", 0) + 1
            continue

        nu = normalize_url(original_url) if original_url != "未知 URL" else ""
        if nu and nu in reserved_urls:
            skip_counts["skip_url"] = skip_counts.get("skip_url", 0) + 1
            continue

        try:
            raw_body = md_path.read_text(encoding="utf-8")
        except OSError:
            skip_counts["read_error"] = skip_counts.get("read_error", 0) + 1
            continue
        if len(raw_body.strip()) < 50:
            skip_counts["skip_short"] = skip_counts.get("skip_short", 0) + 1
            continue

        reserved_stems.add(item_stem)
        if nu:
            reserved_urls.add(nu)
        candidates.append(item_stem)

    return candidates, skip_counts


async def process_item(
    item_stem: str,
    source_dir: Path,
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    *,
    dry_run: bool,
) -> tuple[str, str | None]:
    """仅处理已通过 select_candidates 的 stem。"""
    json_path = source_dir / f"{item_stem}.json"
    md_path = source_dir / f"{item_stem}.md"

    try:
        meta = json.loads(json_path.read_text(encoding="utf-8"))
        original_url = meta.get("url", "") or "未知 URL"
    except (OSError, json.JSONDecodeError) as e:
        return item_stem, f"bad_json:{e}"

    raw_body = md_path.read_text(encoding="utf-8")

    if dry_run:
        return item_stem, "would_process"

    async with semaphore:
        response = await client.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": "你是一个高度严谨的资料预处理器。只输出结构化 JSON，不废话。"},
                    {"role": "user", "content": PROMPT_FACT_EXTRACTOR.format(content=raw_body[:4000])},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.3,
            },
            timeout=90.0,
        )

    if response.status_code != 200:
        print(f"[!] API 错误 {item_stem}: {response.text}")
        return item_stem, "api_error"

    result_text = response.json()["choices"][0]["message"]["content"]
    if "SKIP" in result_text.upper():
        print(f"[-] 跳过非相关文章: {item_stem}")
        return item_stem, "irrelevant"

    try:
        data = json.loads(result_text)
    except json.JSONDecodeError:
        print(f"[!] JSON 解析失败 {item_stem}")
        return item_stem, "bad_llm_json"

    if not data.get("is_relevant"):
        print(f"[-] 判定不相关: {item_stem}")
        return item_stem, "irrelevant"

    FACT_OUT.mkdir(parents=True, exist_ok=True)
    final_filename = FACT_OUT / f"FACT_{item_stem}.md"
    with open(final_filename, "w", encoding="utf-8") as f:
        f.write(f"---主题: {', '.join(data['themes'])}---\n\n")
        f.write(f"### 事实精炼\n{data['factual_summary']}\n\n")
        f.write("---\n")
        f.write("**数据溯源：**\n")
        f.write(f"- **原始标题**: {item_stem}\n")
        f.write(f"- **官方原文**: {original_url}\n")

    print(f"[OK] 已重构事实: {item_stem}")
    return item_stem, "ok"


async def async_main(args: argparse.Namespace) -> None:
    source_dir = Path(args.source)
    if not source_dir.is_dir():
        print(f"错误：源目录不存在: {source_dir}")
        return

    extra_dirs = [Path(p) for p in args.registry_json]
    seen_stems, seen_urls = build_registry(FACT_OUT, extra_dirs)
    print(
        f"[*] 注册表：已有 FACT stem {len(seen_stems)} 个，"
        f"已见 URL {len(seen_urls)} 条（含 FACT 内链与额外 json 目录）",
    )

    all_stems = sorted({p.stem for p in source_dir.glob("*.json")})
    print(f"[*] 源目录 {source_dir} 共 {len(all_stems)} 篇 json，开始筛选…")

    candidates, skip_counts = select_candidates(all_stems, source_dir, seen_stems, seen_urls)
    print(f"[*] 去重后待处理: {len(candidates)} 篇（已跳过统计见下）")
    print("    ", json.dumps(skip_counts, ensure_ascii=False))

    if not DEEPSEEK_API_KEY and not args.dry_run:
        print("错误：请配置 DEEPSEEK_API_KEY（.env）")
        return

    if not candidates:
        print("[*] 无需调用 API。")
        return

    semaphore = asyncio.Semaphore(args.concurrency)

    async with httpx.AsyncClient(http2=True) as client:
        tasks = [
            process_item(
                stem,
                source_dir,
                client,
                semaphore,
                dry_run=args.dry_run,
            )
            for stem in candidates
        ]
        results = await asyncio.gather(*tasks)

    stats: dict[str, int] = dict(skip_counts)
    for _, st in results:
        key = st or "unknown"
        stats[key] = stats.get(key, 0) + 1
    print("\n[*] 统计:", json.dumps(stats, ensure_ascii=False, indent=2))
    if args.dry_run:
        print("[*] dry-run 未写入文件、未调用 API（would_process 表示会通过初筛）。")
    else:
        print(f"\n[FINISH] 结果目录: {FACT_OUT}")


def main() -> None:
    parser = argparse.ArgumentParser(description="去重后清洗深圳大学文章 → fact_based_articles")
    parser.add_argument("--source", type=str, default=str(DEFAULT_SOURCE), help="含成对 .md/.json 的目录")
    parser.add_argument(
        "--registry-json",
        type=str,
        nargs="*",
        default=["docs/全部文章"],
        help="额外扫描其中 *.json 的 url 用于去重（可多个目录；目录不存在则忽略）",
    )
    parser.add_argument("--concurrency", type=int, default=10, help="DeepSeek 并发上限")
    parser.add_argument("--dry-run", action="store_true", help="只打印统计，不写文件、不调 API")
    args = parser.parse_args()
    asyncio.run(async_main(args))


if __name__ == "__main__":
    main()
