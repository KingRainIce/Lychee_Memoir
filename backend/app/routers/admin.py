from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.deps import get_admin_user, get_db
from app.models import AlumniPost, PostStatus, User
from app.routers.posts import _post_to_read
from app.schemas import AiConfigPublic, AiConfigUpdate, AiDiagnosticsPublic, AlumniPostRead, PostModerate
from app.services.ai_settings import ai_config_public, ai_diagnostics
from app.services.rag_index import delete_chunks_for_source, index_alumni_post
from app.ws_manager import hub

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/posts/pending", response_model=list[AlumniPostRead])
def pending_posts(
    session: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_admin_user)],
) -> list[AlumniPostRead]:
    stmt = select(AlumniPost).where(AlumniPost.status == PostStatus.pending).order_by(AlumniPost.created_at)
    rows = list(session.exec(stmt).all())
    return [_post_to_read(session, p) for p in rows]


@router.patch("/posts/{post_id}", response_model=AlumniPostRead)
async def moderate_post(
    post_id: UUID,
    body: PostModerate,
    session: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_admin_user)],
) -> AlumniPostRead:
    post = session.get(AlumniPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="帖子不存在")
    if body.status not in (PostStatus.approved, PostStatus.rejected, PostStatus.pending):
        raise HTTPException(status_code=400, detail="无效状态")
    post.status = body.status
    session.add(post)
    session.commit()
    session.refresh(post)

    if body.status == PostStatus.rejected or body.status == PostStatus.pending:
        delete_chunks_for_source(session, "post", post.id)
        session.commit()

    if body.status == PostStatus.approved:
        index_alumni_post(session, post)
        payload = _post_to_read(session, post).model_dump(mode="json")
        await hub.broadcast_post(post.campus_id, {"type": "new_post", "post": payload})

    return _post_to_read(session, post)


@router.delete("/posts/{post_id}", response_model=AlumniPostRead)
async def delete_post(
    post_id: UUID,
    session: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_admin_user)],
) -> AlumniPostRead:
    post = session.get(AlumniPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="帖子不存在")

    post.status = PostStatus.deleted
    session.add(post)
    session.commit()
    session.refresh(post)

    # 同时也从 RAG 中移除该条记录，防止被搜索到
    delete_chunks_for_source(session, "post", post.id)
    session.commit()

    return _post_to_read(session, post)


@router.get("/ai-config", response_model=AiConfigPublic)
def get_ai_config(
    session: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_admin_user)],
) -> AiConfigPublic:
    d = ai_config_public(session)
    return AiConfigPublic(**d)


@router.get("/ai-diagnostics", response_model=AiDiagnosticsPublic)
def get_ai_diagnostics(
    session: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_admin_user)],
) -> AiDiagnosticsPublic:
    """不发外网请求；用于确认 Key 是否已加载、来源 env/库表、以及超时配置。"""
    return AiDiagnosticsPublic(**ai_diagnostics(session))


@router.put("/ai-config", response_model=AiConfigPublic)
def put_ai_config(
    body: AiConfigUpdate,
    session: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_admin_user)],
) -> AiConfigPublic:
    from app.models import AiRuntimeConfig

    row = session.get(AiRuntimeConfig, 1)
    if row is None:
        row = AiRuntimeConfig(id=1)
        session.add(row)
    if body.siliconflow_base_url is not None:
        row.siliconflow_base_url = body.siliconflow_base_url or None
    if body.siliconflow_api_key is not None:
        k = (body.siliconflow_api_key or "").strip()
        row.siliconflow_api_key = k or None
    if body.embedding_model is not None:
        row.embedding_model = body.embedding_model or None
    if body.chat_model is not None:
        row.chat_model = body.chat_model or None
    session.add(row)
    session.commit()
    d = ai_config_public(session)
    return AiConfigPublic(**d)
