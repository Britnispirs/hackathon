import os
import json
import logging
from typing import Dict, Any, Optional
import httpx
from backend.app.services.nlu_parser import parse_user_intent

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")


async def call_groq_llm(prompt: str) -> Optional[Dict[str, Any]]:
    if not GROQ_API_KEY:
        return None

    system_prompt = """Ты — интеллектуальный модуль распознавания намерений личного голосового ассистента.
Твоя задача — извлечь параметры из запроса пользователя и вернуть строго JSON следующего формата:
{
    "intent": "CREATE_EVENT" | "LIST_EVENTS" | "SEARCH_EVENTS" | "COMPLETE_EVENT" | "DELETE_EVENT" | "RESCHEDULE_EVENT" | "UNKNOWN",
    "type": "task" | "meeting" | "reminder",
    "title": "название задачи/встречи без служебных слов",
    "date": "YYYY-MM-DD или null",
    "time": "HH:MM или null",
    "attendees": "имя участника или null",
    "query": "поисковый запрос при поиске/удалении/завершении",
    "is_week": false
}
Текущая дата и время должны учитываться при вычислении относительных дат ("завтра", "в пятницу", "через два часа").
Отвечай исключительно валидным JSON без markdown разметки."""

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
        logger.warning(f"Groq API call failed: {e}. Falling back to internal NLU.")
    return None


async def parse_query_with_llm_or_fallback(text: str) -> Dict[str, Any]:
    # 1. Try Groq if configured
    if GROQ_API_KEY:
        llm_result = await call_groq_llm(text)
        if llm_result and "intent" in llm_result:
            return llm_result

    # 2. Seamless local fallback (instant, 0 ms latency, no network, free)
    return parse_user_intent(text)
