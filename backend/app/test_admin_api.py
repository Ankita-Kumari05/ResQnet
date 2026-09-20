import asyncio
import httpx

async def test_endpoints():
    async with httpx.AsyncClient() as client:
        # 1. Login as admin
        res = await client.post(
            "http://127.0.0.1:8000/api/auth/token",
            data={"username": "admin@resqnet.in", "password": "admin123"},
        )
        print("Login status:", res.status_code)
        if res.status_code != 200:
            print("Login error:", res.text)
            return

        data = res.json()
        token = data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Verifications
        r_ver = await client.get("http://127.0.0.1:8000/api/admin/verifications", headers=headers)
        print("Verifications GET status:", r_ver.status_code, "Count:", len(r_ver.json()))

        # 3. Analytics
        r_ana = await client.get("http://127.0.0.1:8000/api/admin/analytics", headers=headers)
        print("Analytics GET status:", r_ana.status_code, "Data:", r_ana.json())

        # 4. Action Logs
        r_aud = await client.get("http://127.0.0.1:8000/api/admin/audit-logs", headers=headers)
        print("Audit Logs GET status:", r_aud.status_code, "Count:", len(r_aud.json()))

        # 5. Notifications
        r_not = await client.get("http://127.0.0.1:8000/api/admin/notifications?role=admin", headers=headers)
        print("Notifications GET status:", r_not.status_code, "Count:", len(r_not.json()))

        # 6. Config
        r_cfg = await client.get("http://127.0.0.1:8000/api/admin/config", headers=headers)
        print("Config GET status:", r_cfg.status_code, "Data:", r_cfg.json())

        # 7. Test decision flipping
        r_dec = await client.post(
            "http://127.0.0.1:8000/api/admin/verifications/VRF-2025-084/decision",
            json={"decision": "APPROVE", "justification": "E2E Automated test accreditation approval"},
            headers=headers
        )
        print("Decision POST status:", r_dec.status_code, r_dec.json())

        # 8. Check that action log was written
        r_aud2 = await client.get("http://127.0.0.1:8000/api/admin/audit-logs?limit=5", headers=headers)
        print("Latest Action Log Entry:", r_aud2.json()[0])

        # 9. Health
        r_hlth = await client.get("http://127.0.0.1:8000/health")
        print("Health status:", r_hlth.status_code, r_hlth.json())

if __name__ == "__main__":
    asyncio.run(test_endpoints())
