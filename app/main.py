import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

from fastapi import FastAPI, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from app.routes import session, upload, image, directory, image_registration
import nibabel as nib
import pydicom
import numpy as np
from pathlib import Path
import os
from PIL import Image
import io
import base64

# Initialize app with increased limits and timeouts
app = FastAPI(
    title="Medical Image Viewer",
    description="A cutting-edge medical image viewing and analysis platform",
    version="1.0.0"
)

# Set up upload directory
UPLOAD_DIR = Path("images/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.mount("/images", StaticFiles(directory="images"), name="images")

# Configure CORS with increased timeouts
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=3600,  # Cache preflight requests
)

templates = Jinja2Templates(directory="app/templates")

def process_medical_image(file_path):
    """Process medical image files (DICOM, NIfTI) and return image data and metadata"""
    ext = file_path.suffix.lower()

    try:
        if ext == '.dcm':
            # Handle DICOM
            ds = pydicom.dcmread(str(file_path))
            img_array = ds.pixel_array.astype(np.float32)
            
            # Extract voxel dimensions from DICOM tags
            voxel_width = float(ds.PixelSpacing[0]) if hasattr(ds, 'PixelSpacing') else 1.0
            voxel_height = float(ds.PixelSpacing[1]) if hasattr(ds, 'PixelSpacing') else 1.0
            voxel_depth = float(ds.SliceThickness) if hasattr(ds, 'SliceThickness') else 1.0
            
            metadata = {
                'total_slices': 1,
                'dimensions': [int(ds.Rows), int(ds.Columns)],
                'type': 'dicom',
                'min_value': float(np.min(img_array)),
                'max_value': float(np.max(img_array)),
                'voxel_dimensions': [voxel_width, voxel_height, voxel_depth]
            }
            return img_array, metadata

        elif ext in ['.nii', '.gz']:
            # Handle NIfTI
            img = nib.load(str(file_path))
            img_array = img.get_fdata().astype(np.float32)
            
            # Extract voxel dimensions from NIfTI header
            voxel_dims = img.header.get_zooms()
            voxel_width = float(voxel_dims[0])
            voxel_height = float(voxel_dims[1])
            voxel_depth = float(voxel_dims[2]) if len(voxel_dims) > 2 else 1.0
            
            metadata = {
                'total_slices': img_array.shape[2] if len(img_array.shape) > 2 else 1,
                'dimensions': [img_array.shape[0], img_array.shape[1]],
                'type': 'nifti',
                'min_value': float(np.min(img_array)),
                'max_value': float(np.max(img_array)),
                'voxel_dimensions': [voxel_width, voxel_height, voxel_depth]
            }
            return img_array, metadata

        else:
            # Regular image file
            img = Image.open(file_path)
            img_array = np.array(img, dtype=np.float32)
            return img_array, {
                'total_slices': 1,
                'dimensions': [img_array.shape[0], img_array.shape[1]],
                'type': 'standard',
                'min_value': float(np.min(img_array)),
                'max_value': float(np.max(img_array)),
                'voxel_dimensions': [1.0, 1.0, 1.0]  # Default 1mm for standard images
            }

    except Exception as e:
        logging.error(f"Error processing medical image: {str(e)}")
        return None, None

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

        # Process the medical image and get data + metadata
        img_array, metadata = process_medical_image(file_path)

        if img_array is not None and metadata is not None:
            # Ensure the array is in float32 format
            img_array = img_array.astype(np.float32)

            # For 3D volumes, encode each slice
            if len(img_array.shape) > 2:
                encoded_slices = []
                for i in range(img_array.shape[2]):
                    slice_data = img_array[:, :, i].tobytes()
                    encoded_slice = base64.b64encode(slice_data).decode('utf-8')
                    encoded_slices.append(encoded_slice)
                response_data = encoded_slices
            else:
                # For 2D images, encode the single image
                encoded_data = base64.b64encode(img_array.tobytes()).decode('utf-8')
                response_data = [encoded_data]

            return JSONResponse({
                "success": True,
                "data": response_data,
                "metadata": metadata,
                "dtype": str(img_array.dtype),
                "debug": {
                    "shape": img_array.shape,
                    "min": float(np.min(img_array)),
                    "max": float(np.max(img_array)),
                    "sample": [float(x) for x in img_array.flatten()[:10]]
                }
            }, headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            })
        else:
            return JSONResponse({
                "success": False,
                "message": "Failed to process image"
            }, status_code=500)

    except Exception as e:
        logging.error(f"Upload error: {str(e)}")
        return JSONResponse({
            "success": False,
            "message": str(e)
        }, status_code=500)

# Include routers with explicit prefixes
app.include_router(session.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(image.router)  # Already has prefix="/api" in router definition
app.include_router(directory.router, prefix="/api")
app.include_router(image_registration.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=5000, reload=True)