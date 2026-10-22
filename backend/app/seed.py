import csv
import os
import re
from datetime import datetime
from backend.app.database import init_db, get_db_connection, db_create_event
from backend.app.models.event import EventCreate, EventType

SEED_CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "seed_events.csv")

NAMES = [
    "Иваном", "Марией", "Алексеем", "Еленой", "Дмитрием",
    "Ольгой", "Натальей", "Сергеем", "Максимом", "Анной"
]
COMPANIES = [
    "Партнёром", "Севером", "Пульсом", "Вектором", "Орбитой",
    "Альфой", "Маяком", "Стартом"
]


def classify_event_type(text: str) -> EventType:
    lower = text.lower()
    if any(k in lower for k in ["встреча", "созвон", "планёрка", "планерка", "демо проекта", "совещание"]):
        return EventType.MEETING
    if any(k in lower for k in ["напомнить", "напоминание", "не забыть"]):
        return EventType.REMINDER
    return EventType.TASK


def extract_attendee(text: str) -> str:
    lower = text.lower()
    for name in NAMES:
        if name.lower() in lower:
            # Map instrumental case back to nominative if desired or keep as is
            return name
    for comp in COMPANIES:
        if comp.lower() in lower:
            return comp
    return ""


def seed_database(force: bool = False) -> int:
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM events")
    count = cursor.fetchone()[0]

    if count > 0 and not force:
        conn.close()
        return count

    if force:
        cursor.execute("DELETE FROM events")
        cursor.execute("DELETE FROM events_fts")
        conn.commit()

    conn.close()

    if not os.path.exists(SEED_CSV_PATH):
        return 0

    inserted = 0
    with open(SEED_CSV_PATH, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_text = row.get("text", "").strip()
            date_str = row.get("date", "").strip()
            time_str = row.get("time", "").strip()

            if not raw_text or not date_str:
                continue

            event_type = classify_event_type(raw_text)
            attendee = extract_attendee(raw_text)

            event = EventCreate(
                type=event_type,
                title=raw_text,
                date=date_str,
                time=time_str if time_str else None,
                attendees=attendee if attendee else None,
                is_completed=False,
            )
            db_create_event(event)
            inserted += 1

    return inserted


if __name__ == "__main__":
    count = seed_database(force=True)
    print(f"Seeded {count} events into SQLite database successfully!")
