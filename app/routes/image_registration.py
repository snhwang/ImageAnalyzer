from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, Any
import numpy as np
import SimpleITK as sitk
import logging
import traceback
from ..utils.image_processing import register_images

router = APIRouter(prefix="/api/registration", tags=["registration"])
logger = logging.getLogger(__name__)

def decode_base64_image(image_data: list[str], metadata: Dict[str, Any]) -> np.ndarray:
    """Decode base64 encoded image data back to numpy array"""
    try:
        width, height = metadata['dimensions'][:2]
        depth = len(image_data)

        # Initialize 3D array
        image_array = np.zeros((depth, height, width), dtype=np.float32)

        # Decode each slice
        for z, slice_data in enumerate(image_data):
            binary_data = np.frombuffer(slice_data.encode('utf-8'), dtype=np.float32)
            image_array[z] = binary_data.reshape((height, width))

        return image_array

    except Exception as e:
        logger.error(f"Error decoding image data: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=400, detail=f"Failed to decode image data: {str(e)}")

def encode_numpy_to_base64(image_array: np.ndarray) -> list[str]:
    """Encode numpy array to base64 strings per slice"""
    try:
        encoded_slices = []
        for z in range(image_array.shape[0]):
            slice_data = image_array[z].astype(np.float32)
            encoded_slices.append(slice_data.tobytes().decode('utf-8'))
        return encoded_slices
    except Exception as e:
        logger.error(f"Error encoding image data: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to encode image data: {str(e)}")

@router.post("/")
async def register_images_endpoint(request_data: Dict[str, Any]):
    try:
        logger.info("Starting image registration process")

        # Extract and validate data from request
        if 'fixed_image' not in request_data or 'moving_image' not in request_data:
            raise HTTPException(status_code=400, detail="Missing fixed or moving image data")

        fixed_data = request_data["fixed_image"]
        moving_data = request_data["moving_image"]

        # Convert base64 image data to numpy arrays
        fixed_array = decode_base64_image(fixed_data["data"], fixed_data["metadata"])
        moving_array = decode_base64_image(moving_data["data"], moving_data["metadata"])

        # Convert to SimpleITK images
        fixed_image = sitk.GetImageFromArray(fixed_array)
        moving_image = sitk.GetImageFromArray(moving_array)

        # Process registration
        registered_array = register_images(fixed_array, moving_array, fixed_image, moving_image)

        # Encode result
        registered_data = encode_numpy_to_base64(registered_array)

        return JSONResponse({
            "success": True,
            "data": registered_data,
            "metadata": {
                "dimensions": [int(d) for d in registered_array.shape],
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