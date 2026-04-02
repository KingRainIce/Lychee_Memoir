from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PROJECT_NAME: str = "SZU Memoir API"
    API_PREFIX: str = "/api"

    DATABASE_URL: str = "postgresql+psycopg://szu:szu@localhost:5432/szu_memoir"

    JWT_SECRET: str = "change-me-in-production-use-long-random"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    # SiliconFlow / OpenAI-compatible (env fallback before DB AiConfig)
    # 国内控制台文档多为 api.siliconflow.cn；.com 与 .cn 密钥网关可能不一致，勿混用。
    SILICONFLOW_BASE_URL: str = "https://api.siliconflow.cn/v1"
    SILICONFLOW_API_KEY: str = ""
    EMBEDDING_MODEL: str = "BAAI/bge-large-zh-v1.5"
    CHAT_MODEL: str = "Qwen/Qwen2.5-7B-Instruct"
    EMBEDDING_DIMENSION: int = 1024
    # 访问硅基流动（OpenAI 兼容）的 HTTP 超时与重试；网络慢或容器 DNS 慢时可调大
    SILICONFLOW_HTTP_TIMEOUT: float = 240.0
    SILICONFLOW_MAX_RETRIES: int = 1

    INIT_ADMIN_EMAIL: str = "admin@szu.local"
    INIT_ADMIN_PASSWORD: str = "admin123456"

    CORS_ORIGINS: str = (
        "http://127.0.0.1:5173,http://localhost:5173,"
        "http://127.0.0.1:5174,http://localhost:5174,"
        "http://127.0.0.1:4173,http://localhost:4173"
    )

    # 平面图标注 JSON；留空则依次尝试 backend/data/annotations.json 与仓库 frontend/public/annotations.json
    ANNOTATIONS_JSON_PATH: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
