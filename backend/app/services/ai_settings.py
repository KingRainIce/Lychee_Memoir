from typing import Tuple

import httpx
from openai import OpenAI
from sqlmodel import Session

from app.config import get_settings
from app.models import AiRuntimeConfig


def resolve_ai_settings(session: Session) -> Tuple[str, str, str, str, str]:
    """
    Returns (base_url, api_key, embedding_model, chat_model, source_tag).
    密钥：库表 id=1 中已保存的非空 Key 优先（网页「API 设置」保存后即走数据库）；
    否则再用环境变量 SILICONFLOW_API_KEY。这样可在网页覆盖无效的环境变量里的示例 Key。
    Base URL / 模型名：仍以库表非空项覆盖环境默认值。
    """
    s = get_settings()
    row = session.get(AiRuntimeConfig, 1)

    db_key = (row.siliconflow_api_key or "").strip() if row else ""
    env_key = (s.SILICONFLOW_API_KEY or "").strip()

    if db_key:
        key = db_key
        source = "database"
    elif env_key:
        key = env_key
        source = "env"
    else:
        key = ""
        source = "none"

    base = ((s.SILICONFLOW_BASE_URL or "").rstrip("/") or "https://api.siliconflow.cn/v1")
    emb = s.EMBEDDING_MODEL
    chat = s.CHAT_MODEL

    if row:
        if row.siliconflow_base_url and str(row.siliconflow_base_url).strip():
            base = str(row.siliconflow_base_url).strip().rstrip("/")
        if row.embedding_model and str(row.embedding_model).strip():
            emb = str(row.embedding_model).strip()
        if row.chat_model and str(row.chat_model).strip():
            chat = str(row.chat_model).strip()

    if not base:
        base = "https://api.siliconflow.cn/v1"
    return base, key, emb, chat, source


def build_siliconflow_openai_client(session: Session) -> OpenAI | None:
    """无密钥返回 None；否则使用可配置超时（避免默认过短导致「Request timed out」）。"""
    base, key, _, _, _ = resolve_ai_settings(session)
    if not key:
        return None
    s = get_settings()
    read_sec = max(30.0, float(s.SILICONFLOW_HTTP_TIMEOUT))
    timeout = httpx.Timeout(connect=30.0, read=read_sec, write=min(120.0, read_sec), pool=60.0)
    retries = max(0, int(s.SILICONFLOW_MAX_RETRIES))
    return OpenAI(api_key=key, base_url=base, timeout=timeout, max_retries=retries)


def ai_diagnostics(session: Session) -> dict:
    s = get_settings()
    base, key, emb, chat, src = resolve_ai_settings(session)
    return {
        "has_api_key": bool(key),
        "key_source": src,
        "effective_base_url": base,
        "embedding_model": emb,
        "chat_model": chat,
        "http_timeout_seconds": float(s.SILICONFLOW_HTTP_TIMEOUT),
        "max_retries": int(s.SILICONFLOW_MAX_RETRIES),
        "effective_key_char_count": len(key) if key else 0,
    }


def ai_config_public(session: Session) -> dict:
    """管理员 GET：表单回显与运行时一致——库表中的 Base URL / 模型覆盖环境默认值（密钥仍可不回显）。"""
    s = get_settings()
    row = session.get(AiRuntimeConfig, 1)
    env_key = bool((s.SILICONFLOW_API_KEY or "").strip())
    db_key = bool(row and (row.siliconflow_api_key or "").strip())
    has_key = env_key or db_key

    # 与 resolve_ai_settings 一致：运行时实际用的是库表 Key 还是环境 Key
    if db_key:
        src = "database"
    elif env_key:
        src = "env"
    else:
        src = "none"

    base = (s.SILICONFLOW_BASE_URL or "").strip() or "https://api.siliconflow.cn/v1"
    emb = s.EMBEDDING_MODEL
    chat = s.CHAT_MODEL
    if row:
        if row.siliconflow_base_url and str(row.siliconflow_base_url).strip():
            base = str(row.siliconflow_base_url).strip()
        if row.embedding_model and str(row.embedding_model).strip():
            emb = str(row.embedding_model).strip()
        if row.chat_model and str(row.chat_model).strip():
            chat = str(row.chat_model).strip()

    return {
        "siliconflow_base_url": base,
        "embedding_model": emb,
        "chat_model": chat,
        "has_api_key": has_key,
        "source": src,
    }
