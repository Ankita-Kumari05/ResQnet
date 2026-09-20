"""
Hazard Zone Domain Service
Operational management logic for geographic HazardZone perimeters and verification attribution.
"""
from datetime import datetime, timezone
from typing import List, Optional

from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import Polygon, mapping
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    AppException,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
)
from app.db.models import (
    AuditLog,
    FieldSurvey,
    HazardZone,
    Responder,
    User,
    UserRole,
)
from app.modules.hazards.schemas import (
    HazardZoneCreate,
    HazardZoneResponse,
    HazardZoneUpdate,
)
from app.modules.routing.cache import invalidate_route_cache


def serialize_hazard_zone(zone: HazardZone) -> HazardZoneResponse:
    """Safely converts a HazardZone ORM instance into a HazardZoneResponse schema."""
    geom_dict = None
    if zone.geom is not None:
        try:
            shape = to_shape(zone.geom)
            geom_dict = mapping(shape)
        except Exception:
            geom_dict = None

    return HazardZoneResponse(
        id=zone.id,
        name=zone.name,
        hazard_type=zone.hazard_type,
        severity=zone.severity,
        is_active=zone.is_active,
        last_verified_survey_id=zone.last_verified_survey_id,
        geometry=geom_dict,
        created_at=zone.created_at,
        updated_at=zone.updated_at,
    )


async def list_hazard_zones_service(
    db: AsyncSession, active_only: bool = True
) -> List[HazardZoneResponse]:
    """Returns active hazard zones (or all if active_only=False)."""
    stmt = select(HazardZone)
    if active_only:
        stmt = stmt.where(HazardZone.is_active == True)
    
    stmt = stmt.order_by(HazardZone.id)
    result = await db.execute(stmt)
    zones = result.scalars().all()
    return [serialize_hazard_zone(z) for z in zones]


async def get_hazard_zone_service(
    db: AsyncSession, zone_id: int
) -> HazardZoneResponse:
    """Returns requested hazard zone detail or raises 404."""
    zone = await db.get(HazardZone, zone_id)
    if not zone:
        raise NotFoundException(
            message=f"Hazard zone #{zone_id} not found",
            code="HAZARD_ZONE_NOT_FOUND",
        )
    return serialize_hazard_zone(zone)


async def create_hazard_zone_service(
    db: AsyncSession, current_user: User, payload: HazardZoneCreate
) -> HazardZoneResponse:
    """
    Creates a new hazard zone perimeter (Coordinator ONLY).
    Validates GeoJSON polygon structure and stores in SRID 4326.
    """
    if current_user.role != UserRole.coordinator:
        raise ForbiddenException(
            message="Only Coordinators are authorized to create hazard zones.",
            code="FORBIDDEN_HAZARD_CREATION",
        )

    # Extract polygon coordinates
    raw_coords = None
    if payload.geometry and isinstance(payload.geometry, dict):
        geom_type = payload.geometry.get("type", "")
        if geom_type.lower() != "polygon":
            raise BadRequestException(
                message=f"Invalid geometry type '{geom_type}'. Geometry must be a Polygon.",
                code="INVALID_GEOMETRY_TYPE",
            )
        raw_coords = payload.geometry.get("coordinates")
    elif payload.coordinates:
        raw_coords = payload.coordinates

    if not raw_coords or not isinstance(raw_coords, list) or len(raw_coords) == 0:
        raise BadRequestException(
            message="Hazard zone creation requires valid polygon coordinates.",
            code="MISSING_POLYGON_COORDINATES",
        )

    try:
        # Shapely polygon construction: raw_coords[0] is exterior ring
        exterior_ring = raw_coords[0] if isinstance(raw_coords[0], list) else raw_coords
        if len(exterior_ring) < 3:
            raise BadRequestException(
                message="Polygon exterior ring must contain at least 3 coordinate points.",
                code="INSUFFICIENT_COORDINATE_POINTS",
            )
        poly = Polygon(exterior_ring)
        if not poly.is_valid:
            raise BadRequestException(
                message="Submitted coordinates do not form a valid geographic polygon.",
                code="INVALID_POLYGON_GEOMETRY",
            )
        postgis_geom = from_shape(poly, srid=4326)
    except BadRequestException:
        raise
    except Exception as e:
        raise BadRequestException(
            message=f"Failed to parse polygon geometry: {str(e)}",
            code="INVALID_POLYGON_GEOMETRY",
        )

    try:
        zone = HazardZone(
            name=payload.name,
            hazard_type=payload.hazard_type,
            severity=payload.severity,
            is_active=True,
            geom=postgis_geom,
        )
        db.add(zone)
        await db.flush()  # populate zone.id

        audit_entry = AuditLog(
            actor_id=current_user.id,
            action="CREATE",
            entity_type="hazard_zone",
            entity_id=zone.id,
            old_values=None,
            new_values={
                "name": zone.name,
                "hazard_type": zone.hazard_type,
                "severity": zone.severity.value,
                "is_active": True,
            },
        )
        db.add(audit_entry)
        await db.commit()
        await db.refresh(zone)
        invalidate_route_cache()
        return serialize_hazard_zone(zone)
    except Exception:
        await db.rollback()
        raise


async def update_hazard_zone_service(
    db: AsyncSession, current_user: User, zone_id: int, payload: HazardZoneUpdate
) -> HazardZoneResponse:
    """
    Updates operational attributes of a hazard zone (Coordinator or authorized Responder).
    Fields limited to severity, is_active, last_verified_survey_id.
    """
    if current_user.role not in (UserRole.coordinator, UserRole.responder):
        raise ForbiddenException(
            message="Only Coordinators and Responders are authorized to update hazard zones.",
            code="FORBIDDEN_HAZARD_UPDATE",
        )

    try:
        stmt = select(HazardZone).where(HazardZone.id == zone_id).with_for_update()
        result = await db.execute(stmt)
        zone = result.scalar_one_or_none()

        if not zone:
            raise NotFoundException(
                message=f"Hazard zone #{zone_id} not found",
                code="HAZARD_ZONE_NOT_FOUND",
            )

        old_values = {
            "severity": zone.severity.value if zone.severity else None,
            "is_active": zone.is_active,
            "last_verified_survey_id": zone.last_verified_survey_id,
        }
        changes_made = False
        action_type = "UPDATE"

        if payload.severity is not None and payload.severity != zone.severity:
            zone.severity = payload.severity
            changes_made = True
            action_type = "SEVERITY UPDATE"

        if payload.is_active is not None and payload.is_active != zone.is_active:
            zone.is_active = payload.is_active
            changes_made = True

        if payload.last_verified_survey_id is not None:
            # Validate referenced field survey exists
            survey = await db.get(FieldSurvey, payload.last_verified_survey_id)
            if not survey:
                raise NotFoundException(
                    message=f"Field survey #{payload.last_verified_survey_id} not found",
                    code="FIELD_SURVEY_NOT_FOUND",
                )

            # Responder ownership / authorization check
            if current_user.role == UserRole.responder:
                res_stmt = select(Responder).where(Responder.user_id == current_user.id)
                res_result = await db.execute(res_stmt)
                responder = res_result.scalar_one_or_none()

                if not responder or survey.responder_id != responder.id:
                    raise ForbiddenException(
                        message="Responders can only link field surveys that they submitted.",
                        code="UNAUTHORIZED_SURVEY_LINK",
                    )

            if zone.last_verified_survey_id != payload.last_verified_survey_id:
                zone.last_verified_survey_id = payload.last_verified_survey_id
                changes_made = True
                action_type = "VERIFICATION LINK" if action_type == "UPDATE" else action_type

        if changes_made:
            zone.updated_at = datetime.now(timezone.utc)
            new_values = {
                "severity": zone.severity.value if zone.severity else None,
                "is_active": zone.is_active,
                "last_verified_survey_id": zone.last_verified_survey_id,
            }
            audit_entry = AuditLog(
                actor_id=current_user.id,
                action=action_type,
                entity_type="hazard_zone",
                entity_id=zone.id,
                old_values=old_values,
                new_values=new_values,
            )
            db.add(audit_entry)
            await db.commit()
            await db.refresh(zone)
            invalidate_route_cache()

        return serialize_hazard_zone(zone)
    except (AppException, NotFoundException, ForbiddenException, BadRequestException):
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise


async def deactivate_hazard_zone_service(
    db: AsyncSession, current_user: User, zone_id: int
) -> HazardZoneResponse:
    """
    Deactivates a hazard zone perimeter (Coordinator ONLY).
    Sets is_active = False and updates updated_at timestamp. Record is preserved.
    """
    if current_user.role != UserRole.coordinator:
        raise ForbiddenException(
            message="Only Coordinators are authorized to deactivate hazard zones.",
            code="FORBIDDEN_HAZARD_DEACTIVATION",
        )

    try:
        stmt = select(HazardZone).where(HazardZone.id == zone_id).with_for_update()
        result = await db.execute(stmt)
        zone = result.scalar_one_or_none()

        if not zone:
            raise NotFoundException(
                message=f"Hazard zone #{zone_id} not found",
                code="HAZARD_ZONE_NOT_FOUND",
            )

        old_values = {
            "is_active": zone.is_active,
            "updated_at": zone.updated_at.isoformat() if zone.updated_at else None,
        }

        zone.is_active = False
        zone.updated_at = datetime.now(timezone.utc)

        audit_entry = AuditLog(
            actor_id=current_user.id,
            action="DEACTIVATION",
            entity_type="hazard_zone",
            entity_id=zone.id,
            old_values=old_values,
            new_values={
                "is_active": False,
                "updated_at": zone.updated_at.isoformat(),
            },
        )
        db.add(audit_entry)
        await db.commit()
        await db.refresh(zone)
        invalidate_route_cache()
        return serialize_hazard_zone(zone)
    except (AppException, NotFoundException, ForbiddenException):
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise
