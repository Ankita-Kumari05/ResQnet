import requests
import json

BASE = "http://localhost:8000/api/v1"
r = requests.post(f"{BASE}/auth/login", json={"email": "coordinator@resqnet.in", "password": "coord123"})
res_auth = r.json()
token = res_auth.get("data", {}).get("access_token") if isinstance(res_auth, dict) and "data" in res_auth else res_auth.get("access_token")
headers = {"Authorization": f"Bearer {token}"}

for ep in ['/hubs', '/roads', '/roads/intersections', '/clusters', '/hazards', '/missions']:
    res = requests.get(f"{BASE}{ep}", headers=headers)
    body = res.json()
    data = body.get("data", body) if isinstance(body, dict) and "data" in body else body
    print(f"\n--- {ep} (Total: {len(data) if isinstance(data, list) else type(data)}) ---")
    if not isinstance(data, list):
        print(data)
        continue
    if ep == '/hubs':
        for h in data[:5]:
            print(f"  Hub {h['id']}: name={h['name']}, lat={h['lat']}, lng={h['lng']}, status={h['status']}")
    elif ep == '/roads':
        for road in data[:5]:
            print(f"  Road {road['id']}: name={road['name']}, from={road['from_intersection_id']}, to={road['to_intersection_id']}, status={road['status']}")
    elif ep == '/roads/intersections':
        for i in data[:5]:
            print(f"  Intersection {i['id']}: name={i['name']}, lat={i['lat']}, lng={i['lng']}")
    elif ep == '/clusters':
        for c in data[:5]:
            print(f"  Cluster {c['id']}: lat={c['centroid_lat']}, lng={c['centroid_lng']}, reports={c['report_count']}, status={c['status']}")
    elif ep == '/hazards':
        for hz in data[:5]:
            geom = hz.get('geometry') or hz.get('geom')
            print(f"  Hazard {hz['id']}: name={hz['name']}, severity={hz['severity']}, is_active={hz['is_active']}, geom_type={geom.get('type') if geom else None}, coords_sample={geom.get('coordinates', [])[:1] if geom else None}")
    elif ep == '/missions':
        for m in data[:5]:
            print(f"  Mission {m['id']}: title={m['title']}, status={m['status']}, lat={m.get('target_lat')}, lng={m.get('target_lng')}")
