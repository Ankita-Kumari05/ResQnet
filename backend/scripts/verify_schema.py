import asyncio
from sqlalchemy import text
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.db.session import engine

async def check():
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT version_num FROM alembic_version;"))
        ver = res.scalar()
        print(f"ALEMBIC_HEAD: {ver}")
        
        res = await conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_type = 'BASE TABLE'
              AND table_name != 'spatial_ref_sys'
              AND table_name != 'alembic_version'
            ORDER BY table_name;
        """))
        tables = [r[0] for r in res.fetchall()]
        print(f"APPLICATION_TABLES_COUNT: {len(tables)}")
        print(f"TABLES: {tables}")
        
        res = await conn.execute(text("""
            SELECT t.typname 
            FROM pg_type t 
            JOIN pg_namespace n ON n.oid = t.typnamespace 
            WHERE n.nspname = 'public' AND t.typtype = 'e'
            ORDER BY t.typname;
        """))
        enums = [r[0] for r in res.fetchall()]
        print(f"NATIVE_ENUMS_COUNT: {len(enums)}")
        print(f"ENUMS: {enums}")

if __name__ == "__main__":
    asyncio.run(check())
