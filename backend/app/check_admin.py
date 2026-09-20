import asyncio
from app.db.session import engine
from sqlalchemy import text

async def check():
    async with engine.connect() as conn:
        r = await conn.execute(text("SELECT id, email, full_name, role, is_active FROM users WHERE email = 'admin@resqnet.in';"))
        print('admin user:', r.fetchall())

if __name__ == '__main__':
    asyncio.run(check())
