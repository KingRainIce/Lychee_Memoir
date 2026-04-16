import os
import json
import asyncio
import httpx
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# 配置
SOURCE_DIR = Path("docs/全部文章")
CLEANED_DIR = Path("docs/fact_based_articles")
CLEANED_DIR.mkdir(parents=True, exist_ok=True)

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

async def process_item(item_stem: str, client: httpx.AsyncClient, semaphore: asyncio.Semaphore):
    async with semaphore:
        json_path = SOURCE_DIR / f"{item_stem}.json"
        md_path = SOURCE_DIR / f"{item_stem}.md"

        if not json_path.exists() or not md_path.exists():
            return

        try:
            # 1. 提取 URL
            with open(json_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
                original_url = meta.get('url', '未知 URL')

            # 2. 提取正文
            raw_body = md_path.read_text(encoding='utf-8')
            if len(raw_body.strip()) < 50:
                 # 跳过字数太少的碎碎念
                 return

            # 3. AI 调用
            response = await client.post(
                f"{DEEPSEEK_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": "你是一个高度严谨的资料预处理器。只输出结构化 JSON，不废话。"},
                        {"role": "user", "content": PROMPT_FACT_EXTRACTOR.format(content=raw_body[:4000])} # 截断防止超出上下文
                    ],
                    "response_format": { "type": "json_object" },
                    "temperature": 0.3
                },
                timeout=90.0
            )

            if response.status_code != 200:
                print(f"[!] API 错误 {item_stem}: {response.text}")
                return

            result_text = response.json()['choices'][0]['message']['content']
            
            if "SKIP" in result_text.upper():
                print(f"[-] 跳过非相关文章: {item_stem}")
                return

            data = json.loads(result_text)
            
            if not data.get("is_relevant"):
                 print(f"[-] 判定不相关: {item_stem}")
                 return

            # 4. 生成整理后的事实文档
            final_filename = CLEANED_DIR / f"FACT_{item_stem}.md"
            with open(final_filename, "w", encoding="utf-8") as f:
                f.write(f"---主题: {', '.join(data['themes'])}---\n\n")
                f.write(f"### 事实精炼\n{data['factual_summary']}\n\n")
                f.write(f"---\n")
                f.write(f"**数据溯源：**\n- **原始标题**: {item_stem}\n")
                f.write(f"- **官方原文**: {original_url}\n")
            
            print(f"[OK] 已重构事实: {item_stem}")

        except Exception as e:
             print(f"[!] 异常 {item_stem}: {e}")

async def main():
    if not DEEPSEEK_API_KEY:
        print("错误：请检查 .env 文件是否配置了 DEEPSEEK_API_KEY")
        return

    # 扫描目录下所有的 json 文件名作为入口
    all_stems = [p.stem for p in SOURCE_DIR.glob("*.json")]
    print(f"[*] 准备处理 {len(all_stems)} 组校园文章数据...")

    async with httpx.AsyncClient(http2=True) as client:
        # 控制并发，保护 API 频率限制（QPS）
        semaphore = asyncio.Semaphore(10) 
        tasks = [process_item(stem, client, semaphore) for stem in all_stems]
        await asyncio.gather(*tasks)
    
    print("\n[FINISH] 数据清洗任务已全部完成，结果保存在 docs/fact_based_articles 目录。")

if __name__ == "__main__":
    asyncio.run(main())
