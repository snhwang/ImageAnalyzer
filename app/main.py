from fastapi import FastAPI, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.templating import Jinja2Templates
from app.routes import session, upload, image, directory
import nibabel as nib
import pydicom
import numpy as np
from pathlib import Path
import os
from PIL import Image
import io

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

def normalize_image(image_array):
    """Normalize image array to 0-255 range"""
    min_val = np.min(image_array)
    max_val = np.max(image_array)
    if max_val == min_val:
        return np.zeros_like(image_array)
    return ((image_array - min_val) / (max_val - min_val) * 255).astype(np.uint8)

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

@app.get("/slice/{filename}/{slice_number}")
async def get_slice(filename: str, slice_number: int):
    try:
        file_path = UPLOAD_DIR / filename
        if not file_path.exists():
            return JSONResponse({"error": "File not found"}, status_code=404)

        ext = file_path.suffix.lower()
        img_array = None

        if ext == '.dcm':
            ds = pydicom.dcmread(str(file_path))
            img_array = ds.pixel_array
        elif ext in ['.nii', '.gz']:
            img = nib.load(str(file_path))
            img_array = img.get_fdata()
            if len(img_array.shape) > 2:
                img_array = img_array[:, :, slice_number]

        if img_array is not None:
            # Normalize and convert to 8-bit
            img_array = normalize_image(img_array)

            # Convert to PIL Image
            image = Image.fromarray(img_array)

            # Save to bytes
            img_byte_arr = io.BytesIO()
            image.save(img_byte_arr, format='PNG')
            img_byte_arr = img_byte_arr.getvalue()

            return Response(content=img_byte_arr, media_type="image/png")

        return JSONResponse({"error": "Invalid image format"}, status_code=400)

    except Exception as e:
        print(f"Error serving slice: {str(e)}")
        return JSONResponse({"error": str(e)}, status_code=500)

# Include routes
app.include_router(session.router)
app.include_router(upload.router)
app.include_router(image.router)
app.include_router(directory.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=5000, reload=True)