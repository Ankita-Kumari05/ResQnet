import requests
import json
import sys

BASE = "http://localhost:8000/api/v1"
try:
    r = requests.post(f"{BASE}/auth/login", json={"email": "responder1@resqnet.in", "password": "respond123"}, timeout=5)
    print("Responder login status:", r.status_code, flush=True)
    res_auth = r.json()
    token = res_auth.get("data", {}).get("access_token") if isinstance(res_auth, dict) and "data" in res_auth else res_auth.get("access_token")
    headers = {"Authorization": f"Bearer {token}"}

    endpoints = [
        "/missions",
        "/roads",
        "/roads/intersections",
        "/hazards",
        "/hubs",
        "/clusters",
    ]

    for ep in endpoints:
        res = requests.get(f"{BASE}{ep}", headers=headers, timeout=5)
        print("=" * 40, flush=True)
        print(f"Endpoint: {ep} | Status: {res.status_code}", flush=True)
        body = res.json()
        if isinstance(body, list):
            print(f"Count: {len(body)}", flush=True)
            if len(body) > 0:
                print("Sample 1:", json.dumps(body[0], indent=2)[:300], flush=True)
        elif isinstance(body, dict):
            data = body.get("data", body)
            if isinstance(data, list):
                print(f"Count (in data): {len(data)}", flush=True)
                if len(data) > 0:
                    print("Sample 1:", json.dumps(data[0], indent=2)[:300], flush=True)
            else:
                print("Dict:", json.dumps(body, indent=2)[:300], flush=True)

    # Inspect all missions
    print("=" * 40, flush=True)
    m_res = requests.get(f"{BASE}/missions", headers=headers, timeout=5)
    missions = m_res.json()
    print("Total missions:", len(missions), flush=True)
    for m in missions:
        print(f"Mission #{m.get('id')}: title={m.get('title')}, type={m.get('mission_type')}, status={m.get('status')}, target_lat={m.get('target_lat')}, target_lng={m.get('target_lng')}, cluster_id={m.get('cluster_id')}, hub_id={m.get('hub_id')}", flush=True)
        mid = m.get("id")
        fs_res = requests.get(f"{BASE}/missions/{mid}/field-surveys", headers=headers, timeout=5)
        surveys = fs_res.json()
        if surveys:
            for s in surveys:
                print(f"   Survey #{s.get('id')}: status={s.get('road_status')}, blocked={s.get('is_blocked')}, outcome={s.get('verification_outcome')}, road_id={s.get('road_id')}, haz_zone_id={s.get('hazard_zone_id')}, prop={s.get('is_propagated')}", flush=True)

except Exception as e:
    print("Error:", e, flush=True)
