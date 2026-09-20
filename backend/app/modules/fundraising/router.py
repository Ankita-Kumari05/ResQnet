"""
Fundraising Module
Campaign management linked to verified Safety Hub needs.
Mock/sandbox donation flow — no real payment processing.
"""
import secrets
import string
from datetime import datetime
from typing import List, Optional

import qrcode
import io
import base64

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import Campaign, CampaignStatus, Donation, ResourceType, User, UserRole
from app.modules.auth.router import get_current_user, require_roles

router = APIRouter(prefix="/fundraising", tags=["fundraising"])


# ─── Schemas ───────────────────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    title: str
    description: Optional[str] = None
    hub_id: Optional[int] = None
    resource_type: Optional[ResourceType] = None
    target_amount: float


class CampaignOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: CampaignStatus
    hub_id: Optional[int] = None
    resource_type: Optional[ResourceType] = None
    target_amount: float
    raised_amount: float
    share_slug: Optional[str] = None
    progress_percent: float = 0.0
    created_at: datetime

    class Config:
        from_attributes = True


class DonationCreate(BaseModel):
    campaign_id: int
    donor_name: Optional[str] = None
    amount: float
    message: Optional[str] = None


class DonationOut(BaseModel):
    id: int
    campaign_id: int
    donor_name: Optional[str] = None
    amount: float
    message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Helper ────────────────────────────────────────────────────────────────

def generate_slug(length: int = 10) -> str:
    chars = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(chars) for _ in range(length))


def enrich_campaign(c: Campaign) -> dict:
    return {
        **{col.name: getattr(c, col.name) for col in c.__table__.columns},
        "progress_percent": round((c.raised_amount / max(c.target_amount, 1)) * 100, 1),
    }


def generate_qr_base64(url: str) -> str:
    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ─── Routes ────────────────────────────────────────────────────────────────

@router.get("", response_model=List[CampaignOut])
async def list_campaigns(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Campaign).where(Campaign.status != CampaignStatus.closed).order_by(Campaign.created_at.desc())
    )
    campaigns = result.scalars().all()
    return [enrich_campaign(c) for c in campaigns]


@router.post("", response_model=CampaignOut, status_code=201)
async def create_campaign(
    payload: CampaignCreate,
    current_user: User = Depends(require_roles(UserRole.coordinator, UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    slug = generate_slug()
    campaign = Campaign(
        title=payload.title,
        description=payload.description,
        hub_id=payload.hub_id,
        resource_type=payload.resource_type,
        target_amount=payload.target_amount,
        raised_amount=0.0,
        share_slug=slug,
        ngo_user_id=current_user.id,
        status=CampaignStatus.active,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return enrich_campaign(campaign)


@router.get("/{campaign_id}", response_model=CampaignOut)
async def get_campaign(campaign_id: int, db: AsyncSession = Depends(get_db)):
    campaign = await db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return enrich_campaign(campaign)


@router.get("/slug/{slug}", response_model=CampaignOut)
async def get_campaign_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Campaign).where(Campaign.share_slug == slug))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return enrich_campaign(campaign)


@router.get("/{campaign_id}/qr")
async def get_campaign_qr(
    campaign_id: int,
    base_url: str = "http://localhost:5173",
    db: AsyncSession = Depends(get_db),
):
    campaign = await db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    url = f"{base_url}/donate/{campaign.share_slug}"
    return {"url": url, "qr_base64": generate_qr_base64(url)}


@router.post("/donate", response_model=DonationOut, status_code=201)
async def make_donation(
    payload: DonationCreate,
    db: AsyncSession = Depends(get_db),
):
    """Mock/sandbox donation — no real payment processing."""
    campaign = await db.get(Campaign, payload.campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status != CampaignStatus.active:
        raise HTTPException(status_code=400, detail="Campaign is not active")

    donation = Donation(
        campaign_id=payload.campaign_id,
        donor_name=payload.donor_name,
        amount=payload.amount,
        message=payload.message,
    )
    db.add(donation)

    campaign.raised_amount += payload.amount
    campaign.updated_at = datetime.utcnow()

    # Auto-fulfill if target reached
    if campaign.raised_amount >= campaign.target_amount:
        campaign.status = CampaignStatus.fulfilled

    await db.commit()
    await db.refresh(donation)
    return donation


@router.get("/{campaign_id}/donations", response_model=List[DonationOut])
async def list_donations(campaign_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Donation).where(Donation.campaign_id == campaign_id).order_by(Donation.created_at.desc())
    )
    return result.scalars().all()
