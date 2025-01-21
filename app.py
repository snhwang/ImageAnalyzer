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
os.chmod(UPLOAD_FOLDER, 0o777)

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.get("/")
async def home(request: Request):
    """Serve the main application page"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Handle file uploads with proper error handling"""
    try:
        if not file:
            raise HTTPException(status_code=400, detail="No file uploaded")

        if not allowed_file(file.filename):
            raise HTTPException(status_code=400, detail="File type not allowed")

        # Save the file
        file_path = UPLOAD_FOLDER / file.filename
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Set proper permissions
        os.chmod(file_path, 0o666)

        return JSONResponse({
            "success": True,
            "url": f"/static/uploads/{file.filename}",
            "filename": file.filename
        })

    except Exception as e:
        return JSONResponse({
            "success": False,
            "message": "Upload failed",
            "error": str(e)
        }, status_code=500)

@app.get("/static/uploads/{filename}")
async def serve_upload(filename: str):
    """Serve uploaded files with proper error handling"""
    file_path = UPLOAD_FOLDER / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)

# Create necessary directories on startup
os.makedirs("app/static/js", exist_ok=True)
os.makedirs("app/static/uploads", exist_ok=True)
os.chmod("app/static/uploads", 0o777)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)