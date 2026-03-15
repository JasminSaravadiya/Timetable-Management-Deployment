import sqlite3
import sys
import os

DB_PATH = "c:\\MasterTimeTable\\backend\\timetable.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    tables_to_migrate = [
        "branches",
        "semesters",
        "subjects",
        "faculties",
        "rooms",
        "semester_faculty_maps",
        "semester_room_maps"
    ]

    print("Starting migration to add config_id to configuration tables...")

    # 1. Ensure at least one config exists to use as a fallback for old data
    cursor.execute("SELECT id FROM timetable_configs ORDER BY id ASC LIMIT 1")
    row = cursor.fetchone()
    if row:
        default_config_id = row[0]
        print(f"Found existing TimetableConfig ID: {default_config_id}. Existing data will be scoped here.")
    else:
        print("No existing TimetableConfigs found. Creating a default fallback config.")
        cursor.execute('''
            INSERT INTO timetable_configs (name, start_time, end_time, slot_duration_minutes, breaks)
            VALUES ('Legacy Schedule', '08:00:00', '16:00:00', 60, '[]')
        ''')
        default_config_id = cursor.lastrowid
        print(f"Created TimetableConfig ID: {default_config_id}")

    # 2. Alter tables safely (SQLite supports ADD COLUMN)
    for table in tables_to_migrate:
        # Check if column already exists
        cursor.execute(f"PRAGMA table_info({table})")
        columns = [info[1] for info in cursor.fetchall()]
        
        if "config_id" not in columns:
            try:
                # Add the column
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN config_id INTEGER REFERENCES timetable_configs(id)")
                # Update existing rows to bind to the default config
                cursor.execute(f"UPDATE {table} SET config_id = ?", (default_config_id,))
                print(f"Successfully added config_id to {table} and migrated old records.")
            except Exception as e:
                print(f"Error migrating {table}: {e}")
        else:
            print(f"Table {table} already has config_id. Skipping.")

    conn.commit()
    conn.close()
    print("Migration complete!")

if __name__ == "__main__":
    migrate()
