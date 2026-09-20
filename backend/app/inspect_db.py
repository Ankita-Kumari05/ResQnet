import asyncio
from app.db.session import engine
from sqlalchemy import text

async def check():
    async with engine.connect() as conn:
        r = await conn.execute(text("SELECT typname, enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'userrole';"))
        print('UserRole pg_enum:', r.fetchall())
        r2 = await conn.execute(text("SELECT id, email, role, is_active FROM users;"))
        print('Users in DB:')
        for u in r2.fetchall():
            print(' ', u)

        r3 = await conn.execute(text("SELECT id, user_id, status FROM responders;"))
        print('All responders in DB:', r3.fetchall())
        r4 = await conn.execute(text("SELECT * FROM responders WHERE user_id = 17;"))
        print('User 17 responder row:', r4.fetchall())

if __name__ == '__main__':
    asyncio.run(check())
