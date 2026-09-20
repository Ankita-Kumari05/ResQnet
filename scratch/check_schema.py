import asyncio
import sys
from sqlalchemy import text

sys.path.insert(0, "d:/5th SEM/ResQnet/backend")
from app.db.session import AsyncSessionLocal

async def check():
    async with AsyncSessionLocal() as session:
        r1 = await session.execute(text("SELECT version_num FROM alembic_version"))
        head = r1.scalar()
        r2 = await session.execute(text(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' "
            "ORDER BY table_name"
        ))
        tables = [row[0] for row in r2.fetchall()]
        print(f"ALEMBIC_HEAD: {head}")
        print("TABLES:", tables)

if __name__ == "__main__":
    asyncio.run(check())
