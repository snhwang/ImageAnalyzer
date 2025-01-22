from fastapi import APIRouter
from .upload import router as upload_router
from .directory import router as directory_router
from .image import router as image_router
from .session import router as session_router

# Create main router
router = APIRouter()

# Include sub-routers with proper prefixes
router.include_router(directory_router, prefix="/api/directory", tags=["directory"])
router.include_router(upload_router, prefix="/api/upload", tags=["upload"])
router.include_router(image_router, prefix="/api/image", tags=["image"])
router.include_router(session_router, prefix="/api/session", tags=["session"])