from fastapi import APIRouter
from .upload import router as upload_router
from .directory import router as directory_router
from .image import router as image_router
from .session import router as session_router

# Create main router
router = APIRouter()

# Include sub-routers without prefixes since they're added in app.py
router.include_router(directory_router)
router.include_router(upload_router)
router.include_router(image_router)
router.include_router(session_router)