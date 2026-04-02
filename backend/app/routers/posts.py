from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.deps import get_current_user, get_db
from app.places import resolve_map_binding
from app.models import AlumniPost, PostStatus, User
from app.schemas import AlumniPostCreate, AlumniPostRead

router = APIRouter(prefix="/posts", tags=["posts"])


def _post_to_read(session: Session, p: AlumniPost) -> AlumniPostRead:
    u = session.get(User, p.author_id)
    author = (u.display_name or (u.email.split("@")[0] if u else "用户")) if u else "用户"
    return AlumniPostRead(
        id=p.id,
        campus_id=p.campus_id,
        year=p.year,
        month=p.month,
        lng=p.lng,
        lat=p.lat,
        nx=p.nx,
        ny=p.ny,
        place_id=p.place_id,
        author=author,
        excerpt=p.excerpt,
        body=p.body,
        image_url=p.image_url,
        address=p.address,
        status=p.status,
        created_at=p.created_at,
    )


@router.get("", response_model=list[AlumniPostRead])
def list_posts(
    session: Annotated[Session, Depends(get_db)],
    campus_id: str = Query(...),
    since: Optional[datetime] = Query(
        None,
        description="仅返回 created_at >= since（ISO8601，建议含时区；用于登录自然日 0 点至今）",
    ),
) -> list[AlumniPostRead]:
    stmt = (
        select(AlumniPost)
        .where(AlumniPost.campus_id == campus_id)
        .where(AlumniPost.status == PostStatus.approved)
    )
    if since is not None:
        stmt = stmt.where(AlumniPost.created_at >= since)
    stmt = stmt.order_by(AlumniPost.created_at.desc())
    rows = list(session.exec(stmt).all())
    return [_post_to_read(session, p) for p in rows]


@router.post("", response_model=AlumniPostRead)
def create_post(
    body: AlumniPostCreate,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> AlumniPostRead:
    now = datetime.utcnow()
    year = body.year or now.year
    month = body.month or now.month
    excerpt = (body.body[:120] + "…") if len(body.body) > 120 else body.body
    raw_pid = body.place_id
    place_id = str(raw_pid).strip() if raw_pid is not None and str(raw_pid).strip() else None
    nx, ny, lng, lat = resolve_map_binding(
        body.campus_id,
        place_id,
        body.nx,
        body.ny,
        float(body.lng),
        float(body.lat),
    )
    post = AlumniPost(
        author_id=user.id,
        campus_id=body.campus_id,
        year=year,
        month=month,
        lng=lng,
        lat=lat,
        nx=nx,
        ny=ny,
        place_id=place_id,
        body=body.body,
        excerpt=excerpt,
        image_url=body.image_url,
        address=body.address,
        status=PostStatus.pending,
    )
    session.add(post)
    session.commit()
    session.refresh(post)
    return _post_to_read(session, post)
