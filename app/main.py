from fastapi import FastAPI, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from app.routes import session, upload, image, directory
from app.config import CORS_ORIGINS, CORS_ALLOW_CREDENTIALS, CORS_ALLOW_METHODS, CORS_ALLOW_HEADERS, LOGGING_LEVEL, LOG_FORMAT
import os
from pathlib import Path

# Initialize app
app = FastAPI(title="Medical Image Viewer")

# Set up upload directory
UPLOAD_DIR = Path("app/static/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.mount("/images", StaticFiles(directory="images"), name="images")

# Configure CORS with more permissive settings for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # More permissive for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware for cookies
@app.middleware("http")
async def add_cookie_headers(request, call_next):
    response = await call_next(request)
    if "set-cookie" in response.headers:
        cookie = response.headers["set-cookie"]
        if "SameSite" not in cookie:
            response.headers["set-cookie"] = cookie + "; SameSite=None; Secure"
    return response

# Set up templates
templates = Jinja2Templates(directory="app/templates")

# Root endpoint to render index.html
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# File upload endpoint
@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        file_path = UPLOAD_DIR / file.filename

        with open(file_path, "wb") as f:
            f.write(contents)

        return JSONResponse({
            "success": True,
            "url": f"/static/uploads/{file.filename}",
            "filename": file.filename
        })
    except Exception as e:
        return JSONResponse({
            "success": False,
            "message": str(e)
        }, status_code=500)

# Include routes
app.include_router(session.router)
app.include_router(upload.router)
app.include_router(image.router)
app.include_router(directory.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=5000, reload=True)