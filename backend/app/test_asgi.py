import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app

async def test_asgi():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Login
        r_login = await client.post("/api/auth/token", data={"username": "admin@resqnet.in", "password": "admin123"})
        print("Login status:", r_login.status_code)
        token = r_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Verifications
        r_ver = await client.get("/api/admin/verifications", headers=headers)
        print("Verifications status:", r_ver.status_code, "Count:", len(r_ver.json()))

        # Analytics
        r_ana = await client.get("/api/admin/analytics", headers=headers)
        print("Analytics status:", r_ana.status_code, "Data:", r_ana.json())

        # Audit logs
        r_aud = await client.get("/api/admin/audit-logs", headers=headers)
        print("Audit status:", r_aud.status_code, "Count:", len(r_aud.json()))

        # Notifications
        r_not = await client.get("/api/admin/notifications?role=admin", headers=headers)
        print("Notifications status:", r_not.status_code, "Count:", len(r_not.json()))

        # Config
        r_cfg = await client.get("/api/admin/config", headers=headers)
        print("Config status:", r_cfg.status_code, "Data:", r_cfg.json())

if __name__ == "__main__":
    asyncio.run(test_asgi())
