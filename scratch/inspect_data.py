import requests
import json

BASE = "http://localhost:8000/api/v1"
r = requests.post(f"{BASE}/auth/login", json={"email": "citizen1@resqnet.in", "password": "citizen123"})
print("Login status:", r.status_code)
res_json = r.json()
token = res_json.get("data", {}).get("access_token") if "data" in res_json else res_json.get("access_token")
headers = {"Authorization": f"Bearer {token}"}

endpoints = [
    "/hubs",
    "/roads",
    "/roads/intersections",
    "/clusters",
    "/hazards",
    "/alerts/active",
    "/missions"
]

for ep in endpoints:
    res = requests.get(f"{BASE}{ep}", headers=headers)
    print("=" * 40)
    print(f"Endpoint: {ep} | Status: {res.status_code}")
    try:
        body = res.json()
        data = body.get("data", body) if isinstance(body, dict) and "data" in body else body
        if isinstance(data, list):
            print(f"Count: {len(data)}")
            if len(data) > 0:
                print("First item:", json.dumps(data[0], indent=2))
        else:
            print("Data (dict/other):", json.dumps(data, indent=2))
    except Exception as e:
        print("Error parsing response:", e)

# Also test route calculation
print("=" * 40)
print("Testing /routing/calculate...")
# Hub 1 is usually a hub
route_res = requests.post(f"{BASE}/routing/calculate", headers=headers, json={
    "from_lat": 20.552,
    "from_lng": 85.823,
    "target_hub_id": 1
})
print("Route status:", route_res.status_code)
print("Route response:", json.dumps(route_res.json(), indent=2))
