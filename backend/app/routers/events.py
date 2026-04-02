from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import tuple_
from sqlmodel import Session, select

from app.deps import get_admin_user, get_db
from app.models import CampusEvent, User
from app.places import resolve_map_binding
from app.schemas import CampusEventCreate, CampusEventRead
from app.services.rag_index import index_campus_event

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[CampusEventRead])
def list_events(
    session: Annotated[Session, Depends(get_db)],
    campus_id: str = Query(...),
    as_of_year: Optional[int] = Query(None, ge=1900, le=2100),
    as_of_month: Optional[int] = Query(None, ge=1, le=12),
    year_lte: Optional[int] = Query(
        None,
        description="已废弃：请改用 as_of_year + as_of_month（当月及以前累计）",
    ),
) -> list[CampusEvent]:
    stmt = select(CampusEvent).where(CampusEvent.campus_id == campus_id)

    if year_lte is not None and (as_of_year is None or as_of_month is None):
        stmt = stmt.where(CampusEvent.year <= year_lte)
    elif as_of_year is not None and as_of_month is not None:
        # 累计：业务时间 (year, month) 不晚于所选年-月
        stmt = stmt.where(
            tuple_(CampusEvent.year, CampusEvent.month) <= tuple_(as_of_year, as_of_month),
        )
    elif as_of_year is not None or as_of_month is not None:
        raise HTTPException(status_code=400, detail="as_of_year 与 as_of_month 须同时提供")

    stmt = stmt.order_by(CampusEvent.year, CampusEvent.month)
    return list(session.exec(stmt).all())


@router.post("", response_model=CampusEventRead)
def create_event(
    body: CampusEventCreate,
    session: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_admin_user)],
) -> CampusEvent:
    data = body.model_dump()
    raw_pid = data.pop("place_id", None)
    place_id = str(raw_pid).strip() if raw_pid is not None and str(raw_pid).strip() else None
    nx, ny, lng, lat = resolve_map_binding(
        data["campus_id"],
        place_id,
        data.get("nx"),
        data.get("ny"),
        float(data.get("lng", 0)),
        float(data.get("lat", 0)),
    )
    ev = CampusEvent(
        **data,
        place_id=place_id,
        nx=nx,
        ny=ny,
        lng=lng,
        lat=lat,
    )
    session.add(ev)
    session.commit()
    session.refresh(ev)
    index_campus_event(session, ev)
    return ev
