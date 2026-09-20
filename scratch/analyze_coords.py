import requests
import json

BASE = "http://localhost:8000/api/v1"
r = requests.post(f"{BASE}/auth/login", json={"email": "coordinator@resqnet.in", "password": "coord123"})
res_auth = r.json()
token = res_auth.get("data", {}).get("access_token") if isinstance(res_auth, dict) and "data" in res_auth else res_auth.get("access_token")
headers = {"Authorization": f"Bearer {token}"}

def get_data(ep):
    res = requests.get(f"{BASE}{ep}", headers=headers)
    body = res.json()
    return body.get("data", body) if isinstance(body, dict) and "data" in body else body

hubs = get_data('/hubs')
roads = get_data('/roads')
intersections = get_data('/roads/intersections')
clusters = get_data('/clusters')
hazards = get_data('/hazards')
missions = get_data('/missions')
alerts = get_data('/alerts/active')

print("=== HUBS COORDINATE SUMMARY ===")
hub_lats = [h['lat'] for h in hubs if h.get('lat') is not None]
hub_lngs = [h['lng'] for h in hubs if h.get('lng') is not None]
if hub_lats:
    print(f"Hubs ({len(hubs)}): Lat range [{min(hub_lats):.4f}, {max(hub_lats):.4f}], Lng range [{min(hub_lngs):.4f}, {max(hub_lngs):.4f}]")
    print(f"Sample Hub 1-3: {[ (h['id'], h['name'], h['lat'], h['lng']) for h in hubs[:3] ]}")

print("\n=== INTERSECTIONS COORDINATE SUMMARY ===")
int_lats = [i['lat'] for i in intersections if i.get('lat') is not None]
int_lngs = [i['lng'] for i in intersections if i.get('lng') is not None]
if int_lats:
    print(f"Intersections ({len(intersections)}): Lat range [{min(int_lats):.4f}, {max(int_lats):.4f}], Lng range [{min(int_lngs):.4f}, {max(int_lngs):.4f}]")

print("\n=== ROADS MATCHING SUMMARY ===")
int_dict = {i['id']: i for i in intersections}
matched_roads = 0
unmatched_roads = 0
for road in roads:
    f = int_dict.get(road.get('from_intersection_id'))
    t = int_dict.get(road.get('to_intersection_id'))
    if f and t:
        matched_roads += 1
    else:
        unmatched_roads += 1
print(f"Roads ({len(roads)}): Matched to intersections = {matched_roads}, Unmatched = {unmatched_roads}")

print("\n=== CLUSTERS COORDINATE SUMMARY ===")
cl_lats = [c['centroid_lat'] for c in clusters if c.get('centroid_lat') is not None]
cl_lngs = [c['centroid_lng'] for c in clusters if c.get('centroid_lng') is not None]
if cl_lats:
    print(f"Clusters ({len(clusters)}): Lat range [{min(cl_lats):.4f}, {max(cl_lats):.4f}], Lng range [{min(cl_lngs):.4f}, {max(cl_lngs):.4f}]")
    for c in clusters:
        print(f"  Cluster {c['id']}: reports={c['report_count']}, lat={c['centroid_lat']}, lng={c['centroid_lng']}, status={c['status']}")

print("\n=== HAZARDS COORDINATE SUMMARY ===")
for hz in hazards:
    geom = hz.get('geometry') or hz.get('geom')
    print(f"  Hazard {hz['id']}: name={hz['name']}, active={hz['is_active']}, severity={hz['severity']}, geom={json.dumps(geom)[:120]}")

print("\n=== MISSIONS COORDINATE SUMMARY ===")
for m in missions:
    print(f"  Mission {m['id']}: title={m['title']}, status={m['status']}, lat={m.get('target_lat')}, lng={m.get('target_lng')}")

print("\n=== ALERTS COORDINATE SUMMARY ===")
for a in alerts:
    print(f"  Alert {a['id']}: title={a['title']}, area={json.dumps(a.get('affected_area_geojson'))[:120]}")
