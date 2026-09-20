import psycopg2

def verify_clean_state():
    conn = psycopg2.connect('postgresql://resqnet:resqnet@localhost:5432/resqnet')
    cur = conn.cursor()

    print("==================================================")
    print("VERIFYING CLEAN DATABASE STATE")
    print("==================================================")

    cur.execute("SELECT count(*), max(id) FROM missions;")
    m_count, m_max = cur.fetchone()
    print(f"Missions: {m_count} legitimate records (Max ID: {m_max})")

    cur.execute("SELECT id, title, status, responder_id FROM missions ORDER BY id;")
    for row in cur.fetchall():
        print(f"  - #{row[0]}: {row[1]} [{row[2]}] (Responder #{row[3]})")

    cur.execute("SELECT count(*), max(id) FROM hazard_zones;")
    hz_count, hz_max = cur.fetchone()
    print(f"\nHazard Zones: {hz_count} legitimate records (Max ID: {hz_max})")
    cur.execute("SELECT id, name, severity, is_active FROM hazard_zones ORDER BY id;")
    for row in cur.fetchall():
        print(f"  - #{row[0]}: {row[1]} [{row[2]}] (Active: {row[3]})")

    cur.execute("SELECT id, name, status, is_blocked FROM roads ORDER BY id;")
    print(f"\nRoad Network Status:")
    for row in cur.fetchall():
        print(f"  - Road #{row[0]}: {row[1]} -> Status: {row[2]}, Blocked: {row[3]}")

    cur.execute("SELECT r.id, u.full_name, r.status FROM responders r JOIN users u ON r.user_id = u.id ORDER BY r.id;")
    print(f"\nResponders Status:")
    for row in cur.fetchall():
        print(f"  - Responder #{row[0]}: {row[1]} -> {row[2]}")

    conn.close()

if __name__ == "__main__":
    verify_clean_state()
