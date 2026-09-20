"""
ResQnet Step 6.11 Live Docker Integration & Security Verification Script
Target: http://localhost:8000
"""
import sys
import uuid
import requests
import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# Import models & security from backend
sys.path.insert(0, "d:/5th SEM/ResQnet/backend")
from app.db.models import User, UserRole, Responder, ResponderStatus
from app.core.security import get_password_hash

BASE_URL = "http://localhost:8000/api/v1"
DB_URL = "postgresql+asyncpg://resqnet:resqnet@localhost:5432/resqnet"


def log(msg, status="INFO"):
    print(f"[{status}] {msg}")


def login(email, password="password123"):
    res = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    if res.status_code != 200:
        log(f"Login failed for {email}: {res.text}", "FAIL")
        sys.exit(1)
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def seed_live_users(unique_suffix: str):
    """Seed test users directly into PostgreSQL for live verification."""
    engine = create_async_engine(DB_URL, echo=False)
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    coord_email = f"coord_611_{unique_suffix}@resqnet.org"
    cit_email = f"cit_611_{unique_suffix}@resqnet.org"
    resp_a_email = f"resp_a_611_{unique_suffix}@resqnet.org"
    resp_b_email = f"resp_b_611_{unique_suffix}@resqnet.org"
    resp_off_email = f"resp_off_611_{unique_suffix}@resqnet.org"

    async with SessionLocal() as session:
        # Coordinator
        u_coord = User(
            email=coord_email,
            full_name=f"Coord 611 {unique_suffix}",
            hashed_password=get_password_hash("password123"),
            role=UserRole.coordinator,
            is_active=True,
        )
        session.add(u_coord)

        # Citizen
        u_cit = User(
            email=cit_email,
            full_name=f"Cit 611 {unique_suffix}",
            hashed_password=get_password_hash("password123"),
            role=UserRole.citizen,
            is_active=True,
        )
        session.add(u_cit)

        # Responder A (Active/Available)
        u_resp_a = User(
            email=resp_a_email,
            full_name=f"Resp A 611 {unique_suffix}",
            hashed_password=get_password_hash("password123"),
            role=UserRole.responder,
            is_active=True,
        )
        session.add(u_resp_a)
        await session.flush()
        prof_a = Responder(user_id=u_resp_a.id, status=ResponderStatus.available)
        session.add(prof_a)

        # Responder B (Active/Available)
        u_resp_b = User(
            email=resp_b_email,
            full_name=f"Resp B 611 {unique_suffix}",
            hashed_password=get_password_hash("password123"),
            role=UserRole.responder,
            is_active=True,
        )
        session.add(u_resp_b)
        await session.flush()
        prof_b = Responder(user_id=u_resp_b.id, status=ResponderStatus.available)
        session.add(prof_b)

        # Responder Offline (initially available for mission creation, then set offline)
        u_resp_off = User(
            email=resp_off_email,
            full_name=f"Resp Off 611 {unique_suffix}",
            hashed_password=get_password_hash("password123"),
            role=UserRole.responder,
            is_active=True,
        )
        session.add(u_resp_off)
        await session.flush()
        prof_off = Responder(user_id=u_resp_off.id, status=ResponderStatus.available)
        session.add(prof_off)

        await session.commit()
        await session.refresh(prof_a)
        await session.refresh(prof_b)
        await session.refresh(prof_off)
        log(f"Seeded users for test run {unique_suffix}")

        prof_a_id = prof_a.id
        prof_b_id = prof_b.id
        prof_off_id = prof_off.id

    await engine.dispose()
    return coord_email, cit_email, resp_a_email, resp_b_email, resp_off_email, prof_a_id, prof_b_id, prof_off_id


async def set_responder_offline(prof_id: int):
    engine = create_async_engine(DB_URL, echo=False)
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        r = await session.get(Responder, prof_id)
        if r:
            r.status = ResponderStatus.offline
            await session.commit()
    await engine.dispose()


def set_responder_offline_sync(prof_id: int):
    asyncio.run(set_responder_offline(prof_id))


def run_live_test():
    unique_suffix = uuid.uuid4().hex[:6]
    (
        coord_email,
        cit_email,
        resp_a_email,
        resp_b_email,
        resp_off_email,
        resp_a_prof_id,
        resp_b_prof_id,
        resp_off_prof_id,
    ) = asyncio.run(seed_live_users(unique_suffix))

    log("=== Starting ResQnet 6.11 Live Docker Verification ===")

    # Login headers
    h_coord = login(coord_email)
    h_cit = login(cit_email)
    h_resp_a = login(resp_a_email)
    h_resp_b = login(resp_b_email)
    h_resp_off = login(resp_off_email)

    # 1. Create Safety Hub A and Safety Hub B
    r_hub_a = requests.post(
        f"{BASE_URL}/hubs",
        headers=h_coord,
        json={"name": f"Live Hub A {unique_suffix}", "address": "100 Main St", "lat": 12.97, "lng": 77.59, "max_capacity": 500, "current_occupancy": 10}
    )
    assert r_hub_a.status_code == 201, f"Create Hub A failed: {r_hub_a.text}"
    hub_a_id = r_hub_a.json()["id"]

    r_hub_b = requests.post(
        f"{BASE_URL}/hubs",
        headers=h_coord,
        json={"name": f"Live Hub B {unique_suffix}", "address": "200 Side St", "lat": 12.98, "lng": 77.60, "max_capacity": 500, "current_occupancy": 10}
    )
    assert r_hub_b.status_code == 201
    hub_b_id = r_hub_b.json()["id"]
    log(f"Created Hub A (ID: {hub_a_id}) and Hub B (ID: {hub_b_id})")

    # 2. Check uninitialized critical flag default
    hub_a_detail = requests.get(f"{BASE_URL}/hubs/{hub_a_id}", headers=h_coord).json()
    assert hub_a_detail["food_critical"] is True
    assert hub_a_detail["water_critical"] is True
    assert hub_a_detail["medical_critical"] is True
    log("PASS: Uninitialized hub resources default to is_critical = True")

    # 3. Coordinator updates food inventory level for Hub A
    inv_res = requests.put(
        f"{BASE_URL}/hubs/{hub_a_id}/resources/food",
        headers=h_coord,
        json={"current_quantity": 500.0, "unit": "kg", "critical_threshold": 100.0}
    )
    assert inv_res.status_code == 200, f"PUT hub resource failed: {inv_res.text}"
    log("PASS: Coordinator PUT hub resource inventory succeeded")

    hub_a_updated = requests.get(f"{BASE_URL}/hubs/{hub_a_id}", headers=h_coord).json()
    assert hub_a_updated["food_critical"] is False
    assert hub_a_updated["water_critical"] is True
    log("PASS: Dynamic critical flag updated correctly (food_critical = False)")

    # 4. Create Resource Requirement on Hub A
    req_res = requests.post(
        f"{BASE_URL}/hubs/{hub_a_id}/requirements",
        headers=h_coord,
        json={"resource_type": "water", "required_quantity": 400.0, "unit": "liters", "priority": 5}
    )
    assert req_res.status_code == 201, f"Create requirement failed: {req_res.text}"
    req_data = req_res.json()
    req_id = req_data["id"]
    assert req_data["shortfall_quantity"] == 400.0
    assert req_data["fulfilled_quantity"] == 0.0
    assert req_data["status"] == "open"
    log(f"PASS: Resource Requirement (ID: {req_id}) created with shortfall 400.0")

    # 5. Create Incident, Cluster, and Missions
    inc_res = requests.post(
        f"{BASE_URL}/incidents",
        headers=h_cit,
        json={"category": "flood", "description": "Needs water", "lat": 12.97, "lng": 77.59}
    )
    assert inc_res.status_code == 201, f"Create incident failed: {inc_res.text}"
    inc_id = inc_res.json()["id"]
    requests.post(f"{BASE_URL}/clusters/trigger", headers=h_coord)

    clusters = requests.get(f"{BASE_URL}/clusters", headers=h_coord).json()
    cluster_id = clusters[0]["id"]

    # Create Mission 1: Responder A, Hub A, deliver_resource
    m1_res = requests.post(
        f"{BASE_URL}/missions",
        headers=h_coord,
        json={
            "cluster_id": cluster_id,
            "title": "Deliver Water Hub A (Resp A)",
            "description": "Deliver 400L water",
            "mission_type": "deliver_resource",
            "responder_id": resp_a_prof_id,
            "hub_id": hub_a_id
        }
    )
    assert m1_res.status_code == 201, f"Create mission 1 failed: {m1_res.text}"
    m1_id = m1_res.json()["id"]

    # Create Mission 2: Responder B, Hub A, deliver_resource
    m2_res = requests.post(
        f"{BASE_URL}/missions",
        headers=h_coord,
        json={
            "cluster_id": cluster_id,
            "title": "Deliver Water Hub A (Resp B)",
            "description": "Deliver water",
            "mission_type": "deliver_resource",
            "responder_id": resp_b_prof_id,
            "hub_id": hub_a_id
        }
    )
    m2_id = m2_res.json()["id"]

    # Create Mission 3: Responder A, Hub B, deliver_resource
    m3_res = requests.post(
        f"{BASE_URL}/missions",
        headers=h_coord,
        json={
            "cluster_id": cluster_id,
            "title": "Deliver Water Hub B (Resp A)",
            "description": "Deliver water hub b",
            "mission_type": "deliver_resource",
            "responder_id": resp_a_prof_id,
            "hub_id": hub_b_id
        }
    )
    m3_id = m3_res.json()["id"]

    # Create Mission 4: Responder Offline, Hub A, deliver_resource
    m4_res = requests.post(
        f"{BASE_URL}/missions",
        headers=h_coord,
        json={
            "cluster_id": cluster_id,
            "title": "Deliver Water Hub A (Resp Off)",
            "description": "Offline mission",
            "mission_type": "deliver_resource",
            "responder_id": resp_off_prof_id,
            "hub_id": hub_a_id
        }
    )
    m4_id = m4_res.json()["id"]

    # Accept missions
    requests.patch(f"{BASE_URL}/missions/{m1_id}/status", headers=h_resp_a, json={"status": "accepted"})
    requests.patch(f"{BASE_URL}/missions/{m2_id}/status", headers=h_resp_b, json={"status": "accepted"})
    requests.patch(f"{BASE_URL}/missions/{m3_id}/status", headers=h_resp_a, json={"status": "accepted"})
    requests.patch(f"{BASE_URL}/missions/{m4_id}/status", headers=h_resp_off, json={"status": "accepted"})

    # Set responder_off profile to OFFLINE
    set_responder_offline_sync(resp_off_prof_id)

    # 6. Delivery Mission Authorization Checks
    # Check 1: Non-responder (Coordinator) -> 403
    r_coord_del = requests.post(
        f"{BASE_URL}/requirements/{req_id}/deliver",
        headers=h_coord,
        json={"mission_id": m1_id, "quantity": 100.0}
    )
    assert r_coord_del.status_code == 403, f"Expected 403, got {r_coord_del.status_code}"
    log("PASS: Non-responder delivery rejected (403 Forbidden)")

    # Check 2: Offline responder -> 403
    r_off_del = requests.post(
        f"{BASE_URL}/requirements/{req_id}/deliver",
        headers=h_resp_off,
        json={"mission_id": m4_id, "quantity": 100.0}
    )
    assert r_off_del.status_code == 403, f"Expected 403, got {r_off_del.status_code}"
    log("PASS: Offline responder delivery rejected (403 Forbidden)")

    # Check 3: Responder A using Responder B's mission (m2_id) -> 403
    r_resp_b_mission = requests.post(
        f"{BASE_URL}/requirements/{req_id}/deliver",
        headers=h_resp_a,
        json={"mission_id": m2_id, "quantity": 100.0}
    )
    assert r_resp_b_mission.status_code == 403, f"Expected 403, got {r_resp_b_mission.status_code}"
    log("PASS: Responder A using Responder B's mission rejected (403 Forbidden)")

    # Check 4: Mission for Hub B (m3_id) delivering to Hub A -> 403
    r_hub_b_mission = requests.post(
        f"{BASE_URL}/requirements/{req_id}/deliver",
        headers=h_resp_a,
        json={"mission_id": m3_id, "quantity": 100.0}
    )
    assert r_hub_b_mission.status_code == 403, f"Expected 403, got {r_hub_b_mission.status_code}"
    log("PASS: Mission for Hub B delivering to Hub A rejected (403 Forbidden)")

    # 7. Partial Delivery Execution (Responder A using Mission 1)
    del1_res = requests.post(
        f"{BASE_URL}/requirements/{req_id}/deliver",
        headers=h_resp_a,
        json={"mission_id": m1_id, "quantity": 200.0}
    )
    assert del1_res.status_code == 200, f"Delivery 1 failed: {del1_res.text}"
    d1 = del1_res.json()
    assert d1["fulfilled_quantity"] == 200.0
    assert d1["shortfall_quantity"] == 200.0
    assert d1["status"] == "in_transit"
    log("PASS: Partial delivery (200.0) updated status to 'in_transit' and shortfall to 200.0")

    # 8. Attempt Over-Delivery (300 units when shortfall is 200) -> 400
    over_res = requests.post(
        f"{BASE_URL}/requirements/{req_id}/deliver",
        headers=h_resp_a,
        json={"mission_id": m1_id, "quantity": 300.0}
    )
    assert over_res.status_code == 400, f"Expected 400, got {over_res.status_code}"
    log("PASS: Over-delivery attempt rejected (400 Bad Request)")

    # 9. Complete Delivery (Remaining 200 units)
    del2_res = requests.post(
        f"{BASE_URL}/requirements/{req_id}/deliver",
        headers=h_resp_a,
        json={"mission_id": m1_id, "quantity": 200.0}
    )
    assert del2_res.status_code == 200, f"Delivery 2 failed: {del2_res.text}"
    d2 = del2_res.json()
    assert d2["fulfilled_quantity"] == 400.0
    assert d2["shortfall_quantity"] == 0.0
    assert d2["status"] == "fulfilled"
    log("PASS: Final delivery completed requirement (status = 'fulfilled', shortfall = 0.0)")

    # 10. Attempt Delivery to Fulfilled Requirement -> 400
    re_del = requests.post(
        f"{BASE_URL}/requirements/{req_id}/deliver",
        headers=h_resp_a,
        json={"mission_id": m1_id, "quantity": 50.0}
    )
    assert re_del.status_code == 400
    log("PASS: Delivery to fulfilled requirement rejected (400 Bad Request)")

    # 11. Verify Hub A Inventory Updated
    resources_a = requests.get(f"{BASE_URL}/hubs/{hub_a_id}/resources", headers=h_coord).json()
    water_res = next(r for r in resources_a if r["resource_type"] == "water")
    assert water_res["current_quantity"] == 400.0
    log("PASS: Hub A water inventory updated atomically to 400.0")

    print("\n==================================================")
    print("RESQNET STEP 6.11 LIVE DOCKER VERIFICATION COMPLETE")
    print("ALL 11 SECURITY & INTEGRITY CHECKS PASSED 100%")
    print("==================================================\n")


if __name__ == "__main__":
    run_live_test()
