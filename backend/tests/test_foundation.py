"""
ResQnet Foundation & Infrastructure Tests (Step 6.1)
Verifies application bootstrapping, router hierarchy, DB session dependency, and error handling envelope.
"""
import asyncio
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text
from fastapi import APIRouter

from app.main import app
from app.core.config import get_settings
from app.core.exceptions import (
    AppException,
    NotFoundException,
    BadRequestException,
    UnauthorizedException,
    ForbiddenException,
    ConflictException,
    ValidationException,
)
from app.db.session import get_db, AsyncSessionLocal, engine
from app.api.v1.router import api_v1_router


# ── Test 1: Application Import & Settings ────────────────────────────────────
def test_app_imports_and_settings():
    settings = get_settings()
    assert settings.PROJECT_NAME == "ResQnet"
    assert settings.VERSION == "1.0.0"
    assert settings.API_V1_PREFIX == "/api/v1"
    assert app.title == "ResQnet"


# ── Test 2: Root Health Endpoint ─────────────────────────────────────────────
def test_health_endpoint():
    async def _run():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["version"] == "1.0.0"

    asyncio.run(_run())


# ── Test 3: Versioned API Health Endpoint ────────────────────────────────────
def test_api_v1_health_endpoint():
    async def _run():
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.get("/api/v1/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert data["version"] == "1.0.0"
            assert data["database"] == "connected"
        finally:
            await engine.dispose()

    asyncio.run(_run())


# ── Test 4: Database Session Dependency ──────────────────────────────────────
def test_db_session_dependency():
    async def _run():
        try:
            db_gen = get_db()
            session = await anext(db_gen)
            try:
                result = await session.execute(text("SELECT 1"))
                assert result.scalar() == 1
            finally:
                try:
                    await anext(db_gen)
                except StopAsyncIteration:
                    pass
        finally:
            await engine.dispose()

    asyncio.run(_run())


# ── Test 5: Central v1 Router Hierarchy ──────────────────────────────────────
def test_central_v1_router_loaded():
    schema = app.openapi()
    route_paths = list(schema.get("paths", {}).keys())
    assert "/health" in route_paths
    assert "/api/v1/health" in route_paths


# ── Test 6: Centralized Error Handling Envelope Format ──────────────────────
def test_error_handling_envelope():
    test_router = APIRouter(prefix="/test-errors")

    @test_router.get("/not-found")
    async def raise_not_found():
        raise NotFoundException(message="Custom item not found", code="CUSTOM_NOT_FOUND")

    @test_router.get("/bad-request")
    async def raise_bad_request():
        raise BadRequestException(message="Custom bad request", details={"field": "missing"})

    app.include_router(test_router)

    async def _run():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Test 404 domain exception
            res_404 = await ac.get("/test-errors/not-found")
            assert res_404.status_code == 404
            data_404 = res_404.json()
            assert data_404["status"] == "error"
            assert data_404["error"]["code"] == "CUSTOM_NOT_FOUND"
            assert data_404["error"]["message"] == "Custom item not found"
            assert "timestamp" in data_404

            # 2. Test 400 domain exception with details
            res_400 = await ac.get("/test-errors/bad-request")
            assert res_400.status_code == 400
            data_400 = res_400.json()
            assert data_400["status"] == "error"
            assert data_400["error"]["code"] == "BAD_REQUEST"
            assert data_400["error"]["details"] == {"field": "missing"}

            # 3. Test HTTP 404 for nonexistent route
            res_nonexistent = await ac.get("/nonexistent-endpoint-xyz")
            assert res_nonexistent.status_code == 404
            data_nonexistent = res_nonexistent.json()
            assert data_nonexistent["status"] == "error"
            assert data_nonexistent["error"]["code"] == "NOT_FOUND"

    asyncio.run(_run())
