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
from PIL import Image
import io
import base64

# Initialize app
app = FastAPI(title="Medical Image Viewer")

# Set up upload directory
UPLOAD_DIR = Path("app/static/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.mount("/images", StaticFiles(directory="images"), name="images")

# Configure CORS
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
    """Process medical image files (DICOM, NIfTI) and return image data and metadata"""
    ext = file_path.suffix.lower()

    try:
        if ext == '.dcm':
            # Handle DICOM
            ds = pydicom.dcmread(str(file_path))
            img_array = ds.pixel_array.astype(np.float32)
            metadata = {
                'total_slices': 1,
                'dimensions': [int(ds.Rows), int(ds.Columns)],
                'type': 'dicom',
                'min_value': float(np.min(img_array)),
                'max_value': float(np.max(img_array))
            }
            return img_array, metadata

        elif ext in ['.nii', '.gz']:
            # Handle NIfTI
            img = nib.load(str(file_path))
            img_array = img.get_fdata().astype(np.float32)
            metadata = {
                'total_slices': img_array.shape[2] if len(img_array.shape) > 2 else 1,
                'dimensions': [img_array.shape[0], img_array.shape[1]],
                'type': 'nifti',
                'min_value': float(np.min(img_array)),
                'max_value': float(np.max(img_array))
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
                'max_value': float(np.max(img_array))
            }

    except Exception as e:
        print(f"Error processing medical image: {str(e)}")
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

            # Add debug information
            print(f"Image array shape: {img_array.shape}")
            print(f"Min value: {np.min(img_array)}, Max value: {np.max(img_array)}")
            print(f"Sample values: {img_array.flatten()[:10]}")

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
            })
        else:
            return JSONResponse({
                "success": False,
                "message": "Failed to process image"
            }, status_code=500)

    except Exception as e:
        print(f"Upload error: {str(e)}")
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