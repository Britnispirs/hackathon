import re
from datetime import datetime, date, timedelta
from typing import Dict, Any, Optional, Tuple, List
from backend.app.models.event import EventType

MONTHS_RU = {
    "января": 1, "январь": 1,
    "февраля": 2, "февраль": 2,
    "марта": 3, "март": 3,
    "апреля": 4, "апрель": 4,
    "мая": 5, "май": 5,
    "июня": 6, "июнь": 6,
    "июля": 7, "июль": 7,
    "августа": 8, "август": 8,
    "сентября": 9, "сентябрь": 9,
    "октября": 10, "октябрь": 10,
    "ноября": 11, "ноябрь": 11,
    "декабря": 12, "декабрь": 12,
}

WEEKDAYS_RU = {
    "понедельник": 0, "пн": 0,
    "вторник": 1, "вт": 1,
    "среда": 2, "среду": 2, "ср": 2,
    "четверг": 3, "чт": 3,
    "пятница": 4, "пятницу": 4, "пт": 4,
    "суббота": 5, "субботу": 5, "сб": 5,
    "воскресенье": 6, "вс": 6,
}


def parse_russian_time(text: str) -> Optional[str]:
    lower = text.lower()

    match_colon = re.search(r"\b([0-1]?[0-9]|2[0-3]):([0-5][0-9])\b", lower)
    if match_colon:
        hours = int(match_colon.group(1))
        minutes = int(match_colon.group(2))
        return f"{hours:02d}:{minutes:02d}"

    match_words = re.search(
        r"(?:в|к|на)\s*([0-2]?[0-9])\s*(?:часов|часа|час)?\s*(утра|дня|вечера|ночи)?",
        lower,
    )
    if match_words:
        hours = int(match_words.group(1))
        period = match_words.group(2)
        if period in ["вечера", "дня"] and hours < 12:
            hours += 12
        elif period == "ночи" and hours == 12:
            hours = 0
        if 0 <= hours <= 23:
            return f"{hours:02d}:00"

    match_rel = re.search(r"через\s+(\d+|два|три|четыре|полчаса|час)\s*(час|часа|часов|минут|минуты)?", lower)
    if match_rel:
        raw_val = match_rel.group(1)
        unit = match_rel.group(2) or ""
        val = 1
        if raw_val == "два":
            val = 2
        elif raw_val == "три":
            val = 3
        elif raw_val == "четыре":
            val = 4
        elif raw_val == "полчаса":
            val = 30
            unit = "минут"
        elif raw_val.isdigit():
            val = int(raw_val)

        now = datetime.now()
        if "минут" in unit:
            future = now + timedelta(minutes=val)
        else:
            future = now + timedelta(hours=val)
        return future.strftime("%H:%M")

    return None


def parse_russian_date(text: str, base_date: Optional[date] = None) -> Optional[str]:
    if base_date is None:
        base_date = date.today()

    lower = text.lower()

    if "послезавтра" in lower:
        return (base_date + timedelta(days=2)).isoformat()
    if "завтра" in lower:
        return (base_date + timedelta(days=1)).isoformat()
    if "сегодня" in lower:
        return base_date.isoformat()

    if "через" in lower and any(u in lower for u in ["час", "часа", "часов", "минут", "полчаса"]):
        return base_date.isoformat()

    if "до конца недели" in lower or "на этой неделе" in lower or "в конце недели" in lower:
        days_ahead = 6 - base_date.weekday()
        return (base_date + timedelta(days=days_ahead)).isoformat()

    if "на следующей неделе" in lower or "следующая неделя" in lower:
        days_ahead = (7 - base_date.weekday()) + 0
        return (base_date + timedelta(days=days_ahead)).isoformat()

    for wday_name, wday_num in WEEKDAYS_RU.items():
        pattern = rf"\b(?:в|во|на)?\s*(следующий|следующую)?\s*{wday_name}\b"
        match = re.search(pattern, lower)
        if match:
            is_next = bool(match.group(1))
            current_wday = base_date.weekday()
            days_diff = (wday_num - current_wday) % 7
            if days_diff == 0:
                days_diff = 7
            if is_next and days_diff < 7:
                days_diff += 7
            return (base_date + timedelta(days=days_diff)).isoformat()

    for month_name, month_num in MONTHS_RU.items():
        pattern = rf"\b(\d{{1,2}})\s+{month_name}\b"
        match = re.search(pattern, lower)
        if match:
            day = int(match.group(1))
            year = base_date.year
            try:
                target = date(year, month_num, day)
                if target < base_date:
                    target = date(year + 1, month_num, day)
                return target.isoformat()
            except ValueError:
                pass

    match_iso = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", lower)
    if match_iso:
        return f"{match_iso.group(1)}-{match_iso.group(2)}-{match_iso.group(3)}"

    match_dot = re.search(r"\b(\d{1,2})\.(\d{1,2})\.?(\d{4})?\b", lower)
    if match_dot:
        d = int(match_dot.group(1))
        m = int(match_dot.group(2))
        y = int(match_dot.group(3)) if match_dot.group(3) else base_date.year
        try:
            return date(y, m, d).isoformat()
        except ValueError:
            pass

    return None


def clean_title(raw_text: str, event_type: EventType, date_str: Optional[str], time_str: Optional[str]) -> str:
    cleaned = raw_text

    prefixes = [
        r"^(пожалуйста\s*,?\s*)",
        r"^(напомни мне\s+)",
        r"^(напомни\s+)",
        r"^(поставь задачу\s+)",
        r"^(добавь задачу\s+)",
        r"^(создай задачу\s+)",
        r"^(поставь встречу\s+)",
        r"^(добавь встречу\s+)",
        r"^(создай встречу\s+)",
        r"^(запланируй встречу\s+)",
        r"^(у меня встреча\s+с\s+)",
        r"^(у меня встреча\s+)",
        r"^(у меня созвон\s+с\s+)",
        r"^(встреча\s+с\s+)",
        r"^(встреча\s+)",
        r"^(нужно\s+)",
        r"^(надо\s+)",
    ]
    for pref in prefixes:
        cleaned = re.sub(pref, "", cleaned, flags=re.IGNORECASE)

    date_time_phrases = [
        r"\b(сегодня|завтра|послезавтра)\b",
        r"\b(до конца недели|на этой неделе|на следующей неделе)\b",
        r"\bв\s+[0-2]?[0-9]:[0-5][0-9]\b",
        r"\bв\s+[0-2]?[0-9]\s*(?:часов|часа|час)?\s*(утра|дня|вечера|ночи)?\b",
        r"\bчерез\s+(\d+|два|три|четыре|полчаса|час)\s*(час|часа|часов|минут|минуты)?\b",
        r"\b(в|во)\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)\b",
    ]
    for dt_phrase in date_time_phrases:
        cleaned = re.sub(dt_phrase, "", cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"\bу меня\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.-")

    if event_type == EventType.MEETING and not any(k in cleaned.lower() for k in ["встреча", "созвон", "планерка", "планёрка", "демо"]):
        if cleaned.lower().startswith("с ") or cleaned.lower().startswith("со "):
            cleaned = f"Встреча {cleaned}"
        elif cleaned:
            cleaned = f"Встреча: {cleaned}"

    if not cleaned:
        cleaned = raw_text.strip()
    return cleaned[0].upper() + cleaned[1:] if len(cleaned) > 0 else cleaned


def clean_search_query(text: str) -> str:
    cleaned = text.lower()
    phrases_to_remove = [
        r"я когда-то ставил задачу",
        r"когда у меня была встреча",
        r"когда была встреча",
        r"когда у меня была",
        r"когда была",
        r"найди задачу",
        r"найди встречу",
        r"найди напоминание",
        r"найди ее",
        r"найди его",
        r"найди их",
        r"найди",
        r"найти",
        r"поищи",
        r"пожалуйста",
        r"подскажи",
        r"покажи",
        r"\bпро\b",
        r"\bпо\b",
        r"\bоб?\b",
        r"\bс\b",
        r"\bсо\b",
        r"\bдля\b",
        r"\bу меня\b",
        r"\bбыла\b",
        r"\bбыл\b",
        r"\bбыли\b",
        r"\bзадачу\b",
        r"\bзадача\b",
        r"\bвстречу\b",
        r"\bвстреча\b",
        r"\bее\b",
        r"\bего\b",
    ]
    for p in phrases_to_remove:
        cleaned = re.sub(p, " ", cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def parse_user_intent(text: str) -> Dict[str, Any]:
    lower = text.lower().strip()

    if any(k in lower for k in ["отметь выполненной", "отметь задачу выполненной", "выполнил задачу", "заверши задачу", "сделано", "отметь как сделано", "отметь задачу"]):
        query = clean_search_query(text)
        return {
            "intent": "COMPLETE_EVENT",
            "query": query,
            "raw_text": text,
        }

    if any(k in lower for k in ["удали", "удалить", "отмени", "отменить", "стереть"]):
        query = clean_search_query(text)
        return {
            "intent": "DELETE_EVENT",
            "query": query,
            "raw_text": text,
        }

    if any(k in lower for k in ["перенеси", "перенести", "сдвинь", "поменяй время", "отложи"]):
        target_date = parse_russian_date(lower)
        target_time = parse_russian_time(lower)
        return {
            "intent": "RESCHEDULE_EVENT",
            "date": target_date,
            "time": target_time,
            "raw_text": text,
        }

    if any(k in lower for k in [
        "найди", "найти", "поищи", "когда у меня была", "когда была", "когда-то ставил", "найди ее", "найди задачу", "найди встречу"
    ]):
        query = clean_search_query(text)
        return {
            "intent": "SEARCH_EVENTS",
            "query": query,
            "raw_text": text,
        }

    list_markers = [
        "что у меня", "какие планы", "покажи мои", "какие задачи", "есть ли у меня",
        "что запланировано", "планы на", "список задач", "расписание"
    ]
    if any(marker in lower for marker in list_markers):
        target_date = parse_russian_date(lower)
        is_week = any(k in lower for k in ["неделю", "на этой неделе", "на следующую неделю"])

        ev_type = None
        if "встреч" in lower:
            ev_type = EventType.MEETING
        elif "задач" in lower:
            ev_type = EventType.TASK
        elif "напоминани" in lower:
            ev_type = EventType.REMINDER

        return {
            "intent": "LIST_EVENTS",
            "date": target_date or date.today().isoformat(),
            "is_week": is_week,
            "type": ev_type,
            "raw_text": text,
        }

    is_meeting = any(k in lower for k in ["встреча", "созвон", "планёрка", "планерка", "демо", "встречу"])
    is_reminder = any(k in lower for k in ["напомни", "напоминание", "не забудь"])

    if is_meeting:
        event_type = EventType.MEETING
    elif is_reminder:
        event_type = EventType.REMINDER
    else:
        event_type = EventType.TASK

    extracted_date = parse_russian_date(lower)
    extracted_time = parse_russian_time(lower)

    title = clean_title(text, event_type, extracted_date, extracted_time)

    attendee = None
    attendee_match = re.search(r"(?:с|со|для)\s+([А-Яа-яA-Za-z]+)", text)
    if attendee_match and attendee_match.group(1).lower() not in ["командой", "партнером", "партнёром"]:
        attendee = attendee_match.group(1)

    return {
        "intent": "CREATE_EVENT",
        "type": event_type,
        "title": title,
        "date": extracted_date,
        "time": extracted_time,
        "attendees": attendee,
        "raw_text": text,
    }
