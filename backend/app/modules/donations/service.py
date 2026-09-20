"""
ResQnet Mock Donations Service Layer (Step 6.12)
Implements atomic donation transaction protocol, SELECT FOR UPDATE row locking,
transaction_ref idempotency verification, target cap validation, and audit logging.
"""
import uuid
from typing import Dict, Any, List, Optional
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Campaign,
    CampaignStatus,
    Donation,
    User,
    AuditLog,
)
from app.modules.donations.schemas import DonationCreate


def enrich_donation_dict(d: Donation) -> Dict[str, Any]:
    """Formats Donation ORM instance into response dictionary."""
    return {
        "id": d.id,
        "campaign_id": d.campaign_id,
        "donor_name": d.donor_name,
        "amount": d.amount,
        "message": d.message,
        "transaction_ref": d.transaction_ref,
        "created_at": d.created_at,
    }


async def log_donation_audit(
    db: AsyncSession,
    actor_id: Optional[int],
    action: str,
    donation_id: int,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
) -> AuditLog:
    """Appends an immutable audit log entry for donation operations."""
    audit = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type="donations",
        entity_id=donation_id,
        old_values=old_values,
        new_values=new_values,
    )
    db.add(audit)
    return audit


async def make_donation_service(
    db: AsyncSession,
    payload: DonationCreate,
    actor_user: Optional[User] = None,
) -> Dict[str, Any]:
    """
    Executes mock donation using strict transaction protocol:
    1. Idempotency Check: If transaction_ref supplied:
       - Match exact (campaign_id & amount) -> Return existing donation (HTTP 200).
       - Match conflicting -> Raise HTTP 409 Conflict.
    2. Acquire SELECT FOR UPDATE lock on Campaign row.
    3. Re-validate campaign exists and status == ACTIVE.
    4. Calculate remaining target = target_amount - raised_amount.
    5. Reject if amount > remaining target (HTTP 400).
    6. Insert Donation record (generate transaction_ref if omitted).
    7. Atomically increment raised_amount.
    8. If target reached, set status = FULFILLED and audit RELIEF_CAMPAIGN_FULFILLED.
    9. Write DONATION_RECEIVED audit log.
    10. Commit transaction.
    """
    amount = round(payload.amount, 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Donation amount must be greater than 0")

    # 1. Idempotency check via transaction_ref
    tx_ref = payload.transaction_ref
    if tx_ref:
        existing_res = await db.execute(select(Donation).where(Donation.transaction_ref == tx_ref))
        existing_d = existing_res.scalar_one_or_none()
        if existing_d:
            if existing_d.campaign_id == payload.campaign_id and round(existing_d.amount, 2) == amount:
                return enrich_donation_dict(existing_d)
            else:
                raise HTTPException(
                    status_code=409,
                    detail="Transaction reference already exists with conflicting campaign_id or amount",
                )
    else:
        tx_ref = f"tx_{uuid.uuid4().hex[:16]}"

    # 2. Acquire SELECT FOR UPDATE row-level lock on Campaign
    stmt = select(Campaign).where(Campaign.id == payload.campaign_id).with_for_update()
    c_res = await db.execute(stmt)
    campaign = c_res.scalar_one_or_none()

    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # 3. Re-validate status after acquiring lock
    if campaign.status != CampaignStatus.active:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot donate to campaign with status '{campaign.status.value}'",
        )

    # 4. Calculate remaining target and enforce cap
    remaining_target = round(max(0.0, campaign.target_amount - campaign.raised_amount), 2)

    if remaining_target <= 0.0:
        # Auto-fulfill if not already marked
        campaign.status = CampaignStatus.fulfilled
        await db.commit()
        raise HTTPException(status_code=400, detail="Campaign target already reached / campaign fulfilled")

    if amount > remaining_target:
        raise HTTPException(
            status_code=400,
            detail=f"Donation amount ({amount}) exceeds remaining campaign target ({remaining_target})",
        )

    # 5. Insert Donation
    donation = Donation(
        campaign_id=payload.campaign_id,
        donor_name=payload.donor_name or "Anonymous Donor",
        amount=amount,
        message=payload.message,
        transaction_ref=tx_ref,
    )
    db.add(donation)
    await db.flush()

    # 6. Atomically update raised_amount
    old_raised = campaign.raised_amount
    new_raised = round(old_raised + amount, 2)
    campaign.raised_amount = new_raised

    # 7. Check target completion
    status_changed = False
    if new_raised >= campaign.target_amount:
        campaign.status = CampaignStatus.fulfilled
        status_changed = True

    # 8. Audit Logging inside transaction
    actor_id = actor_user.id if actor_user else None
    await log_donation_audit(
        db,
        actor_id=actor_id,
        action="DONATION_RECEIVED",
        donation_id=donation.id,
        new_values={
            "campaign_id": campaign.id,
            "amount": amount,
            "transaction_ref": tx_ref,
            "donor_name": donation.donor_name,
        },
    )

    if status_changed:
        audit_fulfill = AuditLog(
            actor_id=actor_id,
            action="RELIEF_CAMPAIGN_FULFILLED",
            entity_type="campaigns",
            entity_id=campaign.id,
            old_values={"status": CampaignStatus.active.value, "raised_amount": old_raised},
            new_values={"status": CampaignStatus.fulfilled.value, "raised_amount": new_raised},
        )
        db.add(audit_fulfill)

    await db.commit()
    await db.refresh(donation)
    return enrich_donation_dict(donation)


async def get_campaign_donations_service(
    db: AsyncSession,
    campaign_id: int,
) -> List[Dict[str, Any]]:
    """Lists all donations for a specific relief campaign."""
    campaign = await db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    result = await db.execute(
        select(Donation)
        .where(Donation.campaign_id == campaign_id)
        .order_by(Donation.created_at.desc())
    )
    donations = result.scalars().all()
    return [enrich_donation_dict(d) for d in donations]
