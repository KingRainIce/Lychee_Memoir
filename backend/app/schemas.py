from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal, Optional

from pydantic import AfterValidator, BaseModel, Field

from app.models import PostStatus


def _auth_email(v: str) -> str:
    """登录/注册用：允许 admin@szu.local 等 .local，避免 EmailStr 拒收保留域名。"""
    s = v.strip()
    if not s or "@" not in s or len(s) > 320:
        raise ValueError("请输入有效邮箱")
    local, _, domain = s.rpartition("@")
    if not local or not domain or "/" in s or " " in s:
        raise ValueError("请输入有效邮箱")
    return s


AuthEmail = Annotated[str, AfterValidator(_auth_email)]


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: AuthEmail
    password: str = Field(min_length=8, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=120)


class UserLogin(BaseModel):
    email: AuthEmail
    password: str


class UserPublic(BaseModel):
    id: uuid.UUID
    email: str
    display_name: Optional[str]
    avatar_url: Optional[str]
    is_admin: bool

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=120)
    avatar_url: Optional[str] = Field(default=None, max_length=2000)


class MapPlaceRead(BaseModel):
    id: str
    label: str
    nx: float
    ny: float
    kind: Optional[str] = None


class CampusEventRead(BaseModel):
    id: uuid.UUID
    campus_id: str
    year: int
    month: int
    lng: float
    lat: float
    nx: Optional[float]
    ny: Optional[float]
    place_id: Optional[str] = None
    title: str
    summary: str
    body: str
    image_url: str
    address: str

    model_config = {"from_attributes": True}


class CampusEventCreate(BaseModel):
    campus_id: str
    year: int
    month: int = Field(default=6, ge=1, le=12)
    lng: float = 0
    lat: float = 0
    nx: Optional[float] = None
    ny: Optional[float] = None
    place_id: Optional[str] = Field(default=None, max_length=128)
    title: str
    summary: str
    body: str
    image_url: str = ""
    address: str = ""


class AlumniPostRead(BaseModel):
    id: uuid.UUID
    campus_id: str
    year: int
    month: int
    lng: float  # 内部地图用；界面统一称「地点」
    lat: float
    nx: Optional[float]
    ny: Optional[float]
    place_id: Optional[str] = None
    author: str
    excerpt: str
    body: str
    image_url: Optional[str]
    address: str
    status: PostStatus
    created_at: datetime
    like_count: int = 0
    comment_count: int = 0
    liked_by_me: bool = False
    favorited_by_me: bool = False

    model_config = {"from_attributes": True}


class PostCommentRead(BaseModel):
    id: uuid.UUID
    author: str
    body: str
    created_at: datetime
    replies: list[PostCommentRead] = Field(default_factory=list)


class PostCommentsResponse(BaseModel):
    items: list[PostCommentRead]


class PostCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=8000)
    parent_id: Optional[uuid.UUID] = None


class AlumniPostCreate(BaseModel):
    campus_id: str
    body: str = Field(min_length=1, max_length=20000)
    year: Optional[int] = None
    month: Optional[int] = None
    lng: float = 0
    lat: float = 0
    nx: Optional[float] = None
    ny: Optional[float] = None
    place_id: Optional[str] = Field(default=None, max_length=128)
    image_url: Optional[str] = None
    address: str = ""


class PostModerate(BaseModel):
    status: PostStatus


class RagChatHistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class RagChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    campus_id: str
    year: Optional[int] = None
    month: Optional[int] = Field(default=None, ge=1, le=12)
    is_latest: bool = False
    history: list[RagChatHistoryTurn] = Field(
        default_factory=list,
        max_length=24,
        description="此前多轮对话（不含本条 message）；由模型决定是否调用检索工具。",
    )


class RagCitation(BaseModel):
    source_type: str
    source_id: str
    title: str
    url: Optional[str] = None # 原文跳转链接
    snippet: str = Field(description="检索块原文，供卡片展示")
    score: float
    image_url: Optional[str] = None


class RagChatResponse(BaseModel):
    answer: str
    events: list[RagCitation]
    posts: list[RagCitation]


class AiConfigUpdate(BaseModel):
    siliconflow_base_url: Optional[str] = None
    siliconflow_api_key: Optional[str] = Field(default=None, max_length=8192)
    embedding_model: Optional[str] = None
    chat_model: Optional[str] = None


class AiConfigPublic(BaseModel):
    siliconflow_base_url: Optional[str]
    embedding_model: Optional[str]
    chat_model: Optional[str]
    has_api_key: bool
    source: str  # env | database | none


class AiDiagnosticsPublic(BaseModel):
    """不发起外网请求，仅汇总当前将用于调用硅基流动的配置（管理员自查 Key 是否生效）。"""

    has_api_key: bool
    key_source: str
    effective_base_url: str
    embedding_model: str
    chat_model: str
    http_timeout_seconds: float
    max_retries: int
    # 用于排查库表 VARCHAR(500) 截断：与硅基控制台复制长度对比，不暴露密钥内容
    effective_key_char_count: int = 0


class ImageUploadResponse(BaseModel):
    url: str
