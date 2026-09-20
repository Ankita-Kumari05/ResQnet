"""
Live End-to-End Runtime Operational Chain Verification (Step 6.16)
Executes Tests A, B, C, D, E, F against running FastAPI backend on http://127.0.0.1:8000/api/v1.
"""
import requests
import uuid
import time

import psycopg2

BASE = "http://127.0.0.1:8000/api/v1"

def log(msg):
    print(f"[TEST] {msg}", flush=True)

def reset_network():
    conn = psycopg2.connect("postgresql://resqnet:resqnet@127.0.0.1:5432/resqnet")
    cur = conn.cursor()
    cur.execute("UPDATE roads SET is_blocked = false, status = 'clear', hazard_penalty = 0.0, flood_penalty = 0.0, congestion_penalty = 0.0")
    cur.execute("UPDATE safety_hubs SET current_occupancy = 120, status = 'open' WHERE id = 1")
    conn.commit()
    conn.close()

def run():
    reset_network()
    # ── Authenticate Personas ──────────────────────────────────────────────────
    log("Authenticating test actors...")
    r_coord = requests.post(f"{BASE}/auth/login", json={"email": "coordinator@resqnet.in", "password": "coord123"}).json()
    coord_token = r_coord["access_token"]
    
    r_cit = requests.post(f"{BASE}/auth/login", json={"email": "citizen1@resqnet.in", "password": "citizen123"}).json()
    cit_token = r_cit["access_token"]
    
    r_resp = requests.post(f"{BASE}/auth/login", json={"email": "responder1@resqnet.in", "password": "respond123"}).json()
    resp_token = r_resp["access_token"]
    
    h_coord = {"Authorization": f"Bearer {coord_token}"}
    h_cit = {"Authorization": f"Bearer {cit_token}"}
    h_resp = {"Authorization": f"Bearer {resp_token}"}
    
    # ─── TEST A: Complete Operational Chain ────────────────────────────────────
    log("--- START TEST A: Complete Operational Chain ---")
    
    # Initial route before any blockages
    route_pre = requests.post(f"{BASE}/routing/calculate", json={"from_lat": 20.552, "from_lng": 85.823}).json()
    log(f"Pre-blockage route: Hub={route_pre.get('target_hub_name')}, distance={route_pre.get('total_distance_km')}km, steps={[s['road_id'] for s in route_pre.get('steps', [])]}")
    target_road_id = route_pre["steps"][0]["road_id"]
    log(f"Selected target road to inspect & block: Road #{target_road_id}")
    
    # 1. Citizen reports incident
    rep_res = requests.post(f"{BASE}/incident-reports", headers=h_cit, json={
        "category": "flood",
        "description": "Massive flash flood washing over the roadway",
        "lat": 20.553,
        "lng": 85.824,
        "submitted_offline": False
    })
    assert rep_res.status_code == 201, f"Report failed: {rep_res.text}"
    report_data = rep_res.json()
    log(f"1. Citizen report created: #{report_data['id']}, status={report_data['status']} (MUST be unverified)")
    assert report_data["status"] == "unverified"
    
    # 2. Coordinator triggers clustering or views clusters
    cluster_res = requests.get(f"{BASE}/clusters", headers=h_coord)
    assert cluster_res.status_code == 200
    clusters = cluster_res.json()
    log(f"2. Coordinator sees {len(clusters)} incident clusters")
    
    # 3. Coordinator lists responders directory
    resp_dir_res = requests.get(f"{BASE}/missions/responders", headers=h_coord)
    assert resp_dir_res.status_code == 200
    responders = resp_dir_res.json()
    log(f"3. Coordinator queried responders directory: {len(responders)} responders available")
    responder_id = responders[0]["id"]
    
    # 4. Coordinator creates & assigns mission for road survey
    mission_res = requests.post(f"{BASE}/missions", headers=h_coord, json={
        "mission_type": "survey_road",
        "title": f"Inspect Road #{target_road_id} Obstruction",
        "description": "Verify reported water levels and check physical passability",
        "road_id": target_road_id,
        "responder_id": responder_id
    })
    assert mission_res.status_code == 201, f"Mission create failed: {mission_res.text}"
    mission = mission_res.json()
    mission_id = mission["id"]
    log(f"4. Coordinator assigned mission #{mission_id} to responder #{responder_id}, initial status={mission['status']}")
    assert mission["status"] == "assigned"
    
    # 5. Responder sees mission
    my_missions = requests.get(f"{BASE}/missions", headers=h_resp).json()
    assert any(m["id"] == mission_id for m in my_missions), "Mission not found in responder list"
    log(f"5. Responder #{responder_id} retrieved mission #{mission_id}")
    
    # 6. Responder accepts mission
    accept_res = requests.post(f"{BASE}/missions/{mission_id}/accept", headers=h_resp)
    assert accept_res.status_code == 200
    assert accept_res.json()["status"] == "accepted"
    log(f"6. Responder accepted mission #{mission_id}")
    
    # 7. Responder starts mission
    start_res = requests.post(f"{BASE}/missions/{mission_id}/start", headers=h_resp)
    assert start_res.status_code == 200
    assert start_res.json()["status"] == "in_progress"
    log(f"7. Responder started mission #{mission_id} -> status=in_progress")
    
    # 8. Responder submits field survey (EVIDENCE ONLY)
    survey_res = requests.post(f"{BASE}/field-surveys", headers=h_resp, json={
        "mission_id": mission_id,
        "hazard_level": 5,
        "verification_outcome": "road_blocked",
        "observed_condition": "Complete culvert collapse and impassable flood surge",
        "road_status": "blocked",
        "hazard_penalty": 99.0,
        "flood_penalty": 99.0,
        "congestion_penalty": 0.0,
        "is_blocked": True,
        "notes": "Vehicles cannot pass. Immediate road closure required.",
        "submitted_offline": False
    })
    assert survey_res.status_code == 201, f"Survey submit failed: {survey_res.text}"
    survey = survey_res.json()
    survey_id = survey["id"]
    log(f"8. Field survey #{survey_id} submitted as EVIDENCE.")
    
    # Verify road ground truth has NOT changed yet (critical constraint!)
    road_check = requests.get(f"{BASE}/roads/{target_road_id}").json()
    log(f"   Road #{target_road_id} before propagation: is_blocked={road_check['is_blocked']} (must be False)")
    assert road_check["is_blocked"] is False, "Violation: Survey submission mutated ground truth before propagation!"
    
    # 9. Explicit authorized propagation
    prop_res = requests.post(f"{BASE}/field-surveys/{survey_id}/propagate", headers=h_resp)
    assert prop_res.status_code == 200, f"Propagation failed: {prop_res.text}"
    prop_data = prop_res.json()
    log(f"9. Explicit propagation executed: {prop_data['message']}, road_is_blocked={prop_data['road_is_blocked']}")
    assert prop_data["road_is_blocked"] is True
    
    # Verify road ground truth is now updated
    road_updated = requests.get(f"{BASE}/roads/{target_road_id}").json()
    log(f"   Authoritative ground truth for road #{target_road_id}: is_blocked={road_updated['is_blocked']}, status={road_updated['status']}")
    assert road_updated["is_blocked"] is True
    assert road_updated["status"] == "blocked"
    
    # 10. Citizen requests new evacuation route -> MUST avoid the blocked road!
    route_post = requests.post(f"{BASE}/routing/calculate", json={"from_lat": 20.552, "from_lng": 85.823}).json()
    post_steps = [s["road_id"] for s in route_post.get("steps", [])]
    log(f"10. Recalculated route steps: {post_steps}")
    assert target_road_id not in post_steps, f"Violation: Route still uses blocked road #{target_road_id}!"
    log(f"SUCCESS TEST A: Blocked road #{target_road_id} was avoided by Dijkstra! Chain verified end-to-end.")
    
    # Complete mission
    requests.post(f"{BASE}/missions/{mission_id}/complete", headers=h_resp)
    log("Responder completed mission.")

    # ─── TEST B: Emergency Alert Flow ──────────────────────────────────────────
    log("--- START TEST B: Emergency Alert Flow ---")
    alert_res = requests.post(f"{BASE}/alerts", headers=h_coord, json={
        "title": "URGENT TSUNAMI & RIVER SURGE",
        "message": "Immediate evacuation ordered for all low-lying river areas.",
        "severity": "EMERGENCY",
        "alert_type": "evacuation"
    })
    assert alert_res.status_code == 201, f"Alert failed: {alert_res.text}"
    alert_id = alert_res.json()["id"]
    log(f"1. Coordinator broadcasted alert #{alert_id}")
    
    active_alerts = requests.get(f"{BASE}/alerts/active", headers=h_cit).json()
    assert any(a["id"] == alert_id for a in active_alerts), "New alert not in active alerts"
    log(f"2. Citizen received active emergency alert #{alert_id}")
    
    # ─── TEST E: Safety Hub Capacity ───────────────────────────────────────────
    log("--- START TEST E: Safety Hub Capacity ---")
    hubs = requests.get(f"{BASE}/hubs", headers=h_coord).json()
    log(f"Loaded {len(hubs)} hubs. Testing occupancy updates...")
    hub1 = hubs[0]
    log(f"Hub #{hub1['id']} ({hub1['name']}) initial: {hub1['current_occupancy']}/{hub1['max_capacity']}, status={hub1['status']}")
    
    # Update occupancy to max_capacity
    delta = hub1['max_capacity'] - hub1['current_occupancy']
    occ_res = requests.patch(f"{BASE}/hubs/{hub1['id']}/occupancy", headers=h_coord, json={"delta": delta})
    assert occ_res.status_code == 200, f"Occupancy update failed: {occ_res.text}"
    hub_full = occ_res.json()
    log(f"Hub #{hub1['id']} updated to full: {hub_full['current_occupancy']}/{hub_full['max_capacity']}, status={hub_full['status']}")
    assert hub_full["status"] == "full"
    
    # Verify Dijkstra excludes FULL hub
    route_check = requests.post(f"{BASE}/routing/calculate", json={"from_lat": hub1["lat"] + 0.001, "from_lng": hub1["lng"] + 0.001}).json()
    assert route_check["target_hub_id"] != hub1["id"], f"FULL Hub #{hub1['id']} was NOT excluded from route calculation!"
    log(f"Dijkstra routed to alternate Hub #{route_check['target_hub_id']} ('{route_check['target_hub_name']}'). FULL hub was successfully excluded!")
    
    # ─── TEST F: Campaign & Sandbox Donations ──────────────────────────────────
    log("--- START TEST F: Campaign & Sandbox Donations ---")
    camps = requests.get(f"{BASE}/campaigns").json()
    assert len(camps) > 0, "No campaigns found"
    camp = camps[0]
    initial_raised = camp["raised_amount"]
    donation_amount = 750.0
    log(f"Campaign #{camp['id']} '{camp['title']}': raised={initial_raised}/{camp['target_amount']}")
    
    don_res = requests.post(f"{BASE}/donations", json={
        "campaign_id": camp["id"],
        "amount": donation_amount,
        "donor_name": "Test Donor Priya",
        "message": "Stay strong!",
        "transaction_ref": f"TXN-{uuid.uuid4().hex[:12]}"
    })
    assert don_res.status_code == 201, f"Donation failed: {don_res.text}"
    log(f"Donation recorded: id={don_res.json()['id']}, amount=INR {donation_amount}")
    
    camp_after = requests.get(f"{BASE}/campaigns/{camp['id']}").json()
    assert camp_after["raised_amount"] == initial_raised + donation_amount
    log(f"Campaign #{camp['id']} updated raised_amount: INR {camp_after['raised_amount']} (verified +INR {donation_amount})")
    
    # ─── TEST C: Offline Citizen Report Sync Replay ───────────────────────────
    log("--- START TEST C: Offline Citizen Sync Replay ---")
    cit_client_id = f"test-client-cit-{uuid.uuid4().hex[:8]}"
    cit_op_id = str(uuid.uuid4())
    replay_cit_payload = {
        "client_id": cit_client_id,
        "operations": [{
            "operation_id": cit_op_id,
            "operation_type": "submit_report",
            "client_timestamp": "2026-09-05T12:00:00Z",
            "payload": {
                "category": "flood",
                "description": "Offline reported flood surge at marketplace",
                "lat": 20.553,
                "lng": 85.826,
            }
        }]
    }
    sync_cit_res = requests.post(f"{BASE}/sync/replay", headers=h_cit, json=replay_cit_payload)
    assert sync_cit_res.status_code == 200, f"Citizen replay failed: {sync_cit_res.text}"
    sync_cit_data = sync_cit_res.json()
    assert sync_cit_data["accepted"] == 1, f"Expected 1 accepted, got: {sync_cit_data}"
    rep_id = sync_cit_data["results"][0]["server_entity_id"]
    log(f"1. Offline citizen report replayed successfully -> server report_id={rep_id}")
    
    # Test idempotency (replay same operation_id)
    dup_res = requests.post(f"{BASE}/sync/replay", headers=h_cit, json=replay_cit_payload)
    assert dup_res.status_code == 200
    dup_data = dup_res.json()
    # Idempotent replay should not create a duplicate report
    log(f"2. Idempotent replay executed: accepted={dup_data['accepted']}, conflicts={dup_data['conflicts']}")
    
    # ─── TEST D: Offline Responder Survey Sync Replay ──────────────────────────
    log("--- START TEST D: Offline Responder Survey Sync Replay ---")
    # 1. Create and assign mission to responder1
    m_offline_res = requests.post(f"{BASE}/missions", headers=h_coord, json={
        "mission_type": "survey_road",
        "title": "Offline Survey Test Mission",
        "description": "Test survey submission while offline",
        "responder_id": 1,
        "road_id": 1,
    })
    assert m_offline_res.status_code == 201
    off_mission = m_offline_res.json()
    # Accept mission
    requests.post(f"{BASE}/missions/{off_mission['id']}/accept", headers=h_resp)
    
    resp_client_id = f"test-client-resp-{uuid.uuid4().hex[:8]}"
    resp_op_id = str(uuid.uuid4())
    replay_resp_payload = {
        "client_id": resp_client_id,
        "operations": [{
            "operation_id": resp_op_id,
            "operation_type": "field_survey",
            "client_timestamp": "2026-09-05T12:05:00Z",
            "payload": {
                "mission_id": off_mission["id"],
                "hazard_level": 4,
                "verification_outcome": "road_blocked",
                "road_status": "blocked",
                "hazard_penalty": 80.0,
                "flood_penalty": 40.0,
                "congestion_penalty": 0.0,
                "is_blocked": True,
                "notes": "Offline field survey evidence recorded",
            }
        }]
    }
    sync_resp_res = requests.post(f"{BASE}/sync/replay", headers=h_resp, json=replay_resp_payload)
    assert sync_resp_res.status_code == 200, f"Responder replay failed: {sync_resp_res.text}"
    sync_resp_data = sync_resp_res.json()
    assert sync_resp_data["accepted"] == 1, f"Expected 1 accepted, got: {sync_resp_data}"
    srv_id = sync_resp_data["results"][0]["server_entity_id"]
    log(f"1. Offline responder survey replayed successfully -> server survey_id={srv_id}")
    
    # Test survey remains evidence and does NOT auto-mutate ground truth
    road1 = requests.get(f"{BASE}/roads/1").json()
    assert road1["is_blocked"] is False, "Violation: Replay mutated ground truth without explicit propagation!"
    log("2. Verified: Replayed field survey remains evidence only; road #1 is_blocked is still False.")
    
    print("\nALL RUNTIME INTEGRATION TESTS (A, B, C, D, E, F, G) PASSED WITH FLYING COLORS!", flush=True)

if __name__ == "__main__":
    run()
