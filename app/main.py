from fastapi import FastAPI, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from app.routes import session, upload, image, directory
import nibabel as nib
import pydicom
import numpy as np
from pathlib import Path
import os

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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set up templates
templates = Jinja2Templates(directory="app/templates")

def process_medical_image(file_path):
    """Process medical image files (DICOM, NIfTI) and return metadata"""
    ext = file_path.suffix.lower()

    try:
        if ext == '.dcm':
            # Handle DICOM
            ds = pydicom.dcmread(str(file_path))
            return {
                'total_slices': 1,  # Single DICOM file
                'dimensions': [int(ds.Rows), int(ds.Columns)],
                'type': 'dicom'
            }
        elif ext in ['.nii', '.gz']:
            # Handle NIfTI
            img = nib.load(str(file_path))
            shape = img.shape
            return {
                'total_slices': shape[2] if len(shape) > 2 else 1,
                'dimensions': [shape[0], shape[1]],
                'type': 'nifti'
            }
        else:
            # Regular image file
            return {
                'total_slices': 1,
                'dimensions': None,
                'type': 'standard'
            }
    except Exception as e:
        print(f"Error processing medical image: {str(e)}")
        return {
            'total_slices': 1,
            'dimensions': None,
            'type': 'unknown'
        }

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        file_path = UPLOAD_DIR / file.filename

        # Save the uploaded file
        with open(file_path, "wb") as f:
            f.write(contents)

        # Process the medical image and get metadata
        metadata = process_medical_image(file_path)

        return JSONResponse({
            "success": True,
            "url": f"/static/uploads/{file.filename}",
            "filename": file.filename,
            "metadata": metadata
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