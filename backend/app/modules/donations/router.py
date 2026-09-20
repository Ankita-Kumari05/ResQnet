"""
Relief Mock Donations Module Router (API v1) (Step 6.12)
Exposes versioned endpoints for mock sandbox donations and donation ledger retrieval.
"""
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import User
from app.modules.auth.router import get_current_user_optional
from app.modules.donations.schemas import (
    DonationCreate,
    DonationOut,
)
from app.modules.donations.service import (
    make_donation_service,
    get_campaign_donations_service,
)

router = APIRouter(tags=["Mock Sandbox Donations"])


@router.post("/donations", response_model=DonationOut, status_code=status.HTTP_201_CREATED)
async def make_donation(
    payload: DonationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_optional),
):
    """
    Submits a mock sandbox donation to a relief campaign. Public access.
    Protected by SELECT FOR UPDATE row-level locking, target cap checking,
    and transaction_ref idempotency verification.
    """
    return await make_donation_service(db, payload, current_user)


@router.get("/campaigns/{campaign_id}/donations", response_model=List[DonationOut])
async def list_campaign_donations(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieves all mock donation records for a specific relief campaign. Public access.
    """
    return await get_campaign_donations_service(db, campaign_id)
