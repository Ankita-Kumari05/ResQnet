import asyncio
import httpx

async def test_responder_flow():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000") as client:
        # 1. Login as Coordinator
        print("--- 1. Login Coordinator ---")
        res_c = await client.post(
            "/api/auth/token",
            data={"username": "coordinator@resqnet.in", "password": "coord123"},
        )
        assert res_c.status_code == 200, f"Coordinator login failed: {res_c.text}"
        coord_token = res_c.json()["access_token"]
        c_headers = {"Authorization": f"Bearer {coord_token}"}
        print("Coordinator login OK")

        # 2. Login as Responder
        print("--- 2. Login Responder ---")
        res_r = await client.post(
            "/api/auth/token",
            data={"username": "responder1@resqnet.in", "password": "respond123"},
        )
        assert res_r.status_code == 200, f"Responder login failed: {res_r.text}"
        resp_token = res_r.json()["access_token"]
        r_headers = {"Authorization": f"Bearer {resp_token}"}
        print("Responder login OK")

        # Check Responder status & profile
        r_me = await client.get("/api/missions/responders/me", headers=r_headers)
        print("Responder profile:", r_me.status_code, r_me.json())
        responder_id = r_me.json()["id"]

        # 3. Coordinator deploys a real mission to this responder
        print("--- 3. Coordinator Deploys Mission ---")
        # Fetch an existing cluster to link to the mission
        clusters_res = await client.get("/api/clusters", headers=c_headers)
        assert clusters_res.status_code == 200
        clusters = clusters_res.json()
        cluster_id = clusters[0]["id"] if clusters else None

        m_payload = {
            "title": "E2E Field Damage Assessment",
            "description": "Cross-verification of Sector 17 commercial block structural pillar.",
            "mission_type": "verify_incident",
            "responder_id": responder_id,
            "cluster_id": cluster_id,
            "target_lat": 30.7414,
            "target_lng": 76.7852,
            "notes": "Urgent responder dispatch test."
        }
        res_m = await client.post("/api/missions", json=m_payload, headers=c_headers)
        print("Create mission status:", res_m.status_code)
        assert res_m.status_code == 201, f"Mission creation failed: {res_m.text}"
        mission = res_m.json()
        mission_id = mission["id"]
        print(f"Mission #{mission_id} created with status: {mission['status']}")

        # 4. Responder fetches notifications (should show this newly dispatched mission)
        print("--- 4. Responder Notifications Check ---")
        res_notif = await client.get("/api/notifications?role=responder", headers=r_headers)
        print("Responder notifications status:", res_notif.status_code, "Count:", len(res_notif.json()))
        assert res_notif.status_code == 200
        found_m = any(n.get("dispatchRef") == f"MISSION-#{mission_id}" for n in res_notif.json())
        print(f"New mission found in notifications: {found_m}")

        # 5. Responder accepts & starts mission (ASSIGNED -> ACCEPTED -> IN_PROGRESS)
        print("--- 5. Responder Accepts and Starts Mission ---")
        res_acc = await client.post(f"/api/missions/{mission_id}/accept", headers=r_headers)
        print("Accept status:", res_acc.status_code, "Status in DB:", res_acc.json()["status"])
        assert res_acc.status_code == 200

        res_start = await client.post(f"/api/missions/{mission_id}/start", headers=r_headers)
        print("Start status:", res_start.status_code, "Status in DB:", res_start.json()["status"])
        assert res_start.status_code == 200
        assert res_start.json()["status"] == "in_progress"

        # Responder sets duty status to on_mission
        res_duty = await client.post("/api/missions/responders/status", json={"status": "on_mission"}, headers=r_headers)
        print("Responder duty status updated to:", res_duty.json()["status"])
        assert res_duty.json()["status"] == "on_mission"

        # Coordinator verifies mission is now in_progress
        c_m_check = await client.get(f"/api/missions/{mission_id}", headers=c_headers)
        print(f"Coordinator reads mission status: {c_m_check.json()['status']}")
        assert c_m_check.json()["status"] == "in_progress"

        # 6. Responder submits field survey
        print("--- 6. Responder Submits Field Survey ---")
        survey_payload = {
            "mission_id": mission_id,
            "hazard_level": 4,
            "verification_outcome": "confirmed_hazard",
            "observed_condition": "4.2cm shear fracture along lower third of concrete colonnade pillar. Verified on scene.",
            "road_status": "hazardous",
            "hazard_penalty": 65.0,
            "flood_penalty": 40.0,
            "congestion_penalty": 20.0,
            "is_blocked": True,
            "notes": "Cordon: 50m • Evacuation completed",
            "submitted_offline": False
        }
        res_survey = await client.post("/api/field-surveys", json=survey_payload, headers=r_headers)
        print("Submit survey status:", res_survey.status_code)
        assert res_survey.status_code == 201, f"Survey submit failed: {res_survey.text}"
        survey = res_survey.json()
        survey_id = survey["id"]
        print(f"Field Survey #{survey_id} created, is_propagated: {survey.get('is_propagated')}")

        # 7. Propagate field survey ground-truth
        print("--- 7. Propagate Ground Truth ---")
        res_prop = await client.post(f"/api/field-surveys/{survey_id}/propagate", headers=r_headers)
        print("Propagate status:", res_prop.status_code, res_prop.json().get("message"))
        assert res_prop.status_code == 200

        # 8. Responder completes mission & returns duty to available
        print("--- 8. Complete Mission ---")
        res_comp = await client.post(f"/api/missions/{mission_id}/complete", headers=r_headers)
        print("Complete status:", res_comp.status_code, "Mission status:", res_comp.json()["status"])
        assert res_comp.status_code == 200
        assert res_comp.json()["status"] == "completed"

        res_avail = await client.post("/api/missions/responders/status", json={"status": "available"}, headers=r_headers)
        print("Responder duty status reset to:", res_avail.json()["status"])
        assert res_avail.json()["status"] == "available"

        # Coordinator verifies responder is available and mission completed
        c_r_check = await client.get("/api/missions/responders/me", headers=r_headers)
        print(f"Final shared responder status verified: {c_r_check.json()['status']}")
        assert c_r_check.json()["status"] == "available"

        print("=== ALL END-TO-END TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    asyncio.run(test_responder_flow())
