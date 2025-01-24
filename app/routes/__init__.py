from fastapi import APIRouter
from .upload import router as upload_router
from .directory import router as directory_router
from .image import router as image_router
from .session import router as session_router
from .image_registration import router as registration_router

router = APIRouter()

router.include_router(directory_router, prefix="/api/directory", tags=["directory"])
router.include_router(image_router, prefix="/api/image", tags=["image"])
router.include_router(session_router, prefix="/api/session", tags=["session"])
router.include_router(upload_router, prefix="/api/upload", tags=["upload"])
router.include_router(registration_router, prefix="/register", tags=["registration"])