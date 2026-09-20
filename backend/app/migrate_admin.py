import asyncio
from app.db.session import engine
from sqlalchemy import text

async def migrate():
    async with engine.begin() as conn:
        print("Checking tables and adding columns if not existing...")
        # 1. Add verification_status and darpan_id to responders
        await conn.execute(text("""
            ALTER TABLE responders 
            ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'verified';
        """))
        await conn.execute(text("""
            ALTER TABLE responders 
            ADD COLUMN IF NOT EXISTS darpan_id VARCHAR(100);
        """))
        await conn.execute(text("""
            ALTER TABLE responders 
            ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
        """))

        # 2. Add verification_status to users
        await conn.execute(text("""
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'verified';
        """))
        await conn.execute(text("""
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
        """))
        await conn.execute(text("""
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS department_or_org VARCHAR(255);
        """))

        # 3. Create NGO applications / verifications table if not existing
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ngo_verifications (
                id SERIAL PRIMARY KEY,
                case_number VARCHAR(100) UNIQUE NOT NULL,
                org_name VARCHAR(255) NOT NULL,
                org_type VARCHAR(100) DEFAULT 'Disaster Relief NGO',
                darpan_id VARCHAR(100),
                contact_person VARCHAR(255),
                email VARCHAR(255),
                phone VARCHAR(50),
                status VARCHAR(50) DEFAULT 'pending', -- pending, verified, rejected
                justification TEXT,
                submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TIMESTAMPTZ,
                reviewed_by_id INT REFERENCES users(id) ON DELETE SET NULL,
                metadata JSONB DEFAULT '{}'::jsonb
            );
        """))

        # 4. Create system_config table if not existing
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS system_config (
                key VARCHAR(100) PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """))

        # 5. Seed default config if empty
        await conn.execute(text("""
            INSERT INTO system_config (key, value, updated_at)
            VALUES 
                ('require_darpan_id', 'true'::jsonb, CURRENT_TIMESTAMP),
                ('ground_truth_dual_signoff', 'false'::jsonb, CURRENT_TIMESTAMP),
                ('citizen_throttling', 'true'::jsonb, CURRENT_TIMESTAMP),
                ('buffer_margin_meters', '500'::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO NOTHING;
        """))

        # 6. Seed sample pending / verified NGO verifications if empty
        check_ngo = await conn.execute(text("SELECT count(*) FROM ngo_verifications;"))
        count = check_ngo.scalar()
        if count == 0:
            print("Seeding sample NGO verifications...")
            await conn.execute(text("""
                INSERT INTO ngo_verifications (case_number, org_name, org_type, darpan_id, contact_person, email, phone, status, justification, metadata)
                VALUES 
                (
                    'VRF-2025-084',
                    'ActionAid & Red Cross Relief Charter',
                    'Registered Disaster Relief NGO',
                    'DL/2018/0091234',
                    'Sunita Sharma',
                    'fundraiser@resqnet.in',
                    '+91 97800-11234',
                    'pending',
                    'Awaiting NDMA registrar verification review.',
                    '{"trauma_vans": 4, "paramedics": 8, "volunteers": 20, "capability": "Urban SAR", "fcra_compliant": true}'::jsonb
                ),
                (
                    'VRF-2025-085',
                    'Chandigarh Emergency Volunteers',
                    'Local First-Responder Society',
                    'CH/2021/0291884',
                    'Dr. Ramesh Nanda',
                    'responder1@resqnet.in',
                    '+91 172 274-0012',
                    'verified',
                    'Verified against statutory NGO portal. CA seal certified.',
                    '{"trauma_vans": 2, "paramedics": 5, "volunteers": 184, "capability": "Flood & SAR", "fcra_compliant": true}'::jsonb
                ),
                (
                    'VRF-2025-086',
                    'Himalayan Relief & Logistics Council',
                    'High-Altitude Evacuation NGO',
                    'HP/2024/0991442',
                    'Col. (Retd) K.S. Rathore',
                    'himalayan.relief@resqnet.in',
                    '+91 94180-22190',
                    'pending',
                    'FCRA audit under verification.',
                    '{"trauma_vans": 1, "paramedics": 2, "volunteers": 32, "capability": "Mountain Rescue", "fcra_compliant": false}'::jsonb
                );
            """))

        # 7. Make sure existing responders have verification_status = 'verified'
        await conn.execute(text("UPDATE responders SET verification_status = 'verified' WHERE verification_status IS NULL;"))
        await conn.execute(text("UPDATE users SET verification_status = 'verified' WHERE verification_status IS NULL;"))

        print("Migration complete!")

if __name__ == '__main__':
    asyncio.run(migrate())
