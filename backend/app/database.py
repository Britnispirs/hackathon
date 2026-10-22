import sqlite3
import os
from typing import List, Optional, Dict, Any
from datetime import datetime
from backend.app.models.event import EventItem, EventCreate, EventUpdate, EventFilter, EventType

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "assistant.db"))


def get_db_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL DEFAULT 'task',
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT,
        description TEXT,
        attendees TEXT,
        is_completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_datetime ON events(date, time);")

    cursor.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
        title,
        description,
        attendees,
        content='events',
        content_rowid='id',
        tokenize='unicode61 remove_diacritics 2'
    );
    """)

    cursor.execute("""
    CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
        INSERT INTO events_fts(rowid, title, description, attendees) 
        VALUES (new.id, new.title, coalesce(new.description, ''), coalesce(new.attendees, ''));
    END;
    """)

    cursor.execute("""
    CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
        INSERT INTO events_fts(events_fts, rowid, title, description, attendees) 
        VALUES('delete', old.id, old.title, coalesce(old.description, ''), coalesce(old.attendees, ''));
    END;
    """)

    cursor.execute("""
    CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
        INSERT INTO events_fts(events_fts, rowid, title, description, attendees) 
        VALUES('delete', old.id, old.title, coalesce(old.description, ''), coalesce(old.attendees, ''));
        INSERT INTO events_fts(rowid, title, description, attendees) 
        VALUES (new.id, new.title, coalesce(new.description, ''), coalesce(new.attendees, ''));
    END;
    """)

    conn.commit()
    conn.close()


def row_to_event(row: sqlite3.Row) -> EventItem:
    return EventItem(
        id=row["id"],
        type=EventType(row["type"]),
        title=row["title"],
        date=row["date"],
        time=row["time"],
        description=row["description"],
        attendees=row["attendees"],
        is_completed=bool(row["is_completed"]),
        created_at=row["created_at"],
    )


def db_create_event(event: EventCreate) -> EventItem:
    conn = get_db_connection()
    cursor = conn.cursor()
    now_iso = datetime.now().isoformat()
    cursor.execute(
        """
        INSERT INTO events (type, title, date, time, description, attendees, is_completed, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event.type.value,
            event.title.strip(),
            event.date,
            event.time,
            event.description,
            event.attendees,
            1 if event.is_completed else 0,
            now_iso,
        ),
    )
    event_id = cursor.lastrowid
    conn.commit()

    cursor.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    row = cursor.fetchone()
    conn.close()
    return row_to_event(row)


def db_get_event(event_id: int) -> Optional[EventItem]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return row_to_event(row)
    return None


def db_update_event(event_id: int, update_data: EventUpdate) -> Optional[EventItem]:
    conn = get_db_connection()
    cursor = conn.cursor()

    fields = []
    values = []

    if update_data.type is not None:
        fields.append("type = ?")
        values.append(update_data.type.value)
    if update_data.title is not None:
        fields.append("title = ?")
        values.append(update_data.title.strip())
    if update_data.date is not None:
        fields.append("date = ?")
        values.append(update_data.date)
    if update_data.time is not None:
        fields.append("time = ?")
        values.append(update_data.time)
    if update_data.description is not None:
        fields.append("description = ?")
        values.append(update_data.description)
    if update_data.attendees is not None:
        fields.append("attendees = ?")
        values.append(update_data.attendees)
    if update_data.is_completed is not None:
        fields.append("is_completed = ?")
        values.append(1 if update_data.is_completed else 0)

    if not fields:
        conn.close()
        return db_get_event(event_id)

    values.append(event_id)
    query = f"UPDATE events SET {', '.join(fields)} WHERE id = ?"
    cursor.execute(query, values)
    conn.commit()

    cursor.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return row_to_event(row)
    return None


def db_delete_event(event_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM events WHERE id = ?", (event_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def db_list_events(filters: Optional[EventFilter] = None, limit: int = 200) -> List[EventItem]:
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM events WHERE 1=1"
    params: List[Any] = []

    if filters:
        if filters.type:
            query += " AND type = ?"
            params.append(filters.type.value)
        if filters.start_date:
            query += " AND date >= ?"
            params.append(filters.start_date)
        if filters.end_date:
            query += " AND date <= ?"
            params.append(filters.end_date)
        if filters.is_completed is not None:
            query += " AND is_completed = ?"
            params.append(1 if filters.is_completed else 0)
        if filters.query:
            query += " AND (title LIKE ? OR description LIKE ? OR attendees LIKE ?)"
            like_term = f"%{filters.query}%"
            params.extend([like_term, like_term, like_term])

    query += " ORDER BY date ASC, time ASC, id ASC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [row_to_event(r) for r in rows]


def db_find_conflicts(date: str, time: str, exclude_id: Optional[int] = None) -> List[EventItem]:
    if not time:
        return []
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM events WHERE date = ? AND time = ? AND type = 'meeting'"
    params: List[Any] = [date, time]

    if exclude_id is not None:
        query += " AND id != ?"
        params.append(exclude_id)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [row_to_event(r) for r in rows]


def db_search_fts(search_term: str, limit: int = 50) -> List[EventItem]:
    if not search_term or not search_term.strip():
        return []

    conn = get_db_connection()
    cursor = conn.cursor()

    cleaned = "".join(ch for ch in search_term if ch.isalnum() or ch.isspace()).strip()
    words = cleaned.split()
    if not words:
        conn.close()
        return []

    fts_query = " ".join(f"{w}*" for w in words)

    try:
        cursor.execute(
            """
            SELECT e.*, rank FROM events e
            JOIN (
                SELECT rowid, rank FROM events_fts WHERE events_fts MATCH ?
            ) f ON e.id = f.rowid
            ORDER BY rank
            LIMIT ?
            """,
            (fts_query, limit),
        )
        rows = cursor.fetchall()
        events = [row_to_event(r) for r in rows]
    except Exception:
        like_term = f"%{search_term}%"
        cursor.execute(
            """
            SELECT * FROM events 
            WHERE title LIKE ? OR description LIKE ? OR attendees LIKE ?
            ORDER BY date DESC LIMIT ?
            """,
            (like_term, like_term, like_term, limit),
        )
        rows = cursor.fetchall()
        events = [row_to_event(r) for r in rows]

    conn.close()
    return events
