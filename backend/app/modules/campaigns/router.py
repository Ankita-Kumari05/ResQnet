"""
Relief Campaigns Module Router (API v1) (Step 6.12)
Exposes versioned endpoints for relief campaign creation, retrieval, and updates.
"""
import io
import base64
import qrcode
from typing import List, Optional

from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import User, CampaignStatus
from app.modules.auth.router import get_current_user
from app.modules.campaigns.schemas import (
    CampaignCreate,
    CampaignOut,
    CampaignUpdate,
)
from app.modules.campaigns.service import (
    create_campaign_service,
    get_all_campaigns_service,
    get_campaign_by_id_service,
    get_campaign_by_slug_service,
    update_campaign_service,
)

router = APIRouter(prefix="/campaigns", tags=["Relief Campaigns"])


def generate_qr_base64(url: str) -> str:
    """Generates a base64 PNG QR code for campaign sharing."""
    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


@router.post("", response_model=CampaignOut, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Creates a new relief campaign linked to an operational ResourceRequirement.
    Restricted to Fundraisers and Coordinators.
    """
    return await create_campaign_service(db, payload, current_user)


@router.get("", response_model=List[CampaignOut])
async def list_campaigns(
    hub_id: Optional[int] = Query(None, description="Optional Safety Hub ID filter"),
    status_filter: Optional[CampaignStatus] = Query(None, alias="status", description="Optional CampaignStatus filter"),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieves all relief campaigns. Public access.
    Default filter excludes closed campaigns unless status is explicitly passed.
    """
    return await get_all_campaigns_service(db, hub_id, status_filter)


@router.get("/slug/{slug}", response_model=CampaignOut)
async def get_campaign_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieves campaign details by unique share slug. Public access.
    """
    return await get_campaign_by_slug_service(db, slug)


@router.get("/{campaign_id}", response_model=CampaignOut)
async def get_campaign(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieves operational details for a specific relief campaign. Public access.
    """
    return await get_campaign_by_id_service(db, campaign_id)


@router.get("/{campaign_id}/qr")
async def get_campaign_qr(
    campaign_id: int,
    base_url: str = Query("http://localhost:5173", description="Frontend base URL for donate link"),
    db: AsyncSession = Depends(get_db),
):
    """
    Generates a shareable QR code for a relief campaign. Public access.
    """
    c = await get_campaign_by_id_service(db, campaign_id)
    url = f"{base_url}/donate/{c['share_slug']}"
    return {"url": url, "qr_base64": generate_qr_base64(url)}


@router.patch("/{campaign_id}", response_model=CampaignOut)
async def update_campaign(
    campaign_id: int,
    payload: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Updates campaign details or status (e.g. closing a campaign).
    Restricted to campaign owner (ngo_user_id) or Coordinators.
    """
    return await update_campaign_service(db, campaign_id, payload, current_user)
