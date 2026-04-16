import os
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text

from app.config import get_settings
from app.db import engine
from app.limiter import limiter
from app.routers import admin, auth, events, places, posts, rag, uploads
from app.ws_manager import hub


def _run_alembic_upgrade() -> None:
    backend_root = Path(__file__).resolve().parent.parent
    ini = backend_root / "alembic.ini"
    cfg = Config(str(ini))
    command.upgrade(cfg, "head")


def _bootstrap_db() -> None:
    """本地直接 uvicorn 时用：扩展、迁移、种子。Docker 默认设 SKIP_STARTUP_DB_BOOTSTRAP=1，改由 docker-entry.sh 执行。"""
    from app import models  # noqa: F401

    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    _run_alembic_upgrade()
    from app.seed import ensure_seed

    ensure_seed()


def _skip_startup_bootstrap() -> bool:
    return os.environ.get("SKIP_STARTUP_DB_BOOTSTRAP", "").strip().lower() in ("1", "true", "yes", "on")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not _skip_startup_bootstrap():
        _bootstrap_db()
    yield


settings = get_settings()
app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

uploads_dir = Path(__file__).resolve().parent / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount(f"{settings.API_PREFIX}/media", StaticFiles(directory=str(uploads_dir)), name="media")

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

app.include_router(auth.router, prefix=settings.API_PREFIX)
app.include_router(events.router, prefix=settings.API_PREFIX)
app.include_router(places.router, prefix=settings.API_PREFIX)
app.include_router(posts.router, prefix=settings.API_PREFIX)
app.include_router(uploads.router, prefix=settings.API_PREFIX)
app.include_router(admin.router, prefix=settings.API_PREFIX)
app.include_router(rag.router, prefix=settings.API_PREFIX)


@app.get(f"{settings.API_PREFIX}/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket(f"{settings.API_PREFIX}/ws/posts")
async def ws_posts(ws: WebSocket, campus_id: str) -> None:
    await hub.connect(campus_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(campus_id, ws)
