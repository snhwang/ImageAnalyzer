from fastapi import APIRouter, Response
import uuid

router = APIRouter()

# Session store
SESSION_STORE = {}

@router.get("/set-session")
async def set_session(response: Response):
    # Generate session ID
    session_id = str(uuid.uuid4())
    SESSION_STORE[session_id] = {"user_id": 123, "preferences": {"theme": "dark"}}

    # Set cookie
    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,
        secure=True,
        samesite="none"
    )
    return {"message": "Session created", "session_id": session_id}
