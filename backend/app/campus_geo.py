"""示意校区边界（与前端 campuses.ts 粤海环一致），用于平面图 nx/ny → 近似经纬度。"""

from __future__ import annotations

# [lng, lat] 闭合环（与 frontend/src/data/campuses.ts 保持同步）
YUEHAI_RING: list[tuple[float, float]] = [
    (113.9262, 22.5348),
    (113.9318, 22.5336),
    (113.9384, 22.5342),
    (113.9412, 22.5378),
    (113.9396, 22.5412),
    (113.9344, 22.5426),
    (113.9288, 22.5414),
    (113.9256, 22.5386),
    (113.9262, 22.5348),
]

# 丽湖校区示意环（与前端 `campuses.ts` 同步；上线前请替换为正式测绘）
LIHU_RING: list[tuple[float, float]] = [
    (114.058, 22.588),
    (114.072, 22.586),
    (114.078, 22.596),
    (114.068, 22.602),
    (114.055, 22.598),
    (114.058, 22.588),
]

RINGS: dict[str, list[tuple[float, float]]] = {
    "yuehai": YUEHAI_RING,
    "lihu": LIHU_RING,
}


def ring_bbox(ring: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    lngs = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    return min(lngs), max(lngs), min(lats), max(lats)


def nx_ny_to_lng_lat(campus_id: str, nx: float, ny: float) -> tuple[float, float]:
    """平面图坐标 0~1 映射到校区包围盒内近似经纬度（顶边视为更北 = 较大纬度）。"""
    ring = RINGS.get(campus_id) or RINGS["yuehai"]
    min_lng, max_lng, min_lat, max_lat = ring_bbox(ring)
    lng = min_lng + nx * (max_lng - min_lng)
    lat = max_lat - ny * (max_lat - min_lat)
    return lng, lat
