import os
import json
import logging
from datetime import date, datetime
from typing import Dict, Any, Optional
import httpx
from backend.app.services.nlu_parser import parse_user_intent

logger = logging.getLogger(__name__)

MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")


async def call_mistral_llm(prompt: str) -> Optional[Dict[str, Any]]:
    if not MISTRAL_API_KEY:
        return None

    today_str = date.today().isoformat()
    now_time = datetime.now().strftime("%H:%M")
    weekdays = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
    current_weekday = weekdays[date.today().weekday()]

    system_prompt = f"""Ты — интеллектуальный модуль распознавания намерений личного голосового ассистента.
Текущая дата: {today_str} ({current_weekday}), текущее время: {now_time}.
Твоя задача — извлечь параметры из запроса пользователя и вернуть исключительно JSON следующего формата:
{{
    "intent": "CREATE_EVENT" | "LIST_EVENTS" | "SEARCH_EVENTS" | "COMPLETE_EVENT" | "DELETE_EVENT" | "RESCHEDULE_EVENT" | "UNKNOWN",
    "type": "task" | "meeting" | "reminder",
    "title": "название задачи/встречи без служебных слов",
    "date": "YYYY-MM-DD или null",
    "time": "HH:MM или null",
    "attendees": "имя участника или null",
    "query": "поисковый запрос при поиске/удалении/завершении",
    "is_week": false
}}
Все относительные даты ("сегодня", "завтра", "в пятницу", "до конца недели", "через два часа") переводи строго в даты формата YYYY-MM-DD и время HH:MM относительно текущей даты {today_str}.
Верни только валидный JSON без markdown форматирования."""

    url = "https://api.mistral.ai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "mistral-small-latest",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"]
                return json.loads(content)
            else:
                logger.warning(f"Mistral API returned status {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.warning(f"Mistral API call failed: {e}. Falling back to internal NLU.")
    return None


async def call_groq_llm(prompt: str) -> Optional[Dict[str, Any]]:
    if not GROQ_API_KEY:
        return None

    today_str = date.today().isoformat()
    now_time = datetime.now().strftime("%H:%M")

    system_prompt = f"""Ты — интеллектуальный модуль распознавания намерений голосового ассистента.
Текущая дата: {today_str}, время: {now_time}.
Верни строго JSON:
{{
    "intent": "CREATE_EVENT" | "LIST_EVENTS" | "SEARCH_EVENTS" | "COMPLETE_EVENT" | "DELETE_EVENT" | "RESCHEDULE_EVENT" | "UNKNOWN",
    "type": "task" | "meeting" | "reminder",
    "title": "название задачи/встречи",
    "date": "YYYY-MM-DD или null",
    "time": "HH:MM или null",
    "attendees": "имя участника или null",
    "query": "поисковый запрос",
    "is_week": false
}}"""

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"]
                return json.loads(content)
    except Exception as e:
        logger.warning(f"Groq API call failed: {e}")
    return None


async def parse_query_with_llm_or_fallback(text: str) -> Dict[str, Any]:
    if MISTRAL_API_KEY:
        llm_res = await call_mistral_llm(text)
        if llm_res and "intent" in llm_res:
            return llm_res

    if GROQ_API_KEY:
        llm_res = await call_groq_llm(text)
        if llm_res and "intent" in llm_res:
            return llm_res

    return parse_user_intent(text)
