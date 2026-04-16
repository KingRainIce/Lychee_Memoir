import os
import json
import re
import uuid
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import text
from sqlmodel import Session, create_engine, select

# 导入后端模型和逻辑
import sys
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.append(str(backend_path))

from app.models import RagChunk, PostStatus
from app.services.rag_index import _chunk_text_zh, _embed_texts, CHUNK_EVENT_BODY_MAX, CHUNK_EVENT_BODY_OVERLAP
from app.services.ai_settings import build_siliconflow_openai_client, resolve_ai_settings
from app.config import get_settings

load_dotenv()

FACT_DIR = Path("docs/fact_based_articles")
DB_URL = "postgresql+psycopg://szu:szu@localhost:5432/szu_memoir"
engine = create_engine(DB_URL)

def extract_meta(content: str):
    """从处理后的事实 MD 中提取主题和 URL"""
    theme = ""
    url = ""
    
    # 匹配主题 (---主题: xxx---)
    theme_match = re.search(r"---主题: (.*?)---", content)
    if theme_match:
        theme = theme_match.group(1).strip()
        
    # 匹配原文链接 (- 官方原文: xxx)
    url_match = re.search(r"- 官方原文: (.*)", content)
    if url_match:
        url = url_match.group(1).strip()
        
    # 提取正式的事实内容部分 (### 事实精炼 之后的内容)
    body_match = re.search(r"### 事实精炼\s+(.*?)\s+---", content, re.DOTALL)
    body = body_match.group(1).strip() if body_match else content
    
    return theme, url, body

def clear_existing_chunks():
    """彻底清空向量库中所有非用户帖子的内容 (即清理旧的校史/活动数据)"""
    with Session(engine) as session:
        print("[*] 正在清空旧的校史向量数据...")
        session.execute(text("DELETE FROM ragchunk WHERE source_type = 'event' OR source_type = 'history'"))
        session.commit()
        print("[OK] 旧数据已清空。")

def ingest_fact_articles():
    """将清洗后的事实文档注入向量库"""
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
        
        print(f"[*] 开始注入 {len(files)} 篇事实文档...")
        
        for f in files:
            content = f.read_text(encoding='utf-8')
            theme, url, body = extract_meta(content)
            title = f.stem.replace("FACT_", "")
            
            # 这里的 source_id 我们生成一个固定的 uuid (基于标题)，防止重复
            source_id = uuid.uuid5(uuid.NAMESPACE_DNS, title)
            
            # 切片
            body_raw = _chunk_text_zh(body, CHUNK_EVENT_BODY_MAX, CHUNK_EVENT_BODY_OVERLAP)
            # 在切片头部加上标题信息，增强检索命中率
            texts = [f"《{title}》| 主题:{theme}\n{c}" for c in body_raw]
            
            if not texts:
                continue
                
            print(f"  > 正在处理: {title} ({len(texts)} chunks)")
            
            try:
                vectors = _embed_texts(client, emb_model, texts)
                
                for i, (t, vec) in enumerate(zip(texts, vectors)):
                    if len(vec) != dim: continue
                    chunk = RagChunk(
                        source_type="event", # 复用 event 类型，这样现有的 RAG 逻辑能直接搜到
                        source_id=source_id,
                        campus_id="yuehai", # 默认设为粤海，或根据需要扩展
                        chunk_index=i,
                        content=t,
                        meta={
                            "title": title,
                            "url": url,
                            "theme": theme,
                            "is_fact": True
                        },
                        embedding=vec
                    )
                    session.add(chunk)
                session.commit()
            except Exception as e:
                print(f"  [!] 注入失败 {title}: {e}")
                session.rollback()

    print("\n[FINISH] 全量事实数据已重新向量化，AI 现在可以引用原文链接了。")

if __name__ == "__main__":
    clear_existing_chunks()
    ingest_fact_articles()
