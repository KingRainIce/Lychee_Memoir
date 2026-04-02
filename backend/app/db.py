from collections.abc import Generator

from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, create_engine

from app.config import get_settings

settings = get_settings()
engine = create_engine(settings.DATABASE_URL, echo=False)


@event.listens_for(engine, "connect")
def _register_vector(dbapi_connection, connection_record) -> None:  # type: ignore[no-untyped-def]
    try:
        from pgvector.psycopg import register_vector

        register_vector(dbapi_connection)
    except Exception:
        pass


def init_db() -> None:
    """表结构由 Alembic 管理；此处仅保留扩展创建供脚本或旧流程调用。"""
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
