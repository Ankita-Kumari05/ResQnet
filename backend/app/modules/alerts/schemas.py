"""
Emergency Alerts Schemas
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator

from app.db.models import AlertSeverity


class EmergencyAlertCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Alert title")
    message: str = Field(..., min_length=1, description="Alert broadcast message")
    severity: AlertSeverity = Field(AlertSeverity.ADVISORY, description="Severity level")
    alert_type: str = Field("evacuation", min_length=1, max_length=100, description="Alert category type")
    affected_area_geojson: Optional[Dict[str, Any]] = Field(
        None, description="GeoJSON Polygon or MultiPolygon representing the affected spatial area"
    )
    expires_at: Optional[datetime] = Field(None, description="Optional future expiration timestamp")

    @field_validator("title", "message", "alert_type")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be empty or whitespace only.")
        return v.strip()

    @field_validator("expires_at")
    @classmethod
    def validate_expires_at(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is not None:
            now = datetime.now(timezone.utc)
            if v.tzinfo is None:
                v = v.replace(tzinfo=timezone.utc)
            if v <= now:
                raise ValueError("expires_at must be in the future.")
        return v

    @field_validator("affected_area_geojson")
    @classmethod
    def validate_geojson(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is None:
            return None

        if not isinstance(v, dict):
            raise ValueError("GeoJSON must be a valid JSON object.")

        geom_type = v.get("type")
        if geom_type not in ["Polygon", "MultiPolygon"]:
            raise ValueError("Geometry type must be 'Polygon' or 'MultiPolygon'.")

        coordinates = v.get("coordinates")
        if not coordinates or not isinstance(coordinates, list):
            raise ValueError("GeoJSON must contain non-empty 'coordinates' list.")

        # Helper to validate a coordinate pair [lng, lat]
        def validate_pt(pt: Any):
            if not isinstance(pt, (list, tuple)) or len(pt) < 2:
                raise ValueError("Coordinate point must be [longitude, latitude].")
            lng, lat = pt[0], pt[1]
            if not isinstance(lng, (int, float)) or not isinstance(lat, (int, float)):
                raise ValueError("Coordinate values must be numeric.")
            if not (-180.0 <= lng <= 180.0):
                raise ValueError(f"Longitude {lng} out of bounds [-180, 180].")
            if not (-90.0 <= lat <= 90.0):
                raise ValueError(f"Latitude {lat} out of bounds [-90, 90].")

        def validate_ring(ring: Any):
            if not isinstance(ring, list) or len(ring) < 4:
                raise ValueError("Polygon ring must have at least 4 coordinate points.")
            for pt in ring:
                validate_pt(pt)
            # Ensure closed ring
            if ring[0][0] != ring[-1][0] or ring[0][1] != ring[-1][1]:
                raise ValueError("Polygon ring must be closed (first and last coordinate must match).")

        if geom_type == "Polygon":
            for ring in coordinates:
                validate_ring(ring)
        elif geom_type == "MultiPolygon":
            for polygon in coordinates:
                if not isinstance(polygon, list):
                    raise ValueError("MultiPolygon must contain list of polygons.")
                for ring in polygon:
                    validate_ring(ring)

        return v


class EmergencyAlertUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    message: Optional[str] = Field(None, min_length=1)
    severity: Optional[AlertSeverity] = None
    expires_at: Optional[datetime] = None

    @field_validator("title", "message")
    @classmethod
    def validate_non_empty_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not v or not v.strip():
                raise ValueError("Field cannot be empty or whitespace only.")
            return v.strip()
        return v

    @field_validator("expires_at")
    @classmethod
    def validate_expires_at_optional(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is not None:
            now = datetime.now(timezone.utc)
            if v.tzinfo is None:
                v = v.replace(tzinfo=timezone.utc)
            if v <= now:
                raise ValueError("expires_at must be in the future.")
        return v


class EmergencyAlertResponse(BaseModel):
    id: int
    title: str
    message: str
    severity: AlertSeverity
    alert_type: str
    affected_area_geojson: Optional[Dict[str, Any]] = None
    is_active: bool
    issued_by_id: Optional[int]
    created_at: datetime
    expires_at: Optional[datetime] = None
    is_fresh: bool = True
    is_expired: bool = False
    recipients_count: Optional[int] = None
    sent_to_users_display: Optional[str] = None

    class Config:
        from_attributes = True
