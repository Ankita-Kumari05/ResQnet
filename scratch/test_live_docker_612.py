"""
ResQnet Step 6.12 Live Docker End-to-End & Concurrency Verification Script
Tests campaign creation, RBAC, ownership isolation, donation atomicity,
idempotency, 409 conflicts, over-target caps, status synchronization,
concurrent donation locking against live PostgreSQL + FastAPI Docker container.
"""
import asyncio
import uuid
import httpx
from sqlalchemy import create_engine, text

BASE_URL = "http://localhost:8000/api/v1"
DB_URL = "postgresql://resqnet:resqnet@localhost:5432/resqnet"



async def main():
    print("==================================================")
    print("RESQNET STEP 6.12 LIVE DOCKER VERIFICATION")
    print("==================================================")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        # 1. Login accounts
        print("\n1. Authenticating test users...")
        r_coord = await client.post("/auth/login", json={"email": "coordinator@resqnet.in", "password": "coord123"})
        assert r_coord.status_code == 200, f"Coord login failed: {r_coord.text}"
        token_coord = r_coord.json()["access_token"]
        headers_coord = {"Authorization": f"Bearer {token_coord}"}

        r_fund = await client.post("/auth/login", json={"email": "fundraiser@resqnet.in", "password": "fund123"})
        assert r_fund.status_code == 200, f"Fundraiser login failed: {r_fund.text}"
        token_fund = r_fund.json()["access_token"]
        headers_fund = {"Authorization": f"Bearer {token_fund}"}

        r_resp = await client.post("/auth/login", json={"email": "responder1@resqnet.in", "password": "respond123"})
        assert r_resp.status_code == 200
        token_resp = r_resp.json()["access_token"]
        headers_resp = {"Authorization": f"Bearer {token_resp}"}

        r_cit = await client.post("/auth/login", json={"email": "citizen1@resqnet.in", "password": "citizen123"})
        assert r_cit.status_code == 200
        token_cit = r_cit.json()["access_token"]
        headers_cit = {"Authorization": f"Bearer {token_cit}"}

        print("   [OK] Authentication successful")

        # 2. Safety Hub & Resource Requirement setup
        print("\n2. Setting up Safety Hub requirement...")
        # Get hubs
        hubs_res = await client.get("/hubs", headers=headers_coord)

        assert hubs_res.status_code == 200
        hubs = hubs_res.json()
        assert len(hubs) > 0
        hub_id = hubs[0]["id"]

        # Create resource requirement
        req_res = await client.post(
            f"/hubs/{hub_id}/requirements",
            json={"resource_type": "medical", "required_quantity": 500.0, "unit": "kits", "priority": 3},
            headers=headers_coord,
        )
        assert req_res.status_code == 201, f"Req creation failed: {req_res.text}"
        req_id = req_res.json()["id"]
        print(f"   [OK] Created Resource Requirement ID {req_id} at Hub ID {hub_id}")

        # 3. RBAC Verification on Campaign Creation
        print("\n3. Verifying Campaign Creation RBAC...")
        camp_payload = {
            "title": f"Medical Relief Drive {uuid.uuid4().hex[:4]}",
            "description": "Funding essential medical kits",
            "requirement_id": req_id,
            "target_amount": 1000.0,
        }

        # Citizen attempt -> 403
        r_cit_camp = await client.post("/campaigns", json=camp_payload, headers=headers_cit)
        assert r_cit_camp.status_code == 403, f"Expected 403, got {r_cit_camp.status_code}"
        print("   [OK] Citizen creation rejected (403)")

        # Responder attempt -> 403
        r_resp_camp = await client.post("/campaigns", json=camp_payload, headers=headers_resp)
        assert r_resp_camp.status_code == 403, f"Expected 403, got {r_resp_camp.status_code}"
        print("   [OK] Responder creation rejected (403)")

        # Fundraiser creation -> 201
        r_fund_camp = await client.post("/campaigns", json=camp_payload, headers=headers_fund)
        assert r_fund_camp.status_code == 201, f"Fundraiser camp creation failed: {r_fund_camp.text}"
        camp = r_fund_camp.json()
        camp_id = camp["id"]
        print(f"   [OK] Fundraiser created Campaign ID {camp_id} linked to Requirement {req_id} (slug: {camp['share_slug']})")

        # 4. Campaign Ownership & State Machine Protection
        print("\n4. Verifying Campaign Ownership & State Machine Protection...")
        email_f2 = f"fund2_{uuid.uuid4().hex[:4]}@resqnet.in"
        reg_f2 = await client.post(
            "/auth/register",
            json={"email": email_f2, "full_name": "Fundraiser 2", "password": "pass", "role": "fundraiser"},
        )
        assert reg_f2.status_code == 201
        r_login_f2 = await client.post("/auth/login", json={"email": email_f2, "password": "pass"})
        assert r_login_f2.status_code == 200
        token_f2 = r_login_f2.json()["access_token"]
        headers_f2 = {"Authorization": f"Bearer {token_f2}"}


        # Fundraiser 2 attempts to edit Fundraiser 1's campaign -> 403
        r_edit_unauth = await client.patch(f"/campaigns/{camp_id}", json={"title": "Hacked"}, headers=headers_f2)
        assert r_edit_unauth.status_code == 403
        print("   [OK] Ownership isolation enforced (Fundraiser B cannot edit Fundraiser A's campaign)")

        # Coordinator override close -> 200
        # First close a dummy campaign
        dummy_camp_res = await client.post(
            "/campaigns",
            json={"title": "Dummy Close Test", "hub_id": hub_id, "target_amount": 500.0},
            headers=headers_coord,
        )
        assert dummy_camp_res.status_code == 201
        dummy_id = dummy_camp_res.json()["id"]

        r_close = await client.patch(f"/campaigns/{dummy_id}", json={"status": "closed"}, headers=headers_coord)
        assert r_close.status_code == 200
        print("   [OK] Campaign manually closed")

        # Attempt to reopen closed campaign -> 400
        r_reopen = await client.patch(f"/campaigns/{dummy_id}", json={"status": "active"}, headers=headers_coord)
        assert r_reopen.status_code == 400
        print("   [OK] Reopening CLOSED campaign rejected with HTTP 400")

        # 5. Donation Transaction Protocol & Idempotency
        print("\n5. Testing Mock Donations & Idempotency...")
        tx_ref_test = f"tx_ref_demo_{uuid.uuid4().hex[:6]}"

        # Valid partial donation (500)
        don1_res = await client.post(
            "/donations",
            json={"campaign_id": camp_id, "amount": 500.0, "transaction_ref": tx_ref_test, "donor_name": "Alice"},
        )
        assert don1_res.status_code == 201
        don1 = don1_res.json()
        print(f"   [OK] Donation 1 processed: Amount 500.0 (tx_ref: {tx_ref_test})")

        # Check campaign raised_amount
        c_check1 = await client.get(f"/campaigns/{camp_id}")
        assert c_check1.json()["raised_amount"] == 500.0
        assert c_check1.json()["status"] == "active"

        # Duplicate tx_ref -> Idempotent 200/201 (returns identical donation)
        don_dup_res = await client.post(
            "/donations",
            json={"campaign_id": camp_id, "amount": 500.0, "transaction_ref": tx_ref_test, "donor_name": "Alice"},
        )
        assert don_dup_res.status_code in [200, 201]
        assert don_dup_res.json()["id"] == don1["id"]
        print("   [OK] Duplicate transaction_ref returned existing donation idempotently")

        # Conflicting tx_ref -> 409 Conflict
        don_conf_res = await client.post(
            "/donations",
            json={"campaign_id": camp_id, "amount": 250.0, "transaction_ref": tx_ref_test},
        )
        assert don_conf_res.status_code == 409
        print("   [OK] Reused transaction_ref with conflicting amount rejected with HTTP 409 Conflict")

        # Over-target donation rejection (remaining is 500, attempt 600) -> 400
        don_over_res = await client.post(
            "/donations",
            json={"campaign_id": camp_id, "amount": 600.0},
        )
        assert don_over_res.status_code == 400
        print("   [OK] Over-target donation amount (600 > remaining 500) rejected with HTTP 400")

        # 6. Real Live Concurrent Donation Test (SELECT FOR UPDATE Row Locking)
        print("\n6. Testing Real Live Concurrency with SELECT FOR UPDATE Row Locking...")
        # Campaign has remaining target = 500.
        # Issue two concurrent donation requests of 500 each.
        tx_a = f"tx_conc_a_{uuid.uuid4().hex[:6]}"
        tx_b = f"tx_conc_b_{uuid.uuid4().hex[:6]}"

        req_a = client.post("/donations", json={"campaign_id": camp_id, "amount": 500.0, "transaction_ref": tx_a})
        req_b = client.post("/donations", json={"campaign_id": camp_id, "amount": 500.0, "transaction_ref": tx_b})

        res_a, res_b = await asyncio.gather(req_a, req_b)
        statuses = [res_a.status_code, res_b.status_code]
        print(f"   Concurrent responses status codes: {statuses}")

        assert 201 in statuses, "At least one concurrent request must succeed with 201"
        assert 400 in statuses, "The second concurrent request must fail with 400 over-target cap"
        print("   [OK] Exactly ONE concurrent donation succeeded; second rejected safely without over-collection!")

        # Verify final campaign status
        c_final = await client.get(f"/campaigns/{camp_id}")
        assert c_final.json()["raised_amount"] == 1000.0
        assert c_final.json()["status"] == "fulfilled"
        print("   [OK] Final campaign status: FULFILLED (raised_amount: 1000.0 / 1000.0)")

        # Attempt donation after fulfillment -> 400
        r_post_fulfill = await client.post("/donations", json={"campaign_id": camp_id, "amount": 10.0})
        assert r_post_fulfill.status_code == 400
        print("   [OK] Subsequent donation attempt to fulfilled campaign rejected with HTTP 400")

        # 7. Requirement Status Synchronization Test
        print("\n7. Testing Requirement Status Synchronization...")
        # Create new requirement & campaign
        req_sync_res = await client.post(
            f"/hubs/{hub_id}/requirements",
            json={"resource_type": "water", "required_quantity": 100.0, "unit": "L", "priority": 1},
            headers=headers_coord,
        )
        sync_req_id = req_sync_res.json()["id"]

        sync_camp_res = await client.post(
            "/campaigns",
            json={"title": "Sync Test Campaign", "requirement_id": sync_req_id},
            headers=headers_fund,
        )
        sync_camp_id = sync_camp_res.json()["id"]

        # Cancel requirement -> linked active campaign becomes CLOSED
        r_cancel_req = await client.patch(
            f"/requirements/{sync_req_id}",
            json={"status": "cancelled"},
            headers=headers_coord,
        )

        assert r_cancel_req.status_code == 200

        sync_camp_check = await client.get(f"/campaigns/{sync_camp_id}")
        assert sync_camp_check.json()["status"] == "closed"
        print("   [OK] Requirement CANCELLED -> linked active campaign automatically became CLOSED")

        # 8. Schema Integrity Check
        print("\n8. Verifying Frozen Database Schema Integrity...")
        engine = create_engine(DB_URL)
        with engine.connect() as conn:
            # Check alembic_version
            version_res = conn.execute(text("SELECT version_num FROM alembic_version;")).scalar()
            assert version_res == "71867cddef4b", f"Expected Alembic head 71867cddef4b, got {version_res}"
            print(f"   [OK] Alembic version verified: {version_res}")

            # Check total application table count (excluding PostGIS system tables and alembic_version)
            tables_res = conn.execute(text("""
                SELECT COUNT(*) FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name NOT IN ('alembic_version', 'spatial_ref_sys', 'geometry_columns', 'geography_columns');
            """)).scalar()
            assert tables_res == 17, f"Expected 17 application tables, found {tables_res}"
            print(f"   [OK] Application table count verified: {tables_res}")


            # Check AuditLog records
            audit_count = conn.execute(text("SELECT COUNT(*) FROM audit_logs;")).scalar()
            assert audit_count > 0, "Audit logs must contain recorded operations"
            print(f"   [OK] Audit logs count verified: {audit_count} entries recorded")

    print("\n==================================================")
    print("ALL LIVE DOCKER STEP 6.12 VERIFICATIONS PASSED!")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(main())
