from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.deps import get_db
from app.limiter import limiter
from app.schemas import RagChatRequest, RagChatResponse
from app.services.rag_chat import iter_rag_chat_sse, run_rag_chat

router = APIRouter(prefix="/rag", tags=["rag"])

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@router.post("/chat", response_model=RagChatResponse)
@limiter.limit("40/minute")
def rag_chat(
    request: Request,
    body: RagChatRequest,
    session: Annotated[Session, Depends(get_db)],
) -> RagChatResponse:
    """未登录也可使用（限流按 IP）；登录用户同样走此接口。非流式，兼容旧客户端。"""
    return run_rag_chat(session, body)


@router.post("/chat/stream")
@limiter.limit("40/minute")
def rag_chat_stream(
    request: Request,
    body: RagChatRequest,
    session: Annotated[Session, Depends(get_db)],
) -> StreamingResponse:
    """SSE：event citations → token（多段）→ done；失败时 final + done。"""
    return StreamingResponse(
        iter_rag_chat_sse(session, body),
        media_type="text/event-stream; charset=utf-8",
        headers=_SSE_HEADERS,
    )
