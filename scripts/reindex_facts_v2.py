import os
import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import text
from sqlmodel import Session, create_engine, select

# 导入后端模型和逻辑
import sys
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.append(str(backend_path))

from app.models import RagChunk, CampusEvent
from app.services.rag_index import _chunk_text_zh, _embed_texts, CHUNK_EVENT_BODY_MAX, CHUNK_EVENT_BODY_OVERLAP
from app.services.ai_settings import build_siliconflow_openai_client, resolve_ai_settings
from app.config import get_settings

load_dotenv()

FACT_DIR = Path("docs/fact_based_articles")
DB_URL = "postgresql+psycopg://szu:szu@localhost:5432/szu_memoir"
engine = create_engine(DB_URL)

def extract_meta(content: str):
    """从处理后的事实 MD 中提取主题、URL 和正文"""
    theme = ""
    url = ""
    
    theme_match = re.search(r"---主题:\s*(.*?)\s*---", content)
    if theme_match:
        theme = theme_match.group(1).strip()
        
    # 修改正则以兼容冒号后的空格和不同字符集
    url_match = re.search(r"- \*\*官方原文\*\*:\s*(https?://[^\s\n]+)", content)
    if not url_match:
        # 兼容没有星号的情况
        url_match = re.search(r"- 官方原文:\s*(https?://[^\s\n]+)", content)
        
    if url_match:
        url = url_match.group(1).strip()
        
    # 修改正文提取逻辑：提取 ### 事实精炼 之后，到第一个 --- 之前的内容
    body_match = re.search(r"### 事实精炼\s*(.*?)\s*(?:---|\Z)", content, re.DOTALL)
    body = body_match.group(1).strip() if body_match else content
    
    return theme, url, body

def clear_existing_data():
    """彻底清空事实库和对应的向量分片"""
    with Session(engine) as session:
        print("[*] 正在清空旧的校史/事实数据表...")
        # 清除向量分片
        session.execute(text("DELETE FROM ragchunk WHERE source_type = 'event'"))
        # 清除校史事件表（只清除导入的，或者全部清除）
        session.execute(text("DELETE FROM campusevent"))
        session.commit()
        print("[OK] 旧数据已清空。")

def ingest_fact_to_db_and_vector():
    """将清洗后的事实文档注入 CampusEvent 表，并同步进行向量化"""
    files = list(FACT_DIR.glob("*.md"))
    if not files:
        print("[!] 没有找到待处理的事实文档，请先运行清洗脚本。")
        return

    with Session(engine) as session:
        client = build_siliconflow_openai_client(session)
        if not client:
            print("[!] 错误：后端未能创建 AI Client，请检查 .env。")
            return
        
        _, _, emb_model, _, _ = resolve_ai_settings(session)
        dim = get_settings().EMBEDDING_DIMENSION
        
        print(f"[*] 开始将 {len(files)} 篇事实文档注入数据库并同步向量化...")
        
        for f in files:
            content = f.read_text(encoding='utf-8')
            theme, url, body = extract_meta(content)
            title = f.stem.replace("FACT_", "")
            
            # 1. 创建 CampusEvent 实体 (作为内部详情页)
            # 在 body 注入“跳转原文”链接
            full_body = f"{body}\n\n---\n\n> [!TIP]\n> 本内容由 AI 提炼自原文事实。\n\n[查看大荔知原文链接]({url})"
            
            event = CampusEvent(
                id=uuid.uuid5(uuid.NAMESPACE_DNS, title),
                campus_id="yuehai",
                year=2024, # 默认年份，因为事实表提取时未强制年份，后续可优化
                month=6,
                title=title,
                summary=f"关于 {theme} 的事实总结",
                body=full_body,
                address="深圳大学",
                image_url="https://picsum.photos/seed/szu_fact/800/450" # 占位图
            )
            session.add(event)
            session.flush() # 获取 ID 用于向量分片关联
            
            # 2. 向量化切片
            body_raw = _chunk_text_zh(body, CHUNK_EVENT_BODY_MAX, CHUNK_EVENT_BODY_OVERLAP)
            texts = [f"《{title}》| {theme}\n{c}" for c in body_raw]
            
            if texts:
                print(f"  > 索引: {title} ({len(texts)} chunks)")
                try:
                    vectors = _embed_texts(client, emb_model, texts)
                    for i, (t, vec) in enumerate(zip(texts, vectors)):
                        if len(vec) != dim: continue
                        chunk = RagChunk(
                            source_type="event",
                            source_id=event.id,
                            campus_id=event.campus_id,
                            chunk_index=i,
                            content=t,
                            meta={
                                "title": title,
                                "url": url, 
                                "theme": theme
                            },
                            embedding=vec
                        )
                        session.add(chunk)
                except Exception as e:
                    print(f"  [!] 向量化失败 {title}: {e}")
            
            session.commit()

    print("\n[FINISH] 数据库注入与向量化已全部完成。AI 卡片现在将指向内部详情页。")

if __name__ == "__main__":
    clear_existing_data()
    ingest_fact_to_db_and_vector()
