import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.config import get_settings
from app.deps import get_current_user
from app.models import User
from app.schemas import ImageUploadResponse

router = APIRouter(tags=["uploads"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_BYTES = 5 * 1024 * 1024


def _upload_dir() -> Path:
    root = Path(__file__).resolve().parent.parent
    d = root / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.post("/uploads/image", response_model=ImageUploadResponse)
async def upload_image(
    user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> ImageUploadResponse:
    _ = user
    ct = (file.content_type or "").split(";")[0].strip().lower()
    if ct not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="仅支持 jpeg / png / webp / gif")
    suffix = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }[ct]
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="图片不超过 5MB")
    name = f"{uuid.uuid4().hex}{suffix}"
    dest = _upload_dir() / name
    dest.write_bytes(data)
    settings = get_settings()
    return ImageUploadResponse(url=f"{settings.API_PREFIX}/media/{name}")
