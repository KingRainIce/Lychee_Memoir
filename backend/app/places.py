"""从 annotations.json 加载平面图标注；place_id / 地点目录使用「框顶中点略上方」与前端平面图气泡一致。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from app.campus_geo import nx_ny_to_lng_lat
from app.config import get_settings


def _backend_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _annotation_path_candidates() -> list[Path]:
    s = get_settings()
    out: list[Path] = []
    if s.ANNOTATIONS_JSON_PATH:
        out.append(Path(s.ANNOTATIONS_JSON_PATH))
    out.append(_backend_root() / "data" / "annotations.json")
    repo = _backend_root().parent
    out.append(repo / "frontend" / "public" / "annotations.json")
    return out


def _load_raw() -> dict[str, Any]:
    for p in _annotation_path_candidates():
        try:
            if p.is_file():
                with open(p, encoding="utf-8") as f:
                    return json.load(f)
        except OSError:
            continue
        except json.JSONDecodeError:
            continue
    return {"version": 1, "items": []}


def _clamp01(x: float) -> float:
    return min(1.0, max(0.0, x))


# 与前端 bubbleAnchorAboveAnnotation 一致：气泡在标注矩形顶边中点再略向上（ny 减小）
_PLANAR_ABOVE_NY = 0.028


def _anchor_from_item(it: dict[str, Any]) -> tuple[float, float]:
    """优先顶层 nx/ny；否则用 bbox 中心（图钉/几何中心，非气泡位）。"""
    bbox = it.get("bbox") if isinstance(it.get("bbox"), dict) else {}
    try:
        if "nx" in it and "ny" in it:
            return float(it["nx"]), float(it["ny"])
    except (TypeError, ValueError):
        pass
    try:
        bx = float(bbox.get("nx", 0))
        by = float(bbox.get("ny", 0))
        bw = float(bbox.get("nw", 0))
        bh = float(bbox.get("nh", 0))
        return bx + bw / 2, by + bh / 2
    except (TypeError, ValueError):
        return 0.0, 0.0


def _planar_bubble_anchor_from_item(it: dict[str, Any]) -> tuple[float, float]:
    """
    平面图气泡锚点：与前端 placeHydrate.bubbleAnchorAboveAnnotation 一致。
    有 bbox 时用顶边中点略上方；否则在图钉/中心基础上上移，避免与可见框错位。
    """
    bbox = it.get("bbox") if isinstance(it.get("bbox"), dict) else {}
    try:
        bx = float(bbox.get("nx", 0))
        by = float(bbox.get("ny", 0))
        bw = float(bbox.get("nw", 0))
        bh = float(bbox.get("nh", 0))
        if bw > 0 and bh > 0:
            return _clamp01(bx + bw / 2), _clamp01(by - _PLANAR_ABOVE_NY)
    except (TypeError, ValueError):
        pass
    try:
        if "nx" in it and "ny" in it:
            return _clamp01(float(it["nx"])), _clamp01(float(it["ny"]) - _PLANAR_ABOVE_NY)
    except (TypeError, ValueError):
        pass
    ax, ay = _anchor_from_item(it)
    return ax, _clamp01(ay - _PLANAR_ABOVE_NY)


def iter_annotation_items() -> list[dict[str, Any]]:
    data = _load_raw()
    items = data.get("items")
    if not isinstance(items, list):
        return []
    return [x for x in items if isinstance(x, dict)]


def list_map_places() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for it in iter_annotation_items():
        pid = it.get("id")
        if not pid:
            continue
        nx, ny = _planar_bubble_anchor_from_item(it)
        k = it.get("kind")
        out.append(
            {
                "id": str(pid),
                "label": str(it.get("label") or ""),
                "nx": nx,
                "ny": ny,
                "kind": str(k) if k is not None else None,
            }
        )
    return out


def get_anchor_for_place(place_id: str) -> Optional[tuple[float, float]]:
    for it in iter_annotation_items():
        if str(it.get("id")) == str(place_id):
            return _planar_bubble_anchor_from_item(it)
    return None


def resolve_map_binding(
    campus_id: str,
    place_id: Optional[str],
    nx: Optional[float],
    ny: Optional[float],
    lng: float,
    lat: float,
) -> tuple[Optional[float], Optional[float], float, float]:
    """
    若 place_id 在标注目录中存在，用平面图气泡锚点（bbox 顶边中点略上方）写 nx/ny 并换算 lng/lat；
    否则若请求带 nx/ny（地图点选），则换算 lng/lat；否则保留请求体中的 lng/lat。
    """
    if place_id and place_id.strip():
        anchor = get_anchor_for_place(place_id.strip())
        if anchor is not None:
            nx2, ny2 = anchor
            lng2, lat2 = nx_ny_to_lng_lat(campus_id, nx2, ny2)
            return nx2, ny2, lng2, lat2
    if nx is not None and ny is not None:
        lng2, lat2 = nx_ny_to_lng_lat(campus_id, float(nx), float(ny))
        return float(nx), float(ny), lng2, lat2
    return nx, ny, lng, lat
