"""
Map Module — Pydantic Schemas
Shapes for the /map/state and /map/road-closures endpoints consumed by Map Engine V2.
All geometry fields follow the GeoJSON spec (type + coordinates).
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, field_validator


# ── Generic GeoJSON feature shell ─────────────────────────────────────────────

class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: Optional[Dict[str, Any]] = None
    properties: Dict[str, Any] = {}


# ── Map state ─────────────────────────────────────────────────────────────────

class MapStateResponse(BaseModel):
    """Snapshot of all active map features — consumed by Map Engine V2 on load."""
    version: str
    hazards: List[GeoJSONFeature] = []
    hubs: List[GeoJSONFeature] = []
    closures: List[GeoJSONFeature] = []


# ── Road closure CRUD ─────────────────────────────────────────────────────────

class RoadClosureCreate(BaseModel):
    kind: str                               # 'full' | 'section'
    name: str
    geom: Dict[str, Any]                    # GeoJSON LineString  {"type":"LineString","coordinates":[...]}
    road_id: Optional[int] = None           # optional business link
    reason: Optional[str] = None

    @field_validator("kind")
    @classmethod
    def validate_kind(cls, v: str) -> str:
        if v not in ("full", "section"):
            raise ValueError("kind must be 'full' or 'section'")
        return v

    @field_validator("geom")
    @classmethod
    def validate_geom_linestring(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        if v.get("type") != "LineString":
            raise ValueError("geom must be a GeoJSON LineString")
        coords = v.get("coordinates", [])
        if not isinstance(coords, list) or len(coords) < 2:
            raise ValueError("LineString coordinates must contain at least 2 points")
        return v


class RoadClosureUpdate(BaseModel):
    kind: Optional[str] = None
    name: Optional[str] = None
    geom: Optional[Dict[str, Any]] = None
    road_id: Optional[int] = None
    is_active: Optional[bool] = None
    reason: Optional[str] = None

    @field_validator("kind")
    @classmethod
    def validate_kind(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("full", "section"):
            raise ValueError("kind must be 'full' or 'section'")
        return v


class RoadClosureOut(BaseModel):
    """Full road closure record as a GeoJSON Feature."""
    type: str = "Feature"
    geometry: Optional[Dict[str, Any]]
    properties: Dict[str, Any]


# ── Hub map-geometry upsert ───────────────────────────────────────────────────

class HubMapGeometryUpsert(BaseModel):
    """
    Coordinator upserts entrance point and/or area polygon for a hub.
    Both fields are optional so a partial update is allowed.
    """
    entrance_geom: Optional[Dict[str, Any]] = None   # GeoJSON Point
    area_geom: Optional[Dict[str, Any]] = None        # GeoJSON Polygon
    is_verified: Optional[bool] = None
    capabilities: Optional[Dict[str, Any]] = None

    @field_validator("entrance_geom")
    @classmethod
    def validate_entrance(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is not None and v.get("type") != "Point":
            raise ValueError("entrance_geom must be a GeoJSON Point")
        return v

    @field_validator("area_geom")
    @classmethod
    def validate_area(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is not None and v.get("type") != "Polygon":
            raise ValueError("area_geom must be a GeoJSON Polygon")
        return v


class HubMapGeometryOut(BaseModel):
    hub_id: int
    entrance_geom: Optional[Dict[str, Any]]
    area_geom: Optional[Dict[str, Any]]
    is_verified: bool
    capabilities: Optional[Dict[str, Any]]
