from fastapi import APIRouter, UploadFile, File, HTTPException, Response
from app.routes.image import image_storage
from app.utils.image_processing import normalize_data, precompute_normalized_slices
from app.utils.image_processing import calculate_optimal_window_settings
import nibabel as nib
import pydicom
from PIL import Image
import numpy as np
import io
import tempfile
import uuid
import os
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    temp_file = None
    try:
        # Validate file extension
        filename = file.filename.lower()
        valid_extensions = {'.nii', '.nii.gz', '.dcm', '.jpg', '.jpeg', '.png', '.bmp'}

        # Special handling for .nii.gz files
        if filename.endswith('.nii.gz'):
            suffix = '.nii.gz'
        else:
            suffix = os.path.splitext(filename)[1]

        if not any(filename.endswith(ext) for ext in valid_extensions):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Supported formats are: {', '.join(valid_extensions)}"
            )

        # Log file information
        logger.info(f"Receiving file: {filename}")

        # Create a temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)

        try:
            # Write the uploaded file content
            content = await file.read()
            if not content:
                raise HTTPException(status_code=400, detail="Empty file uploaded")

            temp_file.write(content)
            temp_file.flush()
            temp_file.close()

            image_id = str(uuid.uuid4())
            logger.info(f"Processing file with ID: {image_id}")

            data = None
            total_slices = 1

            # Process the file based on its type
            try:
                if suffix in ['.nii', '.gz']:
                    logger.info("Loading NIfTI file")
                    img = nib.load(temp_file.name)
                    data = img.get_fdata().astype(np.float32)
                    if len(data.shape) == 3:
                        total_slices = data.shape[2]
                    elif len(data.shape) == 4:
                        data = data[..., 0]  # Take first time point
                        total_slices = data.shape[2]
                    img.uncache()

                elif suffix == '.dcm':
                    logger.info("Loading DICOM file")
                    dcm = pydicom.dcmread(temp_file.name)
                    data = dcm.pixel_array.astype(np.float32)

                else:
                    logger.info("Loading standard image file")
                    img = Image.open(temp_file.name)
                    data = np.array(img, dtype=np.float32)
                    if len(data.shape) == 3 and data.shape[2] in [3, 4]:
                        data = np.mean(data, axis=2)  # Convert to grayscale
                    img.close()

                if data is None:
                    raise HTTPException(status_code=400, detail="Failed to load image data")

                # Calculate window settings
                window_width, window_center = calculate_optimal_window_settings(data)
                logger.info(f"Window settings - Width: {window_width}, Center: {window_center}")

                # Store raw data in memory
                image_storage[image_id] = {
                    'data': data,
                    'window_width': float(window_width),
                    'window_center': float(window_center),
                    'total_slices': total_slices,
                    'data_min': float(np.min(data)),
                    'data_max': float(np.max(data))
                }

                # Return metadata only - actual image data will be fetched via separate endpoint
                return {
                    "status": "success",
                    "image_id": image_id,
                    "total_slices": total_slices,
                    "window_width": float(window_width),
                    "window_center": float(window_center),
                    "dimensions": list(data.shape[:2])
                }

            except Exception as e:
                logger.error(f"Error processing file: {str(e)}", exc_info=True)
                raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")

        finally:
            if temp_file and os.path.exists(temp_file.name):
                try:
                    os.unlink(temp_file.name)
                    logger.info("Cleaned up temporary file")
                except Exception as e:
                    logger.error(f"Error cleaning up temp file: {str(e)}")

    except Exception as e:
        logger.error(f"Upload error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")

@router.get("/slice/{image_id}/{slice_num}")
async def get_slice(image_id: str, slice_num: int):
    """Get a specific slice of image data as raw bytes"""
    try:
        if image_id not in image_storage:
            raise HTTPException(status_code=404, detail="Image not found")

        image_data = image_storage[image_id]
        data = image_data['data']

        if slice_num >= image_data['total_slices']:
            raise HTTPException(status_code=400, detail="Invalid slice number")

        # Get the specific slice if 3D, or use the 2D image directly
        if len(data.shape) == 3:
            slice_data = data[:, :, slice_num]
        else:
            slice_data = data

        # Convert to bytes
        return Response(
            content=slice_data.tobytes(),
            media_type="application/octet-stream",
            headers={
                "X-Image-Shape": f"{slice_data.shape[0]},{slice_data.shape[1]}",
                "X-Image-Dtype": str(slice_data.dtype)
            }
        )

    except Exception as e:
        logger.error(f"Error retrieving slice: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error retrieving slice: {str(e)}")