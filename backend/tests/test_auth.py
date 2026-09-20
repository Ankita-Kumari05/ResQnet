"""
ResQnet Authentication & Role Authorization Test Suite (Step 6.2)
Comprehensive test coverage for registration, login, JWT token validation, role-based access control, and security non-disclosure.
"""
import asyncio
import uuid
from datetime import timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.main import app
from app.core.security import create_access_token, get_password_hash
from app.db.session import engine, AsyncSessionLocal
from app.db.models import User, UserRole
from app.modules.auth.router import get_current_user, require_role, require_roles


# ── Test Router for Role Authorization Validation ───────────────────────────
auth_test_router = APIRouter(prefix="/api/v1/test-auth-rbac", tags=["TestAuthRBAC"])


@auth_test_router.get("/coordinator-only")
async def coordinator_endpoint(user: User = Depends(require_role(UserRole.coordinator))):
    return {"message": "Welcome Coordinator", "user_id": user.id}


@auth_test_router.get("/responder-or-coordinator")
async def responder_coordinator_endpoint(user: User = Depends(require_roles(UserRole.responder, UserRole.coordinator))):
    return {"message": "Welcome Operational Staff", "user_id": user.id, "role": user.role.value}


@auth_test_router.get("/fundraiser-allowed")
async def fundraiser_endpoint(user: User = Depends(require_roles(UserRole.fundraiser, UserRole.coordinator))):
    return {"message": "Welcome Fundraiser", "user_id": user.id, "role": user.role.value}


app.include_router(auth_test_router)


# ── Helper Fixture to Seed Users for Testing ─────────────────────────────────
async def get_or_create_test_user(email: str, full_name: str, role: UserRole, password: str = "Secret123!") -> User:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email.lower().strip()))
        user = result.scalar_one_or_none()
        if user:
            return user

        user = User(
            email=email.lower().strip(),
            full_name=full_name,
            hashed_password=get_password_hash(password),
            role=role,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


# ── Test Cases ──────────────────────────────────────────────────────────────

def test_citizen_registration_success():
    async def _run():
        unique_email = f"citizen_{uuid.uuid4().hex[:8]}@example.com"
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/auth/register",
                    json={
                        "email": unique_email,
                        "full_name": "Test Citizen",
                        "password": "ValidPassword123!",
                        "role": "citizen",
                    },
                )
            assert res.status_code == 201
            data = res.json()
            assert data["email"] == unique_email
            assert data["full_name"] == "Test Citizen"
            assert data["role"] == "citizen"
            assert data["is_active"] is True
            assert "id" in data
            # Security non-disclosure
            assert "password" not in data
            assert "hashed_password" not in data
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_fundraiser_registration_success():
    async def _run():
        unique_email = f"fundraiser_{uuid.uuid4().hex[:8]}@example.com"
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/auth/register",
                    json={
                        "email": unique_email,
                        "full_name": "NGO Fundraiser",
                        "password": "ValidPassword123!",
                        "role": "fundraiser",
                    },
                )
            assert res.status_code == 201
            data = res.json()
            assert data["email"] == unique_email
            assert data["role"] == "fundraiser"
            assert "password" not in data
            assert "hashed_password" not in data
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_duplicate_email_registration_rejected():
    async def _run():
        unique_email = f"dup_check_{uuid.uuid4().hex[:8]}@example.com"
        try:
            # 1. Register once
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res1 = await ac.post(
                    "/api/v1/auth/register",
                    json={
                        "email": unique_email,
                        "full_name": "Original User",
                        "password": "Password123!",
                        "role": "citizen",
                    },
                )
                assert res1.status_code == 201

                # 2. Attempt duplicate registration
                res2 = await ac.post(
                    "/api/v1/auth/register",
                    json={
                        "email": unique_email,
                        "full_name": "Duplicate User",
                        "password": "AnotherPassword123!",
                        "role": "citizen",
                    },
                )
            assert res2.status_code == 409
            data = res2.json()
            assert data["status"] == "error"
            assert data["error"]["code"] == "EMAIL_ALREADY_EXISTS"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_privileged_role_registration_rejected():
    async def _run():
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Attempt responder self-registration
                res_resp = await ac.post(
                    "/api/v1/auth/register",
                    json={
                        "email": f"fake_resp_{uuid.uuid4().hex[:8]}@example.com",
                        "full_name": "Fake Responder",
                        "password": "Password123!",
                        "role": "responder",
                    },
                )
                assert res_resp.status_code == 400
                data_resp = res_resp.json()
                assert data_resp["status"] == "error"
                assert data_resp["error"]["code"] == "PRIVILEGED_ROLE_NOT_ALLOWED"

                # 2. Attempt coordinator self-registration
                res_coord = await ac.post(
                    "/api/v1/auth/register",
                    json={
                        "email": f"fake_coord_{uuid.uuid4().hex[:8]}@example.com",
                        "full_name": "Fake Coordinator",
                        "password": "Password123!",
                        "role": "coordinator",
                    },
                )
                assert res_coord.status_code == 400
                data_coord = res_coord.json()
                assert data_coord["status"] == "error"
                assert data_coord["error"]["code"] == "PRIVILEGED_ROLE_NOT_ALLOWED"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_login_success_and_token_generation():
    async def _run():
        unique_email = f"login_test_{uuid.uuid4().hex[:8]}@example.com"
        await get_or_create_test_user(unique_email, "Login Tester", UserRole.citizen, "ValidPassword123!")

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/auth/login",
                    json={
                        "email": unique_email,
                        "password": "ValidPassword123!",
                    },
                )
            assert res.status_code == 200
            data = res.json()
            assert "access_token" in data
            assert data["token_type"] == "bearer"
            assert data["user"]["email"] == unique_email
            assert data["user"]["role"] == "citizen"
            # Non-disclosure
            assert "password" not in data["user"]
            assert "hashed_password" not in data["user"]
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_login_oauth2_form_success():
    async def _run():
        unique_email = f"oauth_test_{uuid.uuid4().hex[:8]}@example.com"
        await get_or_create_test_user(unique_email, "OAuth Tester", UserRole.citizen, "ValidPassword123!")

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/auth/token",
                    data={
                        "username": unique_email,
                        "password": "ValidPassword123!",
                    },
                )
            assert res.status_code == 200
            data = res.json()
            assert "access_token" in data
            assert data["token_type"] == "bearer"
            assert data["user"]["email"] == unique_email
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_login_invalid_password():
    async def _run():
        unique_email = f"bad_pwd_{uuid.uuid4().hex[:8]}@example.com"
        await get_or_create_test_user(unique_email, "Bad Pwd User", UserRole.citizen, "RealPassword123!")

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/auth/login",
                    json={
                        "email": unique_email,
                        "password": "WrongPassword999!",
                    },
                )
            assert res.status_code == 401
            data = res.json()
            assert data["status"] == "error"
            assert data["error"]["code"] == "INVALID_CREDENTIALS"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_login_nonexistent_user():
    async def _run():
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/auth/login",
                    json={
                        "email": f"nonexistent_{uuid.uuid4().hex[:8]}@example.com",
                        "password": "AnyPassword123!",
                    },
                )
            assert res.status_code == 401
            data = res.json()
            assert data["status"] == "error"
            assert data["error"]["code"] == "INVALID_CREDENTIALS"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_get_me_with_valid_token():
    async def _run():
        unique_email = f"me_test_{uuid.uuid4().hex[:8]}@example.com"
        user = await get_or_create_test_user(unique_email, "Me Tester", UserRole.citizen, "ValidPassword123!")
        token = create_access_token({"sub": str(user.id), "email": user.email, "role": "citizen"})

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                me_res = await ac.get(
                    "/api/v1/auth/me",
                    headers={"Authorization": f"Bearer {token}"},
                )
            assert me_res.status_code == 200
            data = me_res.json()
            assert data["email"] == unique_email
            assert data["role"] == "citizen"
            assert "password" not in data
            assert "hashed_password" not in data
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_get_me_without_token():
    async def _run():
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.get("/api/v1/auth/me")
            assert res.status_code == 401
            data = res.json()
            assert data["status"] == "error"
            assert data["error"]["code"] == "UNAUTHORIZED"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_get_me_with_invalid_token():
    async def _run():
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.get(
                    "/api/v1/auth/me",
                    headers={"Authorization": "Bearer invalid.garbage.token.here"},
                )
            assert res.status_code == 401
            data = res.json()
            assert data["status"] == "error"
            assert data["error"]["code"] == "INVALID_TOKEN"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_get_me_with_expired_token():
    async def _run():
        try:
            expired_token = create_access_token(
                data={"sub": "1", "email": "test@example.com", "role": "citizen"},
                expires_delta=timedelta(hours=-1),
            )
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.get(
                    "/api/v1/auth/me",
                    headers={"Authorization": f"Bearer {expired_token}"},
                )
            assert res.status_code == 401
            data = res.json()
            assert data["status"] == "error"
            assert data["error"]["code"] == "INVALID_TOKEN"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_role_based_authorization():
    async def _run():
        try:
            coord_email = f"coord_{uuid.uuid4().hex[:8]}@resqnet.org"
            resp_email = f"resp_{uuid.uuid4().hex[:8]}@resqnet.org"
            citizen_email = f"citizen_rbac_{uuid.uuid4().hex[:8]}@example.com"
            fund_email = f"fund_rbac_{uuid.uuid4().hex[:8]}@example.com"

            coord_user = await get_or_create_test_user(coord_email, "Commander Alice", UserRole.coordinator)
            resp_user = await get_or_create_test_user(resp_email, "Responder Bob", UserRole.responder)
            citizen_user = await get_or_create_test_user(citizen_email, "Citizen Charlie", UserRole.citizen)
            fund_user = await get_or_create_test_user(fund_email, "Fundraiser Dan", UserRole.fundraiser)

            coord_token = create_access_token({"sub": str(coord_user.id), "email": coord_user.email, "role": "coordinator"})
            resp_token = create_access_token({"sub": str(resp_user.id), "email": resp_user.email, "role": "responder"})
            citizen_token = create_access_token({"sub": str(citizen_user.id), "email": citizen_user.email, "role": "citizen"})
            fund_token = create_access_token({"sub": str(fund_user.id), "email": fund_user.email, "role": "fundraiser"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # A. Coordinator accessing coordinator-only -> 200 OK
                res = await ac.get("/api/v1/test-auth-rbac/coordinator-only", headers={"Authorization": f"Bearer {coord_token}"})
                assert res.status_code == 200

                # B. Citizen accessing coordinator-only -> 403 Forbidden
                res = await ac.get("/api/v1/test-auth-rbac/coordinator-only", headers={"Authorization": f"Bearer {citizen_token}"})
                assert res.status_code == 403
                assert res.json()["error"]["code"] == "FORBIDDEN"

                # C. Responder accessing coordinator-only -> 403 Forbidden
                res = await ac.get("/api/v1/test-auth-rbac/coordinator-only", headers={"Authorization": f"Bearer {resp_token}"})
                assert res.status_code == 403
                assert res.json()["error"]["code"] == "FORBIDDEN"

                # D. Responder accessing responder-or-coordinator -> 200 OK
                res = await ac.get("/api/v1/test-auth-rbac/responder-or-coordinator", headers={"Authorization": f"Bearer {resp_token}"})
                assert res.status_code == 200

                # E. Coordinator accessing responder-or-coordinator -> 200 OK
                res = await ac.get("/api/v1/test-auth-rbac/responder-or-coordinator", headers={"Authorization": f"Bearer {coord_token}"})
                assert res.status_code == 200

                # F. Citizen accessing responder-or-coordinator -> 403 Forbidden
                res = await ac.get("/api/v1/test-auth-rbac/responder-or-coordinator", headers={"Authorization": f"Bearer {citizen_token}"})
                assert res.status_code == 403

                # G. Fundraiser accessing fundraiser-allowed -> 200 OK
                res = await ac.get("/api/v1/test-auth-rbac/fundraiser-allowed", headers={"Authorization": f"Bearer {fund_token}"})
                assert res.status_code == 200

                # H. Citizen accessing fundraiser-allowed -> 403 Forbidden
                res = await ac.get("/api/v1/test-auth-rbac/fundraiser-allowed", headers={"Authorization": f"Bearer {citizen_token}"})
                assert res.status_code == 403
        finally:
            await engine.dispose()

    asyncio.run(_run())
