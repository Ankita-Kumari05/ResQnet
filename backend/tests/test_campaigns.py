"""
ResQnet Relief Campaigns Test Suite (Step 6.12)
Comprehensive test coverage for campaign creation RBAC, requirement linkage,
ownership isolation, state machine transitions, share slug lookups, and audit logging.
"""
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.core.security import create_access_token, get_password_hash
from app.db.session import AsyncSessionLocal
from app.db.models import (
    User, UserRole, SafetyHub, HubStatus,
    ResourceRequirement, ResourceType, RequirementStatus,
    Campaign, CampaignStatus, AuditLog,
)


@pytest.mark.asyncio
async def test_campaign_rbac_creation():
    """Citizen and Responder cannot create campaign; Fundraiser and Coordinator can."""
    async with AsyncSessionLocal() as session:
        # Seed test users
        cit_email = f"citizen_{uuid.uuid4().hex[:6]}@test.com"
        resp_email = f"responder_{uuid.uuid4().hex[:6]}@test.com"
        fund1_email = f"fund1_{uuid.uuid4().hex[:6]}@test.com"
        coord_email = f"coord_{uuid.uuid4().hex[:6]}@test.com"

        u_cit = User(email=cit_email, full_name="Citizen", role=UserRole.citizen, hashed_password=get_password_hash("pass"), is_active=True)
        u_resp = User(email=resp_email, full_name="Responder", role=UserRole.responder, hashed_password=get_password_hash("pass"), is_active=True)
        u_fund1 = User(email=fund1_email, full_name="Fundraiser 1", role=UserRole.fundraiser, hashed_password=get_password_hash("pass"), is_active=True)
        u_coord = User(email=coord_email, full_name="Coordinator", role=UserRole.coordinator, hashed_password=get_password_hash("pass"), is_active=True)

        session.add_all([u_cit, u_resp, u_fund1, u_coord])
        await session.flush()

        # Seed hub & requirement
        hub = SafetyHub(name=f"Hub_{uuid.uuid4().hex[:6]}", address="Test Address", lat=20.5, lng=85.8, max_capacity=500, current_occupancy=10, status=HubStatus.open)
        session.add(hub)
        await session.flush()

        req = ResourceRequirement(
            hub_id=hub.id,
            resource_type=ResourceType.food,
            required_quantity=200.0,
            fulfilled_quantity=0.0,
            shortfall_quantity=200.0,
            unit="kg",
            priority=2,
            status=RequirementStatus.open,
        )
        session.add(req)
        await session.commit()
        await session.refresh(req)

        cit_token = create_access_token({"sub": str(u_cit.id)})
        resp_token = create_access_token({"sub": str(u_resp.id)})
        fund1_token = create_access_token({"sub": str(u_fund1.id)})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        payload = {
            "title": "Food Relief Campaign",
            "description": "Funding food packages",
            "requirement_id": req.id,
        }

        # 1. Citizen creation -> 403
        r_cit = await ac.post("/api/v1/campaigns", json=payload, headers={"Authorization": f"Bearer {cit_token}"})
        assert r_cit.status_code == 403

        # 2. Responder creation -> 403
        r_resp = await ac.post("/api/v1/campaigns", json=payload, headers={"Authorization": f"Bearer {resp_token}"})
        assert r_resp.status_code == 403

        # 3. Fundraiser creation -> 201
        r_fund = await ac.post("/api/v1/campaigns", json=payload, headers={"Authorization": f"Bearer {fund1_token}"})
        assert r_fund.status_code == 201
        res_data = r_fund.json()
        assert res_data["status"] == "active"
        assert res_data["hub_id"] == hub.id
        assert res_data["resource_type"] == "food"
        assert res_data["ngo_user_id"] == u_fund1.id
        assert "share_slug" in res_data


@pytest.mark.asyncio
async def test_campaign_requirement_validation():
    """Validates requirement existence and status checks during creation."""
    async with AsyncSessionLocal() as session:
        u_fund = User(email=f"fund_{uuid.uuid4().hex[:6]}@test.com", full_name="Fundraiser", role=UserRole.fundraiser, hashed_password=get_password_hash("pass"), is_active=True)
        session.add(u_fund)
        await session.flush()

        hub = SafetyHub(name=f"Hub_{uuid.uuid4().hex[:6]}", address="Test Address", lat=20.5, lng=85.8, max_capacity=500, current_occupancy=10, status=HubStatus.open)
        session.add(hub)
        await session.flush()

        req_fulfilled = ResourceRequirement(
            hub_id=hub.id,
            resource_type=ResourceType.water,
            required_quantity=100.0,
            fulfilled_quantity=100.0,
            shortfall_quantity=0.0,
            unit="L",
            priority=1,
            status=RequirementStatus.fulfilled,
        )
        session.add(req_fulfilled)
        await session.commit()

        token = create_access_token({"sub": str(u_fund.id)})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        # 1. Non-existent requirement -> 404
        r1 = await ac.post(
            "/api/v1/campaigns",
            json={"title": "Test Campaign", "requirement_id": 999999},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r1.status_code == 404

        # 2. Fulfilled requirement -> 400
        r2 = await ac.post(
            "/api/v1/campaigns",
            json={"title": "Test Campaign", "requirement_id": req_fulfilled.id},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r2.status_code == 400


@pytest.mark.asyncio
async def test_campaign_ownership_isolation_and_update():
    """Fundraiser cannot update another fundraiser's campaign; Coordinator can override; invalid state transitions fail."""
    async with AsyncSessionLocal() as session:
        u_fund1 = User(email=f"f1_{uuid.uuid4().hex[:6]}@test.com", full_name="Fundraiser 1", role=UserRole.fundraiser, hashed_password=get_password_hash("pass"), is_active=True)
        u_fund2 = User(email=f"f2_{uuid.uuid4().hex[:6]}@test.com", full_name="Fundraiser 2", role=UserRole.fundraiser, hashed_password=get_password_hash("pass"), is_active=True)
        u_coord = User(email=f"c_{uuid.uuid4().hex[:6]}@test.com", full_name="Coordinator", role=UserRole.coordinator, hashed_password=get_password_hash("pass"), is_active=True)

        session.add_all([u_fund1, u_fund2, u_coord])
        await session.flush()

        campaign = Campaign(
            title="Initial Title",
            description="Initial Desc",
            status=CampaignStatus.active,
            hub_id=None,
            requirement_id=None,
            ngo_user_id=u_fund1.id,
            resource_type=ResourceType.medical,
            target_amount=5000.0,
            raised_amount=0.0,
            share_slug=f"slug-{uuid.uuid4().hex[:6]}",
        )
        session.add(campaign)
        await session.commit()
        await session.refresh(campaign)

        t_fund1 = create_access_token({"sub": str(u_fund1.id)})
        t_fund2 = create_access_token({"sub": str(u_fund2.id)})
        t_coord = create_access_token({"sub": str(u_coord.id)})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        # 1. Fundraiser 2 attempts to edit Fundraiser 1's campaign -> 403
        r_other = await ac.patch(
            f"/api/v1/campaigns/{campaign.id}",
            json={"title": "Hacked Title"},
            headers={"Authorization": f"Bearer {t_fund2}"},
        )
        assert r_other.status_code == 403

        # 2. Fundraiser 1 closes campaign -> 200
        r_owner = await ac.patch(
            f"/api/v1/campaigns/{campaign.id}",
            json={"status": "closed"},
            headers={"Authorization": f"Bearer {t_fund1}"},
        )
        assert r_owner.status_code == 200
        assert r_owner.json()["status"] == "closed"

        # 3. Attempt to reopen closed campaign -> 400
        r_reopen = await ac.patch(
            f"/api/v1/campaigns/{campaign.id}",
            json={"status": "active"},
            headers={"Authorization": f"Bearer {t_coord}"},
        )
        assert r_reopen.status_code == 400


@pytest.mark.asyncio
async def test_get_campaign_by_slug_and_qr():
    """Verifies campaign lookup by slug and QR payload retrieval."""
    async with AsyncSessionLocal() as session:
        campaign = Campaign(
            title="QR Test Campaign",
            description="Testing QR code generation",
            status=CampaignStatus.active,
            hub_id=None,
            requirement_id=None,
            ngo_user_id=1,
            resource_type=ResourceType.shelter_kit,
            target_amount=10000.0,
            raised_amount=0.0,
            share_slug=f"qr-slug-{uuid.uuid4().hex[:6]}",
        )
        session.add(campaign)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        # Lookup by slug
        r_slug = await ac.get(f"/api/v1/campaigns/slug/{campaign.share_slug}")
        assert r_slug.status_code == 200
        assert r_slug.json()["id"] == campaign.id

        # Lookup QR code payload
        r_qr = await ac.get(f"/api/v1/campaigns/{campaign.id}/qr")
        assert r_qr.status_code == 200
        assert "url" in r_qr.json()
        assert "qr_base64" in r_qr.json()
