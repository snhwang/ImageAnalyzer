import os
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from pathlib import Path
from typing import Optional

# Create FastAPI app
app = FastAPI(
    title="Medical Image Viewer",
    description="A cutting-edge medical image viewing and analysis platform",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set up static files and templates
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# Set up upload folder with proper permissions
UPLOAD_FOLDER = Path("app/static/uploads")
ALLOWED_EXTENSIONS = {'nii', 'gz', 'dcm', 'jpg', 'png', 'bmp'}

# Create necessary directories
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs("images", exist_ok=True)
os.chmod(UPLOAD_FOLDER, 0o777)
os.chmod("images", 0o777)

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.get("/")
async def home(request: Request):
    """Serve the main application page"""
    return templates.TemplateResponse("index.html", {"request": request})

# Import routes after app initialization to avoid circular imports
from app.routes import directory, upload, image, session

# Include routes with proper prefixes
app.include_router(directory.router, prefix="/api/directory", tags=["directory"])
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(image.router, prefix="/api/image", tags=["image"])
app.include_router(session.router, prefix="/api/session", tags=["session"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)