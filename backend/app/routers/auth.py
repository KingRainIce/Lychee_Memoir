from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.deps import get_current_user, get_db
from app.limiter import limiter
from app.models import User
from app.schemas import Token, UserCreate, UserLogin, UserPublic, UserUpdate
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserPublic)
@limiter.limit("20/minute")
def register(request: Request, body: UserCreate, session: Annotated[Session, Depends(get_db)]) -> User:
    existing = session.exec(select(User).where(User.email == body.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="该邮箱已注册")
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        display_name=body.display_name or body.email.split("@")[0],
        is_admin=False,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/login", response_model=Token)
@limiter.limit("30/minute")
def login(request: Request, body: UserLogin, session: Annotated[Session, Depends(get_db)]) -> Token:
    user = session.exec(select(User).where(User.email == body.email)).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码错误")
    if user.disabled:
        raise HTTPException(status_code=403, detail="账号已禁用")
    token = create_access_token(str(user.id))
    return Token(access_token=token)


@router.get("/me", response_model=UserPublic)
def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user


@router.patch("/me", response_model=UserPublic)
def update_me(
    body: UserUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_db)],
) -> User:
    if body.display_name is not None:
        user.display_name = body.display_name.strip() or None
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url.strip() or None
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
