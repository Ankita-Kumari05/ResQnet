import requests
import json

BASE = "http://localhost:8000/api/v1"

# Login as responder
r = requests.post(f"{BASE}/auth/login", json={"email": "responder1@resqnet.in", "password": "respond123"}, timeout=5)
res_auth = r.json()
token = res_auth.get("data", {}).get("access_token") if isinstance(res_auth, dict) and "data" in res_auth else res_auth.get("access_token")
headers = {"Authorization": f"Bearer {token}"}

# Fetch all key data
hubs_res = requests.get(f"{BASE}/hubs", headers=headers, timeout=5).json()
roads_res = requests.get(f"{BASE}/roads", headers=headers, timeout=5).json()
intersections_res = requests.get(f"{BASE}/roads/intersections", headers=headers, timeout=5).json()
hazards_res = requests.get(f"{BASE}/hazards", headers=headers, timeout=5).json()
clusters_res = requests.get(f"{BASE}/clusters", headers=headers, timeout=5).json()

print("=== HUB COORDINATES ===", flush=True)
hub_lats = [h['lat'] for h in hubs_res]
hub_lngs = [h['lng'] for h in hubs_res]
print(f"Total hubs: {len(hubs_res)}", flush=True)
print(f"Lat range: [{min(hub_lats):.3f}, {max(hub_lats):.3f}]", flush=True)
print(f"Lng range: [{min(hub_lngs):.3f}, {max(hub_lngs):.3f}]", flush=True)
for h in hubs_res[:10]:
    print(f"  Hub #{h['id']}: lat={h['lat']}, lng={h['lng']}, status={h['status']}", flush=True)

print("\n=== INTERSECTION COORDINATES ===", flush=True)
int_lats = [i['lat'] for i in intersections_res]
int_lngs = [i['lng'] for i in intersections_res]
print(f"Total intersections: {len(intersections_res)}", flush=True)
print(f"Lat range: [{min(int_lats):.3f}, {max(int_lats):.3f}]", flush=True)
print(f"Lng range: [{min(int_lngs):.3f}, {max(int_lngs):.3f}]", flush=True)
for i in intersections_res[:5]:
    print(f"  Intersection #{i['id']}: lat={i['lat']}, lng={i['lng']}", flush=True)

print("\n=== ROAD IDs 1 and 2 (Mission targets) ===", flush=True)
int_dict = {i['id']: i for i in intersections_res}
for road in roads_res:
    if road['id'] in [1, 2]:
        fi = int_dict.get(road['from_intersection_id'])
        ti = int_dict.get(road['to_intersection_id'])
        print(f"  Road #{road['id']}: name={road['name']}, status={road['status']}, is_blocked={road['is_blocked']}", flush=True)
        if fi and ti:
            print(f"    From: ({fi['lat']}, {fi['lng']}) -> To: ({ti['lat']}, {ti['lng']})", flush=True)

print("\n=== ROAD GEOMETRY (all roads) ===", flush=True)
matched_roads = 0
unmatched_roads = 0
for road in roads_res:
    fi = int_dict.get(road['from_intersection_id'])
    ti = int_dict.get(road['to_intersection_id'])
    if fi and ti:
        matched_roads += 1
    else:
        unmatched_roads += 1
print(f"  Matched roads: {matched_roads}/{len(roads_res)}", flush=True)
print(f"  Unmatched roads (missing intersection): {unmatched_roads}/{len(roads_res)}", flush=True)

# What is the coordinate range of matched roads?
matched_coords = []
for road in roads_res:
    fi = int_dict.get(road['from_intersection_id'])
    ti = int_dict.get(road['to_intersection_id'])
    if fi and ti:
        matched_coords.append([fi['lng'], fi['lat']])
        matched_coords.append([ti['lng'], ti['lat']])

if matched_coords:
    mlngs = [c[0] for c in matched_coords]
    mlats = [c[1] for c in matched_coords]
    print(f"  Road coord range: Lat [{min(mlats):.3f}, {max(mlats):.3f}], Lng [{min(mlngs):.3f}, {max(mlngs):.3f}]", flush=True)

print("\n=== HAZARD GEOMETRY ===", flush=True)
print(f"Total hazards: {len(hazards_res)}", flush=True)
active = [h for h in hazards_res if h['is_active']]
print(f"Active hazards: {len(active)}", flush=True)

all_hazard_coords = []
for hz in hazards_res:
    geom = hz.get('geometry') or hz.get('geom')
    if not geom:
        print(f"  Hazard #{hz['id']}: NO GEOMETRY", flush=True)
        continue
    coords = geom.get('coordinates', [])
    print(f"  Hazard #{hz['id']}: {hz['name']}, sev={hz['severity']}, active={hz['is_active']}, type={geom['type']}, first_coord={coords[0][0] if coords and coords[0] else None}", flush=True)
    if coords and coords[0]:
        ring = coords[0]
        for pt in ring:
            all_hazard_coords.append(pt)

if all_hazard_coords:
    hlngs = [c[0] for c in all_hazard_coords]
    hlats = [c[1] for c in all_hazard_coords]
    print(f"\n  All hazard coords range: Lat [{min(hlats):.3f}, {max(hlats):.3f}], Lng [{min(hlngs):.3f}, {max(hlngs):.3f}]", flush=True)

print("\n=== CLUSTER COORDINATES ===", flush=True)
print(f"Total clusters: {len(clusters_res)}", flush=True)
open_clusters = [c for c in clusters_res if c['status'] in ['open', 'mission_assigned']]
print(f"Open/assigned clusters: {len(open_clusters)}", flush=True)
for c in clusters_res[:5]:
    print(f"  Cluster #{c['id']}: lat={c['centroid_lat']}, lng={c['centroid_lng']}, status={c['status']}", flush=True)

print("\n=== MAP CENTER FOR REFERENCE ===", flush=True)
print(f"  ResQnetMap MAP_CENTER = [85.827, 20.553]", flush=True)
print(f"  Zoom = 14.5 (roughly ~0.02deg viewport at zoom 14)", flush=True)
print(f"  Viewport bounds approx: Lat [20.533, 20.573], Lng [85.807, 85.847]", flush=True)

print("\n=== DATA VISIBILITY ANALYSIS ===", flush=True)
# Compute which hubs are in the estimated viewport
VP_SLAT, VP_NLAT, VP_WLNG, VP_ELNG = 20.533, 20.573, 85.807, 85.847
hub_in_vp = [h for h in hubs_res if VP_SLAT <= h['lat'] <= VP_NLAT and VP_WLNG <= h['lng'] <= VP_ELNG]
hub_out_vp = [h for h in hubs_res if not (VP_SLAT <= h['lat'] <= VP_NLAT and VP_WLNG <= h['lng'] <= VP_ELNG)]
print(f"  Hubs IN viewport: {len(hub_in_vp)}", flush=True)
print(f"  Hubs OUTSIDE viewport: {len(hub_out_vp)}", flush=True)
for h in hub_out_vp[:5]:
    print(f"    OUTSIDE: Hub #{h['id']}: lat={h['lat']}, lng={h['lng']}", flush=True)

hazard_in_vp = 0
hazard_out_vp = 0
for hz in hazards_res:
    geom = hz.get('geometry') or hz.get('geom')
    if geom and geom.get('coordinates'):
        ring = geom['coordinates'][0]
        for pt in ring:
            if VP_SLAT <= pt[1] <= VP_NLAT and VP_WLNG <= pt[0] <= VP_ELNG:
                hazard_in_vp += 1
                break
            else:
                hazard_out_vp += 1
                break
print(f"  Active hazards IN viewport: {hazard_in_vp}", flush=True)
print(f"  Active hazards OUTSIDE viewport: {hazard_out_vp}", flush=True)
