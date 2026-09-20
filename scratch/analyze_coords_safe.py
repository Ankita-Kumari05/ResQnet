import requests
import json

BASE = "http://localhost:8000/api/v1"
r = requests.post(f"{BASE}/auth/login", json={"email": "coordinator@resqnet.in", "password": "coord123"}, timeout=5)
res_auth = r.json()
token = res_auth.get("data", {}).get("access_token") if isinstance(res_auth, dict) and "data" in res_auth else res_auth.get("access_token")
headers = {"Authorization": f"Bearer {token}"}

def get_data(ep):
    res = requests.get(f"{BASE}{ep}", headers=headers, timeout=5)
    body = res.json()
    return body.get("data", body) if isinstance(body, dict) and "data" in body else body

hubs = get_data('/hubs')
roads = get_data('/roads')
intersections = get_data('/roads/intersections')
clusters = get_data('/clusters')
hazards = get_data('/hazards')
missions = get_data('/missions')
alerts = get_data('/alerts/active')

print("=== HUBS ===")
print("Total hubs:", len(hubs))
hub_lats = [h['lat'] for h in hubs if h.get('lat') is not None]
hub_lngs = [h['lng'] for h in hubs if h.get('lng') is not None]
if hub_lats:
    print(f"Lat: [{min(hub_lats)}, {max(hub_lats)}], Lng: [{min(hub_lngs)}, {max(hub_lngs)}]")

print("\n=== INTERSECTIONS ===")
print("Total intersections:", len(intersections))
int_lats = [i['lat'] for i in intersections if i.get('lat') is not None]
int_lngs = [i['lng'] for i in intersections if i.get('lng') is not None]
if int_lats:
    print(f"Lat: [{min(int_lats)}, {max(int_lats)}], Lng: [{min(int_lngs)}, {max(int_lngs)}]")

print("\n=== ROADS ===")
print("Total roads:", len(roads))
int_ids = set(i['id'] for i in intersections)
matched = sum(1 for r in roads if r.get('from_intersection_id') in int_ids and r.get('to_intersection_id') in int_ids)
print(f"Roads matched to intersections: {matched}/{len(roads)}")

print("\n=== CLUSTERS ===")
print("Total clusters:", len(clusters))
for c in clusters:
    print(f"  ID {c['id']}: lat={c.get('centroid_lat')}, lng={c.get('centroid_lng')}, reports={c.get('report_count')}, status={c.get('status')}")

print("\n=== HAZARDS ===")
print("Total hazards:", len(hazards))
for h in hazards:
    geom = h.get('geometry') or h.get('geom')
    print(f"  ID {h['id']}: active={h.get('is_active')}, sev={h.get('severity')}, geom_type={geom.get('type') if geom else None}")
    if geom and 'coordinates' in geom:
        coords = geom['coordinates']
        print(f"    first ring coords: {coords[0] if isinstance(coords, list) and len(coords)>0 else coords}")

print("\n=== MISSIONS ===")
print("Total missions:", len(missions))
for m in missions:
    print(f"  ID {m['id']}: status={m.get('status')}, lat={m.get('target_lat')}, lng={m.get('target_lng')}")

print("\n=== ALERTS ===")
print("Total alerts:", len(alerts))
for a in alerts:
    print(f"  ID {a['id']}: title={a.get('title')}, area={a.get('affected_area_geojson')}")
