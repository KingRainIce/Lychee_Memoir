import enum
import uuid
from datetime import datetime
from typing import Any, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, JSON, Text
from sqlmodel import Field, SQLModel


class PostStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    deleted = "deleted"


class User(SQLModel, table=True):
    __tablename__ = "app_user"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=320)
    hashed_password: str = Field(max_length=1024)
    display_name: Optional[str] = Field(default=None, max_length=120)
    avatar_url: Optional[str] = Field(default=None, max_length=2000)
    is_admin: bool = Field(default=False)
    disabled: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CampusEvent(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    campus_id: str = Field(index=True, max_length=64)
    year: int = Field(index=True)
    month: int = Field(default=6, ge=1, le=12, index=True)
    lng: float = 0.0
    lat: float = 0.0
    nx: Optional[float] = None
    ny: Optional[float] = None
    place_id: Optional[str] = Field(default=None, max_length=128, index=True)
    title: str = Field(max_length=500)
    summary: str = Field(sa_column=Column(Text))
    body: str = Field(sa_column=Column(Text))
    image_url: str = Field(max_length=2000, default="")
    address: str = Field(max_length=500, default="")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AlumniPost(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    author_id: uuid.UUID = Field(foreign_key="app_user.id", index=True)
    campus_id: str = Field(index=True, max_length=64)
    year: int = Field(index=True)
    month: int = Field(default=1, ge=1, le=12)
    lng: float = 0.0
    lat: float = 0.0
    nx: Optional[float] = None
    ny: Optional[float] = None
    place_id: Optional[str] = Field(default=None, max_length=128, index=True)
    body: str = Field(sa_column=Column(Text))
    excerpt: str = Field(default="", sa_column=Column(Text))
    image_url: Optional[str] = Field(default=None, max_length=2000)
    address: str = Field(max_length=500, default="")
    status: PostStatus = Field(default=PostStatus.pending)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PostLike(SQLModel, table=True):
    __tablename__ = "post_like"

    user_id: uuid.UUID = Field(foreign_key="app_user.id", primary_key=True)
    post_id: uuid.UUID = Field(foreign_key="alumnipost.id", primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PostFavorite(SQLModel, table=True):
    __tablename__ = "post_favorite"

    user_id: uuid.UUID = Field(foreign_key="app_user.id", primary_key=True)
    post_id: uuid.UUID = Field(foreign_key="alumnipost.id", primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PostComment(SQLModel, table=True):
    __tablename__ = "post_comment"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    post_id: uuid.UUID = Field(foreign_key="alumnipost.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="app_user.id", index=True)
    parent_id: Optional[uuid.UUID] = Field(default=None, foreign_key="post_comment.id", index=True)
    body: str = Field(sa_column=Column(Text))
    created_at: datetime = Field(default_factory=datetime.utcnow)


# Fixed dimension for migrations; must match EMBEDDING_DIMENSION / SiliconFlow model
VECTOR_DIM = 1024


class RagChunk(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    source_type: str = Field(index=True, max_length=32)  # event | post
    source_id: uuid.UUID = Field(index=True)
    campus_id: str = Field(index=True, max_length=64)
    chunk_index: int = 0
    content: str = Field(sa_column=Column(Text))
    meta: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    embedding: Optional[list[float]] = Field(
        default=None,
        sa_column=Column(Vector(VECTOR_DIM)),
    )


class AiRuntimeConfig(SQLModel, table=True):
    """Singleton row id=1: optional DB-stored SiliconFlow overrides (admin)."""

    __tablename__ = "airuntimeconfig"
    id: int = Field(default=1, primary_key=True)
    siliconflow_base_url: Optional[str] = Field(default=None, max_length=500)
    siliconflow_api_key: Optional[str] = Field(default=None, sa_column=Column(Text))
    embedding_model: Optional[str] = Field(default=None, max_length=200)
    chat_model: Optional[str] = Field(default=None, max_length=200)
