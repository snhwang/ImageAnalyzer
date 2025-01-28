from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, Any
import numpy as np
import SimpleITK as sitk
import logging
import traceback
import base64
from ..utils.image_processing import register_images

router = APIRouter(prefix="/api/registration", tags=["registration"])
logger = logging.getLogger(__name__)

@router.post("/")
async def register_images_endpoint(request_data: Dict[str, Any]):
    try:
        logger.info("Starting image registration process")

        # Extract and validate data from request
        if 'fixed_image' not in request_data or 'moving_image' not in request_data:
            raise HTTPException(status_code=400, detail="Missing fixed or moving image data")

        fixed_data = request_data["fixed_image"]
        moving_data = request_data["moving_image"]

        # Get dimensions from metadata
        fixed_width, fixed_height = fixed_data["metadata"]["dimensions"]
        moving_width, moving_height = moving_data["metadata"]["dimensions"]

        # Process each slice for fixed image
        fixed_slices = []
        for slice_data in fixed_data["data"]:
            try:
                binary_data = base64.b64decode(slice_data)
                pixels = np.frombuffer(binary_data, dtype=np.float32)
                slice_array = pixels.reshape((fixed_height, fixed_width))
                fixed_slices.append(slice_array)
            except Exception as e:
                logger.error(f"Error processing fixed image slice: {str(e)}")
                raise

        # Process each slice for moving image
        moving_slices = []
        for slice_data in moving_data["data"]:
            try:
                binary_data = base64.b64decode(slice_data)
                pixels = np.frombuffer(binary_data, dtype=np.float32)
                slice_array = pixels.reshape((moving_height, moving_width))
                moving_slices.append(slice_array)
            except Exception as e:
                logger.error(f"Error processing moving image slice: {str(e)}")
                raise

        # Convert to 3D numpy arrays
        fixed_array = np.stack(fixed_slices)
        moving_array = np.stack(moving_slices)

        # Convert to SimpleITK images for registration
        fixed_image = sitk.GetImageFromArray(fixed_array)
        moving_image = sitk.GetImageFromArray(moving_array)

        # Process registration
        registered_array = register_images(fixed_array, moving_array, fixed_image, moving_image)

        # Convert registered results back to base64
        registered_data = []
        for i in range(registered_array.shape[0]):
            slice_data = registered_array[i].astype(np.float32)
            encoded_bytes = base64.b64encode(slice_data.tobytes())
            registered_data.append(encoded_bytes.decode('utf-8'))

        logger.info("Registration completed successfully")

        return JSONResponse({
            "success": True,
            "data": registered_data,
            "metadata": {
                "dimensions": [int(fixed_width), int(fixed_height)],
                "min_value": float(np.min(registered_array)),
                "max_value": float(np.max(registered_array))
            }
        })

    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        logger.error(traceback.format_exc())
        return JSONResponse({
            "success": False,
            "error": str(e),
            "detail": "Registration failed"
        }, status_code=500)