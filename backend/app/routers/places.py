from fastapi import APIRouter

from app.places import list_map_places
from app.schemas import MapPlaceRead

router = APIRouter(prefix="/places", tags=["places"])


@router.get("", response_model=list[MapPlaceRead])
def get_places() -> list[MapPlaceRead]:
    return [MapPlaceRead(**p) for p in list_map_places()]
