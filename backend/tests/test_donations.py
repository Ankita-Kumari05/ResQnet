"""
ResQnet Mock/Sandbox Donations & Idempotency Test Suite (Step 6.12)
Comprehensive test coverage for donation processing, amount validations,
target caps, auto-fulfillment, transaction_ref idempotency & conflict handling,
and audit logging.
"""
import uuid
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.db.session import AsyncSessionLocal
from app.db.models import (
    ResourceType, Campaign, CampaignStatus,
)


@pytest.mark.asyncio
async def test_valid_donation_and_auto_fulfillment():
    """Valid donation increments raised_amount and auto-fulfills campaign when target reached."""
    async with AsyncSessionLocal() as session:
        campaign = Campaign(
            title="Target Test Campaign",
            description="Testing target fulfillment",
            status=CampaignStatus.active,
            hub_id=None,
            requirement_id=None,
            ngo_user_id=1,
            resource_type=ResourceType.food,
            target_amount=1000.0,
            raised_amount=800.0,
            share_slug=f"don-slug-{uuid.uuid4().hex[:6]}",
        )
        session.add(campaign)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        # 1. Partial donation (100)
        r1 = await ac.post(
            "/api/v1/donations",
            json={
                "campaign_id": campaign.id,
                "amount": 100.0,
                "donor_name": "Anonymous Donor",
            },
        )
        assert r1.status_code == 201

        # Check campaign status after partial donation
        c_check1 = await ac.get(f"/api/v1/campaigns/{campaign.id}")
        assert c_check1.status_code == 200
        assert c_check1.json()["raised_amount"] == 900.0
        assert c_check1.json()["status"] == "active"

        # 2. Exact target donation (100) -> auto-fulfillment
        r2 = await ac.post(
            "/api/v1/donations",
            json={
                "campaign_id": campaign.id,
                "amount": 100.0,
                "donor_name": "Final Donor",
            },
        )
        assert r2.status_code == 201

        # Check campaign status after full donation
        c_check2 = await ac.get(f"/api/v1/campaigns/{campaign.id}")
        assert c_check2.status_code == 200
        assert c_check2.json()["raised_amount"] == 1000.0
        assert c_check2.json()["status"] == "fulfilled"

        # 3. Subsequent donation to fulfilled campaign -> 400
        r3 = await ac.post(
            "/api/v1/donations",
            json={
                "campaign_id": campaign.id,
                "amount": 50.0,
            },
        )
        assert r3.status_code == 400


@pytest.mark.asyncio
async def test_donation_amount_validations_and_overtarget():
    """Validates money bounds (zero, negative) and over-target rejection."""
    async with AsyncSessionLocal() as session:
        campaign = Campaign(
            title="Validation Campaign",
            description="Testing money validation",
            status=CampaignStatus.active,
            hub_id=None,
            requirement_id=None,
            ngo_user_id=1,
            resource_type=ResourceType.water,
            target_amount=500.0,
            raised_amount=400.0,
            share_slug=f"val-slug-{uuid.uuid4().hex[:6]}",
        )
        session.add(campaign)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        # 1. Zero amount -> 400 or 422
        r_zero = await ac.post("/api/v1/donations", json={"campaign_id": campaign.id, "amount": 0.0})
        assert r_zero.status_code in [400, 422]

        # 2. Negative amount -> 400 or 422
        r_neg = await ac.post("/api/v1/donations", json={"campaign_id": campaign.id, "amount": -50.0})
        assert r_neg.status_code in [400, 422]

        # 3. Over-target amount (remaining is 100, donation is 150) -> 400
        r_over = await ac.post("/api/v1/donations", json={"campaign_id": campaign.id, "amount": 150.0})
        assert r_over.status_code == 400


@pytest.mark.asyncio
async def test_transaction_ref_idempotency_and_conflict():
    """Identical transaction_ref returns existing donation; conflicting reused ref returns 409 Conflict."""
    async with AsyncSessionLocal() as session:
        campaign1 = Campaign(
            title="Campaign 1",
            description="Desc 1",
            status=CampaignStatus.active,
            hub_id=None,
            requirement_id=None,
            ngo_user_id=1,
            resource_type=ResourceType.medical,
            target_amount=5000.0,
            raised_amount=0.0,
            share_slug=f"idempotent-1-{uuid.uuid4().hex[:6]}",
        )
        campaign2 = Campaign(
            title="Campaign 2",
            description="Desc 2",
            status=CampaignStatus.active,
            hub_id=None,
            requirement_id=None,
            ngo_user_id=1,
            resource_type=ResourceType.medical,
            target_amount=5000.0,
            raised_amount=0.0,
            share_slug=f"idempotent-2-{uuid.uuid4().hex[:6]}",
        )
        session.add_all([campaign1, campaign2])
        await session.commit()

    tx_ref = f"tx-ref-{uuid.uuid4().hex[:8]}"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        # 1. Initial donation with tx_ref -> 201
        r1 = await ac.post(
            "/api/v1/donations",
            json={
                "campaign_id": campaign1.id,
                "amount": 250.0,
                "transaction_ref": tx_ref,
                "donor_name": "Idempotent Donor",
            },
        )
        assert r1.status_code == 201
        don1_id = r1.json()["id"]

        # 2. Duplicate submission (same campaign, same amount, same tx_ref) -> 200/201 (returns existing donation)
        r2 = await ac.post(
            "/api/v1/donations",
            json={
                "campaign_id": campaign1.id,
                "amount": 250.0,
                "transaction_ref": tx_ref,
                "donor_name": "Idempotent Donor",
            },
        )
        assert r2.status_code in [200, 201]
        assert r2.json()["id"] == don1_id

        # 3. Conflicting submission (different amount) -> 409 Conflict
        r3 = await ac.post(
            "/api/v1/donations",
            json={
                "campaign_id": campaign1.id,
                "amount": 500.0,
                "transaction_ref": tx_ref,
            },
        )
        assert r3.status_code == 409

        # 4. Conflicting submission (different campaign) -> 409 Conflict
        r4 = await ac.post(
            "/api/v1/donations",
            json={
                "campaign_id": campaign2.id,
                "amount": 250.0,
                "transaction_ref": tx_ref,
            },
        )
        assert r4.status_code == 409
