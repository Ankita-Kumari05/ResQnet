"""
Map Module — Domain Service
Provides the shared map-state snapshot (GET /map/state) and CRUD operations for
coordinator-authored map features (road closures, hub geometries).
All writes are logged to audit_logs. Existing endpoint contracts are untouched.
"""
import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import LineString, Point, Polygon, mapping
from shapely.geometry import shape as shapely_shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    BadRequestException,
    ForbiddenException,
    NotFoundException,
)
from app.db.models import (
    AuditLog,
    HazardZone,
    HubMapGeometry,
    RoadClosure,
    SafetyHub,
    User,
    UserRole,
)
from app.modules.map.schemas import (
    GeoJSONFeature,
    HubMapGeometryOut,
    HubMapGeometryUpsert,
    MapStateResponse,
    RoadClosureCreate,
    RoadClosureOut,
    RoadClosureUpdate,
)
from app.modules.routing.cache import invalidate_route_cache


# ── Geometry helpers ───────────────────────────────────────────────────────────

def _geom_to_dict(geom_col) -> Optional[Dict[str, Any]]:
    """Safely converts a PostGIS geometry column value to a GeoJSON dict."""
    if geom_col is None:
        return None
    try:
        return dict(mapping(to_shape(geom_col)))
    except Exception:
        return None


def _linestring_from_geojson(geojson: Dict[str, Any]):
    """Parses a GeoJSON LineString dict into a PostGIS geometry value."""
    try:
        shape = shapely_shape(geojson)
        if not isinstance(shape, LineString) or not shape.is_valid:
            raise BadRequestException(
                message="Invalid LineString geometry.",
                code="INVALID_LINESTRING_GEOMETRY",
            )
        return from_shape(shape, srid=4326)
    except BadRequestException:
        raise
    except Exception as exc:
        raise BadRequestException(
            message=f"Failed to parse LineString geometry: {exc}",
            code="INVALID_LINESTRING_GEOMETRY",
        )


def _point_from_geojson(geojson: Dict[str, Any]):
    try:
        shape = shapely_shape(geojson)
        if not isinstance(shape, Point):
            raise BadRequestException(message="entrance_geom must be a Point.", code="INVALID_POINT")
        return from_shape(shape, srid=4326)
    except BadRequestException:
        raise
    except Exception as exc:
        raise BadRequestException(message=f"Failed to parse Point: {exc}", code="INVALID_POINT")


def _polygon_from_geojson(geojson: Dict[str, Any]):
    try:
        shape = shapely_shape(geojson)
        if not isinstance(shape, Polygon) or not shape.is_valid:
            raise BadRequestException(message="area_geom must be a valid Polygon.", code="INVALID_POLYGON")
        return from_shape(shape, srid=4326)
    except BadRequestException:
        raise
    except Exception as exc:
        raise BadRequestException(message=f"Failed to parse Polygon: {exc}", code="INVALID_POLYGON")


def _require_coordinator(user: User) -> None:
    if user.role != UserRole.coordinator:
        raise ForbiddenException(
            message="This action is restricted to Coordinators.",
            code="FORBIDDEN_COORDINATOR_ONLY",
        )


# ── Map state ─────────────────────────────────────────────────────────────────

async def get_map_state_service(db: AsyncSession) -> MapStateResponse:
    """
    Returns a GeoJSON snapshot of all active map features:
      - active hazard zones (hazard_zones table)
      - all safety hubs with optional Map Engine V2 geometry (safety_hubs + hub_map_geometry)
      - active road closures (road_closures table)
    Accessible to all authenticated roles.
    """
    # Hazards
    hazard_rows = (await db.execute(
        select(HazardZone).where(HazardZone.is_active == True).order_by(HazardZone.id)
    )).scalars().all()

    hazard_features: List[GeoJSONFeature] = [
        GeoJSONFeature(
            geometry=_geom_to_dict(h.geom),
            properties={
                "id": h.id,
                "name": h.name,
                "hazard_type": h.hazard_type,
                "severity": h.severity.value if h.severity else None,
                "is_active": h.is_active,
            },
        )
        for h in hazard_rows
    ]

    # Hubs (join hub_map_geometry via ORM relationship — loaded lazily via selectin)
    hub_rows = (await db.execute(
        select(SafetyHub).order_by(SafetyHub.id)
    )).scalars().all()

    hub_features: List[GeoJSONFeature] = []
    for hub in hub_rows:
        # Eager-load map_geometry if present
        mgeo_row = (await db.execute(
            select(HubMapGeometry).where(HubMapGeometry.hub_id == hub.id)
        )).scalar_one_or_none()

        hub_features.append(
            GeoJSONFeature(
                geometry=_geom_to_dict(hub.geom),  # primary hub point
                properties={
                    "id": hub.id,
                    "name": hub.name,
                    "address": hub.address,
                    "lat": hub.lat,
                    "lng": hub.lng,
                    "max_capacity": hub.max_capacity,
                    "current_occupancy": hub.current_occupancy,
                    "status": hub.status.value if hub.status else None,
                    # Map Engine V2 extras
                    "entrance_geom": _geom_to_dict(mgeo_row.entrance_geom) if mgeo_row else None,
                    "area_geom": _geom_to_dict(mgeo_row.area_geom) if mgeo_row else None,
                    "is_verified": mgeo_row.is_verified if mgeo_row else False,
                    "capabilities": mgeo_row.capabilities if mgeo_row else None,
                },
            )
        )

    # Road closures
    closure_rows = (await db.execute(
        select(RoadClosure).where(RoadClosure.is_active == True).order_by(RoadClosure.id)
    )).scalars().all()

    closure_features: List[GeoJSONFeature] = [
        GeoJSONFeature(
            geometry=_geom_to_dict(c.geom),
            properties={
                "id": c.id,
                "kind": c.kind,
                "name": c.name,
                "road_id": c.road_id,
                "is_active": c.is_active,
                "reason": c.reason,
                "created_by_id": c.created_by_id,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            },
        )
        for c in closure_rows
    ]

    features = {
        "hazards": [feature.model_dump(mode="json") for feature in hazard_features],
        "hubs": [feature.model_dump(mode="json") for feature in hub_features],
        "closures": [feature.model_dump(mode="json") for feature in closure_features],
    }
    version = hashlib.sha256(
        json.dumps(features, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    return MapStateResponse(
        version=version,
        hazards=hazard_features,
        hubs=hub_features,
        closures=closure_features,
    )


# ── Road closure CRUD ─────────────────────────────────────────────────────────

def _serialize_closure(c: RoadClosure) -> RoadClosureOut:
    return RoadClosureOut(
        geometry=_geom_to_dict(c.geom),
        properties={
            "id": c.id,
            "kind": c.kind,
            "name": c.name,
            "road_id": c.road_id,
            "is_active": c.is_active,
            "reason": c.reason,
            "created_by_id": c.created_by_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        },
    )


async def list_road_closures_service(db: AsyncSession, active_only: bool = True) -> List[RoadClosureOut]:
    stmt = select(RoadClosure)
    if active_only:
        stmt = stmt.where(RoadClosure.is_active == True)
    stmt = stmt.order_by(RoadClosure.id)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_closure(c) for c in rows]


async def get_road_closure_service(db: AsyncSession, closure_id: int) -> RoadClosureOut:
    row = await db.get(RoadClosure, closure_id)
    if not row:
        raise NotFoundException(message=f"Road closure #{closure_id} not found", code="CLOSURE_NOT_FOUND")
    return _serialize_closure(row)


async def create_road_closure_service(
    db: AsyncSession, user: User, payload: RoadClosureCreate
) -> RoadClosureOut:
    """Creates a coordinator-authored road closure. Logs to audit_logs."""
    _require_coordinator(user)
    geom = _linestring_from_geojson(payload.geom)
    try:
        closure = RoadClosure(
            kind=payload.kind,
            name=payload.name,
            geom=geom,
            road_id=payload.road_id,
            reason=payload.reason,
            is_active=True,
            created_by_id=user.id,
        )
        db.add(closure)
        await db.flush()

        audit = AuditLog(
            actor_id=user.id,
            action="CREATE",
            entity_type="road_closure",
            entity_id=closure.id,
            old_values=None,
            new_values={"kind": closure.kind, "name": closure.name, "is_active": True},
        )
        db.add(audit)
        await db.commit()
        await db.refresh(closure)
        invalidate_route_cache()
        return _serialize_closure(closure)
    except Exception:
        await db.rollback()
        raise


async def update_road_closure_service(
    db: AsyncSession, user: User, closure_id: int, payload: RoadClosureUpdate
) -> RoadClosureOut:
    """PATCHes a road closure (coordinator only). Logs changes to audit_logs."""
    _require_coordinator(user)
    try:
        stmt = select(RoadClosure).where(RoadClosure.id == closure_id).with_for_update()
        closure = (await db.execute(stmt)).scalar_one_or_none()
        if not closure:
            raise NotFoundException(message=f"Road closure #{closure_id} not found", code="CLOSURE_NOT_FOUND")

        old_values = {
            "kind": closure.kind,
            "name": closure.name,
            "is_active": closure.is_active,
            "reason": closure.reason,
        }
        changed = False

        if payload.kind is not None:
            closure.kind = payload.kind
            changed = True
        if payload.name is not None:
            closure.name = payload.name
            changed = True
        if payload.geom is not None:
            closure.geom = _linestring_from_geojson(payload.geom)
            changed = True
        if payload.road_id is not None:
            closure.road_id = payload.road_id
            changed = True
        if payload.is_active is not None:
            closure.is_active = payload.is_active
            changed = True
        if payload.reason is not None:
            closure.reason = payload.reason
            changed = True

        if changed:
            closure.updated_at = datetime.now(timezone.utc)
            audit = AuditLog(
                actor_id=user.id,
                action="UPDATE",
                entity_type="road_closure",
                entity_id=closure.id,
                old_values=old_values,
                new_values={
                    "kind": closure.kind,
                    "name": closure.name,
                    "is_active": closure.is_active,
                    "reason": closure.reason,
                },
            )
            db.add(audit)
            await db.commit()
            await db.refresh(closure)
            invalidate_route_cache()

        return _serialize_closure(closure)
    except (NotFoundException, ForbiddenException, BadRequestException):
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise


async def deactivate_road_closure_service(
    db: AsyncSession, user: User, closure_id: int
) -> RoadClosureOut:
    """Soft-deletes a road closure by setting is_active=False (coordinator only)."""
    _require_coordinator(user)
    try:
        stmt = select(RoadClosure).where(RoadClosure.id == closure_id).with_for_update()
        closure = (await db.execute(stmt)).scalar_one_or_none()
        if not closure:
            raise NotFoundException(message=f"Road closure #{closure_id} not found", code="CLOSURE_NOT_FOUND")

        old_active = closure.is_active
        closure.is_active = False
        closure.updated_at = datetime.now(timezone.utc)

        audit = AuditLog(
            actor_id=user.id,
            action="DEACTIVATION",
            entity_type="road_closure",
            entity_id=closure.id,
            old_values={"is_active": old_active},
            new_values={"is_active": False},
        )
        db.add(audit)
        await db.commit()
        await db.refresh(closure)
        invalidate_route_cache()
        return _serialize_closure(closure)
    except (NotFoundException, ForbiddenException):
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise


# ── Hub map-geometry upsert ───────────────────────────────────────────────────

async def upsert_hub_map_geometry_service(
    db: AsyncSession, user: User, hub_id: int, payload: HubMapGeometryUpsert
) -> HubMapGeometryOut:
    """
    Coordinator upserts Map Engine V2 geometry for a hub (entrance point + area polygon).
    Only writes to hub_map_geometry — the safety_hubs row is NOT altered.
    Logs to audit_logs.
    """
    _require_coordinator(user)

    # Verify hub exists
    hub = await db.get(SafetyHub, hub_id)
    if not hub:
        raise NotFoundException(message=f"Safety hub #{hub_id} not found", code="HUB_NOT_FOUND")

    try:
        stmt = select(HubMapGeometry).where(HubMapGeometry.hub_id == hub_id).with_for_update()
        mgeo = (await db.execute(stmt)).scalar_one_or_none()

        action = "CREATE" if mgeo is None else "UPDATE"
        if mgeo is None:
            mgeo = HubMapGeometry(hub_id=hub_id, is_verified=False)
            db.add(mgeo)

        old_values: Dict[str, Any] = {
            "is_verified": mgeo.is_verified,
            "capabilities": mgeo.capabilities,
        }

        if payload.entrance_geom is not None:
            mgeo.entrance_geom = _point_from_geojson(payload.entrance_geom)
        if payload.area_geom is not None:
            mgeo.area_geom = _polygon_from_geojson(payload.area_geom)
        if payload.is_verified is not None:
            mgeo.is_verified = payload.is_verified
        if payload.capabilities is not None:
            mgeo.capabilities = payload.capabilities

        mgeo.updated_at = datetime.now(timezone.utc)

        await db.flush()

        audit = AuditLog(
            actor_id=user.id,
            action=action,
            entity_type="hub_map_geometry",
            entity_id=hub_id,
            old_values=old_values if action == "UPDATE" else None,
            new_values={
                "hub_id": hub_id,
                "is_verified": mgeo.is_verified,
                "capabilities": mgeo.capabilities,
            },
        )
        db.add(audit)
        await db.commit()
        await db.refresh(mgeo)

        return HubMapGeometryOut(
            hub_id=mgeo.hub_id,
            entrance_geom=_geom_to_dict(mgeo.entrance_geom),
            area_geom=_geom_to_dict(mgeo.area_geom),
            is_verified=mgeo.is_verified,
            capabilities=mgeo.capabilities,
        )
    except (NotFoundException, ForbiddenException, BadRequestException):
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise
