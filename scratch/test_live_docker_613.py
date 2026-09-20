"""
Live Docker Verification Script for ResQnet Step 6.13 — Emergency Alerts & Citizen Emergency Mode
Verifies running FastAPI service at http://localhost:8000 and PostgreSQL schema compliance.
"""
import sys
import httpx
import psycopg2

BASE_URL = "http://localhost:8000/api/v1"
DB_URI = "postgresql://resqnet:resqnet@localhost:5432/resqnet"



def run_verification():
    print("=" * 70)
    print("RESQNET STEP 6.13 LIVE DOCKER VERIFICATION")
    print("=" * 70)

    client = httpx.Client(base_url=BASE_URL, timeout=10.0)

    # 1. Authenticate users
    print("\n[1/12] Authenticating roles...")
    def get_token(email, password):
        res = client.post("/auth/token", data={"username": email, "password": password})
        if res.status_code != 200:
            print(f"FAILED to authenticate {email}: {res.text}")
            sys.exit(1)
        return res.json()["access_token"], res.json()["user"]

    t_coord, u_coord = get_token("coordinator@resqnet.in", "coord123")
    t_cit, u_cit = get_token("citizen1@resqnet.in", "citizen123")
    t_resp, u_resp = get_token("responder1@resqnet.in", "respond123")
    t_fund, u_fund = get_token("fundraiser@resqnet.in", "fund123")
    print("  [OK] Authenticated Coordinator, Citizen, Responder, Fundraiser.")

    # 2. RBAC Creation Checks
    print("\n[2/12] Testing Alert Creation RBAC...")
    payload = {
        "title": "TEST FLOOD ALERT",
        "message": "Testing RBAC permissions.",
        "severity": "WARNING",
        "alert_type": "flood"
    }
    for name, token in [("Citizen", t_cit), ("Responder", t_resp), ("Fundraiser", t_fund)]:
        res = client.post("/alerts", json=payload, headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 403, f"Expected 403 for {name}, got {res.status_code}"
    print("  [OK] Citizen, Responder, Fundraiser strictly received 403 Forbidden.")

    # 3. Coordinator Alert Creation
    print("\n[3/12] Testing Coordinator Alert Creation...")
    res = client.post("/alerts", json=payload, headers={"Authorization": f"Bearer {t_coord}"})
    assert res.status_code == 201, f"Expected 201 for Coordinator, got {res.status_code}: {res.text}"
    alert_data = res.json()
    assert alert_data["issued_by_id"] == u_coord["id"]
    assert alert_data["is_active"] is True
    print(f"  [OK] Created Alert ID {alert_data['id']} with issued_by_id={u_coord['id']}.")

    # 4. Spatial Geometry Alert Creation
    print("\n[4/12] Testing Spatial MultiPolygon Alert Creation...")
    polygon_geojson = {
        "type": "Polygon",
        "coordinates": [[
            [85.80, 20.50],
            [85.85, 20.50],
            [85.85, 20.60],
            [85.80, 20.60],
            [85.80, 20.50]
        ]]
    }
    res = client.post("/alerts", json={
        "title": "LIVE SPATIAL ZONE EMERGENCY",
        "message": "Evacuate North Market Region immediately.",
        "severity": "EMERGENCY",
        "alert_type": "evacuation",
        "affected_area_geojson": polygon_geojson
    }, headers={"Authorization": f"Bearer {t_coord}"})
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
    spatial_alert = res.json()
    print(f"  [OK] Created Spatial Emergency Alert ID {spatial_alert['id']}.")

    # 5. Spatial In-Zone Query
    print("\n[5/12] Testing Spatial In-Zone Query...")
    res = client.get("/alerts/active?lng=85.82&lat=20.55", headers={"Authorization": f"Bearer {t_cit}"})
    assert res.status_code == 200
    active_in = res.json()
    in_titles = [a["title"] for a in active_in]
    assert "LIVE SPATIAL ZONE EMERGENCY" in in_titles
    print("  [OK] In-zone citizen query successfully received spatial emergency alert.")

    # 6. Spatial Out-of-Zone Query
    print("\n[6/12] Testing Spatial Out-of-Zone Query...")
    res = client.get("/alerts/active?lng=85.00&lat=20.00", headers={"Authorization": f"Bearer {t_cit}"})
    assert res.status_code == 200
    active_out = res.json()
    out_titles = [a["title"] for a in active_out]
    assert "LIVE SPATIAL ZONE EMERGENCY" not in out_titles
    print("  [OK] Out-of-zone citizen query correctly excluded spatial alert.")

    # 7. Global NULL Geometry Query
    print("\n[7/12] Testing Global NULL Geometry Query...")
    res = client.post("/alerts", json={
        "title": "GLOBAL DEMO ALERT",
        "message": "Citywide Broadcast",
        "severity": "ADVISORY",
        "alert_type": "advisory"
    }, headers={"Authorization": f"Bearer {t_coord}"})
    assert res.status_code == 201
    global_alert_id = res.json()["id"]

    res = client.get("/alerts/active?lng=85.00&lat=20.00", headers={"Authorization": f"Bearer {t_cit}"})
    assert res.status_code == 200
    assert any(a["id"] == global_alert_id for a in res.json())
    print("  [OK] Global NULL geometry alert received for all locations.")

    # 8. Soft Deactivation via DELETE
    print("\n[8/12] Testing Alert Deactivation (DELETE)...")
    res = client.delete(f"/alerts/{global_alert_id}", headers={"Authorization": f"Bearer {t_coord}"})
    assert res.status_code == 200

    res = client.get("/alerts/active", headers={"Authorization": f"Bearer {t_cit}"})
    assert res.status_code == 200
    assert not any(a["id"] == global_alert_id for a in res.json())
    print("  [OK] Soft-deactivated alert is excluded from active query.")

    # 9. Terminal State on Deactivated Alert
    print("\n[9/12] Testing Deactivated Terminal State (PATCH)...")
    res = client.patch(f"/alerts/{global_alert_id}", json={"title": "Reopen"}, headers={"Authorization": f"Bearer {t_coord}"})
    assert res.status_code == 400
    print("  [OK] Deactivated alert cannot be reopened or updated via PATCH.")

    # 10. SOS Integration via IncidentReport
    print("\n[10/12] Testing Emergency Mode SOS Integration...")
    res = client.post("/incident-reports", json={
        "category": "rescue",
        "description": "EMERGENCY SOS TRIGGERED VIA LIVE DOCKER TEST",
        "lat": 20.552,
        "lng": 85.823,
        "submitted_offline": False
    }, headers={"Authorization": f"Bearer {t_cit}"})
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
    sos_data = res.json()
    assert sos_data["category"] == "rescue"
    assert sos_data["status"] == "unverified"
    print(f"  [OK] SOS Incident Report ID {sos_data['id']} created with category='rescue' and status='unverified'.")

    # 11. Evacuation Route Integration
    print("\n[11/12] Testing Emergency Mode Evacuation Route Integration...")
    res = client.post("/routing/calculate", json={"from_lat": 20.552, "from_lng": 85.823})
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    route_data = res.json()
    assert route_data["success"] is True
    assert route_data["target_hub_name"] is not None
    print(f"  [OK] Calculated Evacuation Route to {route_data['target_hub_name']} ({route_data['total_distance_km']} km).")

    # 12. Database Schema & Alembic Verification
    print("\n[12/12] Verifying Database Schema & Alembic Revision...")
    conn = psycopg2.connect(DB_URI)
    cursor = conn.cursor()

    cursor.execute("SELECT version_num FROM alembic_version;")
    ver = cursor.fetchone()[0]
    assert ver == "71867cddef4b", f"Expected Alembic head 71867cddef4b, got {ver}"

    cursor.execute("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name != 'alembic_version' AND table_name != 'spatial_ref_sys' AND table_type = 'BASE TABLE';
    """)
    tables = [r[0] for r in cursor.fetchall()]
    table_count = len(tables)
    print(f"  [*] Application tables ({table_count}): {sorted(tables)}")
    assert table_count == 17, f"Expected 17 application tables, got {table_count}: {sorted(tables)}"


    cursor.close()
    conn.close()
    print(f"  [OK] Alembic revision verified at {ver}.")
    print(f"  [OK] Database schema contains exactly {table_count} application tables.")

    print("\n" + "=" * 70)
    print("STEP 6.13 LIVE DOCKER VERIFICATION PASSED (100% SUCCESS)")
    print("=" * 70)


if __name__ == "__main__":
    run_verification()
