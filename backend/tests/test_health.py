import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import engine


def test_health_check():
    async def _run():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    asyncio.run(_run())


def test_api_v1_health_check():
    async def _run():
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.get("/api/v1/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert "database" in data
        finally:
            await engine.dispose()

    asyncio.run(_run())
