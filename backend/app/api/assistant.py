from fastapi import APIRouter
from backend.app.models.event import AssistantRequest, AssistantResponse
from backend.app.services.dialog_manager import DialogManager, SESSION_CONTEXT

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


@router.post("/chat", response_model=AssistantResponse)
async def assistant_chat_endpoint(req: AssistantRequest):
    return await DialogManager.process_user_message(
        message=req.message,
        session_id=req.session_id or "default",
    )


@router.post("/reset-session")
def reset_session_endpoint(session_id: str = "default"):
    if session_id in SESSION_CONTEXT:
        del SESSION_CONTEXT[session_id]
    return {"status": "session_reset", "session_id": session_id}
