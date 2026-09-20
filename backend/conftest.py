"""
ResQnet Test Configuration & Fixtures (Step 6.7)
Fixes FIND-6.7-03 asyncpg connection pool event loop teardown across function-scoped test cases.
"""
import pytest
import pytest_asyncio
from app.db.session import engine


@pytest_asyncio.fixture(autouse=True, scope="function")
async def cleanup_db_engine():
    """
    Asynchronously disposes the async SQLAlchemy engine pool after each test function.
    Guarantees that asyncpg connections bound to the current event loop are properly closed
    before the event loop tears down.
    """
    yield
    await engine.dispose()
