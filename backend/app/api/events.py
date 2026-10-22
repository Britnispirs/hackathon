from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query, Response
from backend.app.models.event import (
    EventItem,
    EventCreate,
    EventUpdate,
    EventFilter,
    EventType,
)
from backend.app.database import (
    db_list_events,
    db_create_event,
    db_get_event,
    db_update_event,
    db_delete_event,
    db_find_conflicts,
)
from backend.app.services.search_service import hybrid_search_events

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=List[EventItem])
def list_events_endpoint(
    type: Optional[EventType] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    is_completed: Optional[bool] = None,
    query: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=500),
):
    filters = EventFilter(
        type=type,
        start_date=start_date,
        end_date=end_date,
        is_completed=is_completed,
        query=query,
    )
    return db_list_events(filters, limit=limit)


@router.post("", response_model=EventItem, status_code=201)
def create_event_endpoint(event_data: EventCreate):
    return db_create_event(event_data)


@router.get("/search", response_model=List[EventItem])
def search_events_endpoint(
    q: str = Query(..., min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
):
    return hybrid_search_events(q, limit=limit)


@router.get("/conflicts", response_model=List[EventItem])
def check_conflicts_endpoint(
    date: str = Query(...),
    time: str = Query(...),
    exclude_id: Optional[int] = None,
):
    return db_find_conflicts(date, time, exclude_id)


@router.get("/export.ics")
def export_ical_endpoint():
    events = db_list_events(limit=500)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Voice Task Assistant//RU",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Мои задачи и встречи",
    ]

    for ev in events:
        time_part = ev.time if ev.time else "09:00"
        try:
            start_dt = datetime.strptime(f"{ev.date} {time_part}", "%Y-%m-%d %H:%M")
            end_dt = start_dt + timedelta(hours=1)
            dtstart = start_dt.strftime("%Y%m%dT%H%M00")
            dtend = end_dt.strftime("%Y%m%dT%H%M00")
        except Exception:
            dtstart = ev.date.replace("-", "")
            dtend = dtstart

        status_str = "COMPLETED" if ev.is_completed else "CONFIRMED"
        summary = ev.title.replace("\n", " ").replace(";", "\\;")
        desc = (ev.description or "").replace("\n", " ").replace(";", "\\;")

        lines.extend([
            "BEGIN:VEVENT",
            f"UID:event-{ev.id}@voice-assistant.local",
            f"DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M00Z')}",
            f"DTSTART:{dtstart}",
            f"DTEND:{dtend}",
            f"SUMMARY:{summary}",
            f"DESCRIPTION:{desc}",
            f"STATUS:{status_str}",
            "END:VEVENT",
        ])

    lines.append("END:VCALENDAR")
    ics_content = "\r\n".join(lines)
    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="calendar.ics"'},
    )


@router.get("/{event_id}", response_model=EventItem)
def get_event_endpoint(event_id: int):
    event = db_get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    return event


@router.put("/{event_id}", response_model=EventItem)
def update_event_endpoint(event_id: int, update_data: EventUpdate):
    event = db_update_event(event_id, update_data)
    if not event:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    return event


@router.delete("/{event_id}", status_code=200)
def delete_event_endpoint(event_id: int):
    success = db_delete_event(event_id)
    if not success:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    return {"status": "success", "deleted_id": event_id}


@router.post("/{event_id}/toggle", response_model=EventItem)
def toggle_event_endpoint(event_id: int):
    event = db_get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    updated = db_update_event(event_id, EventUpdate(is_completed=not event.is_completed))
    return updated
