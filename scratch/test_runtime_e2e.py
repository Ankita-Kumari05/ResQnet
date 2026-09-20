import json
import urllib.request
import urllib.parse

BASE_URL = "http://127.0.0.1:8000/api/v1"

def make_request(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    req_data = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except:
            return e.code, {"error": err_body}
    except Exception as e:
        return 500, {"error": str(e)}

def login(email, password):
    data = {"email": email, "password": password}
    status, body = make_request("/auth/login", method="POST", data=data)
    if status == 200 and "access_token" in body:
        return body["access_token"]
    print(f"Login failed for {email}: {status} {body}")
    return None

def run_tests():
    results = {}
    print("==================================================")
    print("STARTING E2E RUNTIME TESTS (VALIDATED SCHEMAS)")
    print("==================================================")

    # 1. Login Accounts
    coordinator_token = login("coordinator@resqnet.in", "coord123")
    citizen_token = login("citizen1@resqnet.in", "citizen123")
    responder_token = login("responder4@resqnet.in", "respond123") or login("responder1@resqnet.in", "respond123")

    print(f"Auth Check -> Coordinator: {'OK' if coordinator_token else 'FAIL'}, Citizen: {'OK' if citizen_token else 'FAIL'}, Responder (responder4): {'OK' if responder_token else 'FAIL'}")

    # TEST 1 — CITIZEN
    print("\n--- TEST 1: CITIZEN DATA LOADING & ROUTING ---")
    s_hubs, hubs = make_request("/hubs", token=citizen_token)
    s_roads, roads = make_request("/roads", token=citizen_token)
    s_hazards, hazards = make_request("/hazards", token=citizen_token)
    s_alerts, alerts = make_request("/alerts/active", token=citizen_token)
    
    # Test safe route
    s_route, route_res = make_request("/routing/calculate", method="POST", data={
        "from_lat": 30.7333,
        "from_lng": 76.7794,
        "target_hub_id": hubs[0]["id"] if isinstance(hubs, list) and len(hubs) > 0 else 1
    }, token=citizen_token)

    t1_pass = s_hubs == 200 and s_roads == 200 and s_hazards == 200 and s_route == 200 and len(hubs) > 0
    print(f"TEST 1 Result: {'PASS' if t1_pass else 'FAIL'} (Hubs: {len(hubs) if isinstance(hubs, list) else 0}, Roads: {len(roads) if isinstance(roads, list) else 0}, Hazards: {len(hazards) if isinstance(hazards, list) else 0}, Route Status: {s_route}, Distance: {route_res.get('total_distance_km') if isinstance(route_res, dict) else 'N/A'} km)")
    results["TEST 1 — CITIZEN"] = "PASS" if t1_pass else "FAIL"

    # TEST 2 — COORDINATOR
    print("\n--- TEST 2: COORDINATOR CAPABILITIES ---")
    s_resp, responders = make_request("/missions/responders", token=coordinator_token)
    
    # Create test hazard
    hazard_payload = {
        "name": "E2E Runtime Flood Zone Alpha",
        "hazard_type": "flood",
        "severity": "CRITICAL",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[76.775, 30.730], [76.785, 30.730], [76.785, 30.740], [76.775, 30.740], [76.775, 30.730]]]
        }
    }
    s_haz_create, created_hazard = make_request("/hazards", method="POST", data=hazard_payload, token=coordinator_token)
    
    t2_pass = s_resp == 200 and s_haz_create in (200, 201)
    print(f"TEST 2 Result: {'PASS' if t2_pass else 'FAIL'} (Responders: {len(responders) if isinstance(responders, list) else 0}, Hazard Creation: {s_haz_create})")
    results["TEST 2 — COORDINATOR"] = "PASS" if t2_pass else "FAIL"

    # TEST 3 & 4 — END-TO-END MISSION
    print("\n--- TEST 3 & 4: COORDINATOR -> RESPONDER MISSION WORKFLOW ---")
    # Coordinator creates mission assigned to available responder (Responder #4, NDRF Task Force 7)
    available_responder = next((r for r in responders if r.get("status") == "available"), responders[3])
    assigned_responder_id = available_responder.get("id")
    print(f"Assigning mission to: Responder #{assigned_responder_id} ({available_responder.get('full_name')})")

    mission_payload = {
        "title": "URGENT LOGISTICS: Medical Delivery to Safety Hub",
        "description": "Deploy medical unit and replenish emergency antibiotics and sterile trauma kits",
        "mission_type": "deliver_resource",
        "responder_id": assigned_responder_id,
        "hub_id": hubs[0]["id"] if hubs else 1,
        "target_lat": 30.7330,
        "target_lng": 76.7790
    }
    s_mis_create, created_mission = make_request("/missions", method="POST", data=mission_payload, token=coordinator_token)
    mission_id = created_mission.get("id") if isinstance(created_mission, dict) else None
    print(f"Coordinator created mission #{mission_id} -> Status: {s_mis_create}")

    # Responder fetches missions
    s_resp_mis, resp_missions = make_request("/missions", token=responder_token)
    matched_mission = next((m for m in resp_missions if m.get("id") == mission_id or m.get("title") == mission_payload["title"]), None) if isinstance(resp_missions, list) else None
    
    t4_pass = s_mis_create in (200, 201) and matched_mission is not None
    print(f"Responder received mission -> Found: {'YES' if matched_mission else 'NO'}, Title: {matched_mission.get('title') if matched_mission else 'N/A'}, Status: {matched_mission.get('status') if matched_mission else 'N/A'}")
    results["TEST 3 — RESPONDER"] = "PASS" if s_resp_mis == 200 and len(resp_missions) > 0 else "FAIL"
    results["TEST 4 — END-TO-END MISSION"] = "PASS" if t4_pass else "FAIL"

    # TEST 5 — END-TO-END HAZARD PROPAGATION
    print("\n--- TEST 5: HAZARD PROPAGATION TO CITIZEN/RESPONDER ---")
    s_cit_haz, cit_hazards = make_request("/hazards", token=citizen_token)
    has_new_hazard = any(h.get("name") == hazard_payload["name"] for h in cit_hazards) if isinstance(cit_hazards, list) else False
    t5_pass = s_cit_haz == 200 and has_new_hazard
    print(f"Citizen hazard query -> Found newly created hazard: {'YES' if has_new_hazard else 'NO'}")
    results["TEST 5 — END-TO-END HAZARD"] = "PASS" if t5_pass else "FAIL"

    # TEST 6 — END-TO-END ROAD BLOCK
    print("\n--- TEST 6: ROAD BLOCK & ROUTE AVOIDANCE ---")
    target_road_id = roads[0]["id"] if isinstance(roads, list) and len(roads) > 0 else 1
    s_block, block_res = make_request(f"/roads/{target_road_id}/status", method="PATCH", data={"status": "blocked", "is_blocked": True}, token=coordinator_token)
    
    # Query road status as Citizen
    s_roads_upd, roads_upd = make_request("/roads", token=citizen_token)
    updated_road = next((r for r in roads_upd if r["id"] == target_road_id), None) if isinstance(roads_upd, list) else None
    is_now_blocked = updated_road.get("status") == "blocked" or updated_road.get("is_blocked") is True if updated_road else False
    
    t6_pass = s_block == 200 and is_now_blocked
    print(f"Road status update -> Road #{target_road_id} status: {updated_road.get('status') if updated_road else 'N/A'} (Blocked: {is_now_blocked})")
    results["TEST 6 — END-TO-END ROAD BLOCK"] = "PASS" if t6_pass else "FAIL"

    # Reset road back to clear
    make_request(f"/roads/{target_road_id}/status", method="PATCH", data={"status": "clear", "is_blocked": False}, token=coordinator_token)

    # TEST 7 — SIMULATION
    print("\n--- TEST 7: SIMULATION SCENARIO INJECTION ---")
    s_sim_flood, sim_flood_res = make_request("/simulation/events/flood", method="POST", data={"zone_id": 1, "severity": 4}, token=coordinator_token)
    t7_pass = s_sim_flood == 200 and sim_flood_res.get("event") == "flood_started"
    print(f"Simulation flood trigger -> Status: {s_sim_flood}, Response: {sim_flood_res}")
    results["TEST 7 — SIMULATION"] = "PASS" if t7_pass else "FAIL"

    # Cleanup test hazard
    if created_hazard and "id" in created_hazard:
        make_request(f"/hazards/{created_hazard['id']}", method="DELETE", token=coordinator_token)

    print("\n==================================================")
    print("E2E RUNTIME RESULTS SUMMARY:")
    for test, res in results.items():
        print(f"  {test}: {res}")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
