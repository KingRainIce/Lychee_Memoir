import uuid
from collections import defaultdict
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import Session, col, select

from app.deps import get_current_user, get_current_user_optional, get_db
from app.models import (
    AlumniPost,
    PostComment,
    PostFavorite,
    PostLike,
    PostStatus,
    User,
)
from app.places import resolve_map_binding
from app.schemas import (
    AlumniPostCreate,
    AlumniPostRead,
    PostCommentCreate,
    PostCommentRead,
    PostCommentsResponse,
)

router = APIRouter(prefix="/posts", tags=["posts"])


def _user_display_name(session: Session, uid: uuid.UUID) -> str:
    u = session.get(User, uid)
    if not u:
        return "用户"
    return u.display_name or (u.email.split("@")[0] if u.email else "用户")


def _post_to_read(
    session: Session,
    p: AlumniPost,
    like_count: int = 0,
    comment_count: int = 0,
    liked_by_me: bool = False,
    favorited_by_me: bool = False,
) -> AlumniPostRead:
    author = _user_display_name(session, p.author_id)
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
        like_count=like_count,
        comment_count=comment_count,
        liked_by_me=liked_by_me,
        favorited_by_me=favorited_by_me,
    )


def _social_meta_by_post(
    session: Session, post_ids: list[uuid.UUID], user: Optional[User]
) -> dict[uuid.UUID, tuple[int, int, bool, bool]]:
    """(like_count, comment_count, liked_by_me, favorited_by_me) per post."""
    empty = (0, 0, False, False)
    out: dict[uuid.UUID, tuple[int, int, bool, bool]] = {pid: empty for pid in post_ids}
    if not post_ids:
        return out

    for row in session.exec(
        select(PostLike.post_id, func.count())
        .where(col(PostLike.post_id).in_(post_ids))
        .group_by(PostLike.post_id)
    ).all():
        pid, cnt = row[0], int(row[1])
        lc, cc, lk, fv = out[pid]
        out[pid] = (cnt, cc, lk, fv)

    for row in session.exec(
        select(PostComment.post_id, func.count())
        .where(col(PostComment.post_id).in_(post_ids))
        .group_by(PostComment.post_id)
    ).all():
        pid, cnt = row[0], int(row[1])
        lc, cc, lk, fv = out[pid]
        out[pid] = (lc, cnt, lk, fv)

    if user:
        liked_rows = session.exec(
            select(PostLike.post_id).where(
                PostLike.user_id == user.id,
                col(PostLike.post_id).in_(post_ids),
            )
        ).all()
        for pid in liked_rows:
            lc, cc, lk, fv = out[pid]
            out[pid] = (lc, cc, True, fv)

        fav_rows = session.exec(
            select(PostFavorite.post_id).where(
                PostFavorite.user_id == user.id,
                col(PostFavorite.post_id).in_(post_ids),
            )
        ).all()
        for pid in fav_rows:
            lc, cc, lk, fv = out[pid]
            out[pid] = (lc, cc, lk, True)

    return out


def _posts_to_read_enriched(
    session: Session, rows: list[AlumniPost], user: Optional[User]
) -> list[AlumniPostRead]:
    ids = [p.id for p in rows]
    meta = _social_meta_by_post(session, ids, user)
    return [_post_to_read(session, p, *meta[p.id]) for p in rows]


def _get_approved_post(session: Session, post_id: uuid.UUID) -> AlumniPost:
    p = session.get(AlumniPost, post_id)
    if p is None or p.status != PostStatus.approved:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="帖子不存在或未通过审核")
    return p


@router.get("", response_model=list[AlumniPostRead])
def list_posts(
    session: Annotated[Session, Depends(get_db)],
    campus_id: str = Query(...),
    since: Optional[datetime] = Query(
        None,
        description="仅返回 created_at >= since（ISO8601，建议含时区；用于登录自然日 0 点至今）",
    ),
    user: Annotated[Optional[User], Depends(get_current_user_optional)] = None,
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
    return _posts_to_read_enriched(session, rows, user)


@router.get("/me/liked", response_model=list[AlumniPostRead])
def list_my_liked_posts(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    campus_id: Optional[str] = Query(None),
) -> list[AlumniPostRead]:
    stmt = (
        select(AlumniPost)
        .join(PostLike, PostLike.post_id == AlumniPost.id)
        .where(PostLike.user_id == user.id)
        .where(AlumniPost.status == PostStatus.approved)
    )
    if campus_id:
        stmt = stmt.where(AlumniPost.campus_id == campus_id)
    stmt = stmt.order_by(PostLike.created_at.desc())
    rows = list(session.exec(stmt).all())
    return _posts_to_read_enriched(session, rows, user)


@router.get("/me/favorited", response_model=list[AlumniPostRead])
def list_my_favorited_posts(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    campus_id: Optional[str] = Query(None),
) -> list[AlumniPostRead]:
    stmt = (
        select(AlumniPost)
        .join(PostFavorite, PostFavorite.post_id == AlumniPost.id)
        .where(PostFavorite.user_id == user.id)
        .where(AlumniPost.status == PostStatus.approved)
    )
    if campus_id:
        stmt = stmt.where(AlumniPost.campus_id == campus_id)
    stmt = stmt.order_by(PostFavorite.created_at.desc())
    rows = list(session.exec(stmt).all())
    return _posts_to_read_enriched(session, rows, user)


@router.get("/{post_id}/comments", response_model=PostCommentsResponse)
def list_post_comments(
    post_id: uuid.UUID,
    session: Annotated[Session, Depends(get_db)],
) -> PostCommentsResponse:
    _get_approved_post(session, post_id)
    rows = list(
        session.exec(
            select(PostComment)
            .where(PostComment.post_id == post_id)
            .order_by(PostComment.created_at)
        ).all()
    )
    by_parent: dict[Optional[uuid.UUID], list[PostComment]] = defaultdict(list)
    for c in rows:
        by_parent[c.parent_id].append(c)
    tops = by_parent.get(None, [])
    items: list[PostCommentRead] = []
    for top in tops:
        subs = sorted(by_parent.get(top.id, []), key=lambda x: x.created_at)
        items.append(
            PostCommentRead(
                id=top.id,
                author=_user_display_name(session, top.user_id),
                body=top.body,
                created_at=top.created_at,
                replies=[
                    PostCommentRead(
                        id=s.id,
                        author=_user_display_name(session, s.user_id),
                        body=s.body,
                        created_at=s.created_at,
                        replies=[],
                    )
                    for s in subs
                ],
            )
        )
    return PostCommentsResponse(items=items)


@router.post("/{post_id}/comments", response_model=PostCommentRead)
def create_post_comment(
    post_id: uuid.UUID,
    body: PostCommentCreate,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> PostCommentRead:
    _get_approved_post(session, post_id)
    parent_id = body.parent_id
    if parent_id is not None:
        parent = session.get(PostComment, parent_id)
        if parent is None or parent.post_id != post_id:
            raise HTTPException(status_code=400, detail="父评论不存在")
        if parent.parent_id is not None:
            raise HTTPException(status_code=400, detail="仅支持二级评论：不能回复子评论")

    c = PostComment(
        post_id=post_id,
        user_id=user.id,
        parent_id=parent_id,
        body=body.body.strip(),
    )
    session.add(c)
    session.commit()
    session.refresh(c)
    return PostCommentRead(
        id=c.id,
        author=_user_display_name(session, c.user_id),
        body=c.body,
        created_at=c.created_at,
        replies=[],
    )


@router.post("/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT)
def like_post(
    post_id: uuid.UUID,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    _get_approved_post(session, post_id)
    existing = session.exec(
        select(PostLike).where(PostLike.user_id == user.id, PostLike.post_id == post_id)
    ).first()
    if existing is None:
        session.add(PostLike(user_id=user.id, post_id=post_id))
        session.commit()


@router.delete("/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT)
def unlike_post(
    post_id: uuid.UUID,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    row = session.exec(
        select(PostLike).where(PostLike.user_id == user.id, PostLike.post_id == post_id)
    ).first()
    if row:
        session.delete(row)
        session.commit()


@router.post("/{post_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
def favorite_post(
    post_id: uuid.UUID,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    _get_approved_post(session, post_id)
    existing = session.exec(
        select(PostFavorite).where(PostFavorite.user_id == user.id, PostFavorite.post_id == post_id)
    ).first()
    if existing is None:
        session.add(PostFavorite(user_id=user.id, post_id=post_id))
        session.commit()


@router.delete("/{post_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
def unfavorite_post(
    post_id: uuid.UUID,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    row = session.exec(
        select(PostFavorite).where(PostFavorite.user_id == user.id, PostFavorite.post_id == post_id)
    ).first()
    if row:
        session.delete(row)
        session.commit()


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
