import sqlite3
import json

def migrate():
    conn = sqlite3.connect('c:/MasterTimeTable/backend/timetable.db')
    c = conn.cursor()

    try:
        c.execute("ALTER TABLE allocations ADD COLUMN batches JSON")
    except Exception as e:
        print("Add column error:", e)

    c.execute("SELECT id, batch_name FROM allocations")
    rows = c.fetchall()

    for row in rows:
        old_batch = row[1]
        if old_batch:
            new_batches = json.dumps([old_batch])
        else:
            new_batches = "[]"
        c.execute("UPDATE allocations SET batches = ? WHERE id = ?", (new_batches, row[0]))
    
    conn.commit()
    conn.close()
    print("Migration successful")

if __name__ == "__main__":
    migrate()
