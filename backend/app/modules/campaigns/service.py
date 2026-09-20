"""
ResQnet Relief Campaigns Service Layer (Step 6.12)
Handles campaign lifecycle, operational requirement linkage, share slug generation,
RBAC enforcement, state machine invariant validation, and audit logging.
"""
import secrets
import string
from typing import Dict, Any, List, Optional
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Campaign,
    CampaignStatus,
    ResourceRequirement,
    RequirementStatus,
    SafetyHub,
    User,
    UserRole,
    AuditLog,
)
from app.modules.campaigns.schemas import CampaignCreate, CampaignUpdate


def enrich_campaign_dict(c: Campaign) -> Dict[str, Any]:
    """Formats Campaign ORM instance into response dictionary with progress metric."""
    progress = round((c.raised_amount / max(c.target_amount, 1.0)) * 100.0, 1)
    return {
        "id": c.id,
        "title": c.title,
        "description": c.description,
        "status": c.status,
        "hub_id": c.hub_id,
        "requirement_id": c.requirement_id,
        "ngo_user_id": c.ngo_user_id,
        "resource_type": c.resource_type,
        "target_amount": c.target_amount,
        "raised_amount": c.raised_amount,
        "share_slug": c.share_slug,
        "progress_percent": progress,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


async def generate_unique_share_slug(db: AsyncSession, length: int = 10) -> str:
    """Generates a collision-resistant 10-char alphanumeric share slug."""
    chars = string.ascii_lowercase + string.digits
    for _ in range(10):
        slug = "".join(secrets.choice(chars) for _ in range(length))
        res = await db.execute(select(Campaign).where(Campaign.share_slug == slug))
        if not res.scalar_one_or_none():
            return slug
    raise HTTPException(status_code=500, detail="Failed to generate unique campaign share slug")


async def log_campaign_audit(
    db: AsyncSession,
    actor_id: int,
    action: str,
    campaign_id: int,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
) -> AuditLog:
    """Appends an immutable audit log entry for campaign operations."""
    audit = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type="campaigns",
        entity_id=campaign_id,
        old_values=old_values,
        new_values=new_values,
    )
    db.add(audit)
    return audit


async def create_campaign_service(
    db: AsyncSession,
    payload: CampaignCreate,
    actor_user: User,
) -> Dict[str, Any]:
    """
    Creates a relief campaign.
    RBAC:
    - Fundraisers and Coordinators only. Citizens and Responders blocked.
    Validation:
    - Fundraiser MUST supply requirement_id linking to a valid, open/in_transit ResourceRequirement.
    - hub_id and resource_type are derived directly from requirement.
    - Server generates share_slug and sets ngo_user_id = actor_user.id.
    """
    if actor_user.role not in [UserRole.fundraiser, UserRole.coordinator]:
        raise HTTPException(status_code=403, detail="Only fundraisers and coordinators can create campaigns")

    if getattr(actor_user, "verification_status", "verified") != "verified":
        raise HTTPException(
            status_code=403,
            detail=f"Organization or user account is not verified (status: {getattr(actor_user, 'verification_status', 'pending')}). Verification required to launch campaigns.",
        )

    hub_id: Optional[int] = payload.hub_id
    resource_type = payload.resource_type
    target_amount: float = payload.target_amount or 10000.0

    if payload.requirement_id is not None:
        # Validate operational requirement linkage
        req = await db.get(ResourceRequirement, payload.requirement_id)
        if not req:
            raise HTTPException(status_code=404, detail="Linked ResourceRequirement not found")

        if req.status not in [RequirementStatus.open, RequirementStatus.in_transit]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot link campaign to requirement with status '{req.status.value}'",
            )

        # Server-authoritative derivation of hub_id and resource_type
        hub_id = req.hub_id
        resource_type = req.resource_type

        # If client supplied target_amount, use it; otherwise derive from requirement shortfall
        if payload.target_amount is None:
            target_amount = round(max(req.shortfall_quantity * 100.0, 1000.0), 2)
    else:
        # Standalone campaign validation
        if actor_user.role != UserRole.coordinator:
            raise HTTPException(
                status_code=400,
                detail="Fundraisers must link campaigns to a valid operational ResourceRequirement",
            )
        if not payload.hub_id:
            raise HTTPException(status_code=400, detail="Standalone campaign requires a valid hub_id")

        hub = await db.get(SafetyHub, payload.hub_id)
        if not hub:
            raise HTTPException(status_code=404, detail="Safety Hub not found")

        if payload.target_amount is None or payload.target_amount <= 0:
            raise HTTPException(status_code=400, detail="target_amount must be specified and greater than 0")

    slug = await generate_unique_share_slug(db)

    campaign = Campaign(
        title=payload.title,
        description=payload.description,
        status=CampaignStatus.active,
        hub_id=hub_id,
        requirement_id=payload.requirement_id,
        ngo_user_id=actor_user.id,
        resource_type=resource_type,
        target_amount=round(target_amount, 2),
        raised_amount=0.0,
        share_slug=slug,
    )
    db.add(campaign)
    await db.flush()

    await log_campaign_audit(
        db,
        actor_id=actor_user.id,
        action="RELIEF_CAMPAIGN_CREATED",
        campaign_id=campaign.id,
        new_values={
            "title": campaign.title,
            "requirement_id": campaign.requirement_id,
            "hub_id": campaign.hub_id,
            "target_amount": campaign.target_amount,
            "share_slug": campaign.share_slug,
        },
    )

    await db.commit()
    await db.refresh(campaign)
    return enrich_campaign_dict(campaign)


async def get_all_campaigns_service(
    db: AsyncSession,
    hub_id: Optional[int] = None,
    status_filter: Optional[CampaignStatus] = None,
) -> List[Dict[str, Any]]:
    """Lists campaigns. Default excludes closed campaigns unless specifically requested."""
    stmt = select(Campaign)
    if hub_id is not None:
        stmt = stmt.where(Campaign.hub_id == hub_id)
    if status_filter is not None:
        stmt = stmt.where(Campaign.status == status_filter)
    else:
        stmt = stmt.where(Campaign.status != CampaignStatus.closed)

    stmt = stmt.order_by(Campaign.created_at.desc())
    result = await db.execute(stmt)
    campaigns = result.scalars().all()
    return [enrich_campaign_dict(c) for c in campaigns]


async def get_campaign_by_id_service(db: AsyncSession, campaign_id: int) -> Dict[str, Any]:
    """Retrieves a single campaign by ID or raises 404."""
    c = await db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return enrich_campaign_dict(c)


async def get_campaign_by_slug_service(db: AsyncSession, slug: str) -> Dict[str, Any]:
    """Retrieves a single campaign by share_slug or raises 404."""
    result = await db.execute(select(Campaign).where(Campaign.share_slug == slug))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return enrich_campaign_dict(c)


async def update_campaign_service(
    db: AsyncSession,
    campaign_id: int,
    payload: CampaignUpdate,
    actor_user: User,
) -> Dict[str, Any]:
    """
    Updates campaign details or status.
    RBAC:
    - Campaign owner (ngo_user_id == actor_user.id) or Coordinator.
    State Invariant:
    - Locked state machine: Cannot reopen FULFILLED or CLOSED campaigns to ACTIVE.
    """
    stmt = select(Campaign).where(Campaign.id == campaign_id).with_for_update()
    res = await db.execute(stmt)
    campaign = res.scalar_one_or_none()

    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Ownership check
    if actor_user.role != UserRole.coordinator and campaign.ngo_user_id != actor_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this campaign")

    old_status = campaign.status
    old_values = {
        "title": campaign.title,
        "description": campaign.description,
        "status": campaign.status.value,
    }

    # State machine transition check
    if payload.status is not None:
        if campaign.status in [CampaignStatus.fulfilled, CampaignStatus.closed] and payload.status == CampaignStatus.active:
            raise HTTPException(
                status_code=400,
                detail=f"Illegal state transition: Cannot reopen {campaign.status.value} campaign to active",
            )
        if payload.status == CampaignStatus.closed:
            campaign.status = CampaignStatus.closed

    if payload.title is not None:
        campaign.title = payload.title
    if payload.description is not None:
        campaign.description = payload.description

    action = "RELIEF_CAMPAIGN_CLOSED" if campaign.status == CampaignStatus.closed and old_status != CampaignStatus.closed else "RELIEF_CAMPAIGN_UPDATED"

    await log_campaign_audit(
        db,
        actor_id=actor_user.id,
        action=action,
        campaign_id=campaign.id,
        old_values=old_values,
        new_values={
            "title": campaign.title,
            "description": campaign.description,
            "status": campaign.status.value,
        },
    )

    await db.commit()
    await db.refresh(campaign)
    return enrich_campaign_dict(campaign)


async def sync_campaigns_for_requirement(
    db: AsyncSession,
    requirement_id: int,
    new_req_status: RequirementStatus,
    actor_id: int,
) -> None:
    """
    Synchronizes linked active campaigns when a ResourceRequirement changes status.
    - Requirement FULFILLED -> ACTIVE campaign becomes FULFILLED
    - Requirement CANCELLED -> ACTIVE campaign becomes CLOSED
    - Never reopens FULFILLED or CLOSED campaigns.
    """
    if new_req_status not in [RequirementStatus.fulfilled, RequirementStatus.cancelled]:
        return

    stmt = (
        select(Campaign)
        .where(
            Campaign.requirement_id == requirement_id,
            Campaign.status == CampaignStatus.active,
        )
        .with_for_update()
    )
    result = await db.execute(stmt)
    campaigns = result.scalars().all()

    target_status = CampaignStatus.fulfilled if new_req_status == RequirementStatus.fulfilled else CampaignStatus.closed
    action = "RELIEF_CAMPAIGN_FULFILLED" if target_status == CampaignStatus.fulfilled else "RELIEF_CAMPAIGN_CLOSED"

    for c in campaigns:
        old_status = c.status
        c.status = target_status
        await log_campaign_audit(
            db,
            actor_id=actor_id,
            action=action,
            campaign_id=c.id,
            old_values={"status": old_status.value},
            new_values={"status": target_status.value, "reason": f"linked_requirement_{new_req_status.value}"},
        )

