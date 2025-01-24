from fastapi import APIRouter, HTTPException
from typing import Dict, Any
import numpy as np
import base64
import struct
from ..utils.image_processing import register_images
import SimpleITK as sitk
import logging
from fastapi.responses import JSONResponse
import traceback
import gc

router = APIRouter(prefix="/api/registration", tags=["registration"])
logger = logging.getLogger(__name__)

def decode_base64_image(image_data: list[str], metadata: Dict[str, Any]) -> np.ndarray:
    """Decode base64 encoded image data back to numpy array"""
    try:
        height = metadata['dimensions'][1] if isinstance(metadata['dimensions'], list) else metadata['dimensions']
        width = metadata['dimensions'][0] if isinstance(metadata['dimensions'], list) else metadata['dimensions']
        depth = len(image_data)

        image_array = np.zeros((depth, height, width), dtype=np.float32)

        for z, slice_data in enumerate(image_data):
            binary_data = base64.b64decode(slice_data)
            float_data = [struct.unpack('f', binary_data[i:i+4])[0] 
                         for i in range(0, len(binary_data), 4)]
            image_array[z] = np.array(float_data).reshape((height, width))

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
            binary_data = struct.pack('f' * slice_data.size, *slice_data.flatten())
            encoded_slices.append(base64.b64encode(binary_data).decode('utf-8'))
        return encoded_slices
    except Exception as e:
        logger.error(f"Error encoding image data: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to encode image data: {str(e)}")

@router.post("/")
async def register_images_endpoint(request_data: Dict[str, Any]):
    try:
        logger.info("Starting image registration process")

        # Extract data from request
        if 'fixed_image' not in request_data or 'moving_image' not in request_data:
            raise HTTPException(status_code=400, detail="Missing fixed or moving image data")

        fixed_data = request_data["fixed_image"]
        moving_data = request_data["moving_image"]

        logger.info(f"Fixed image dimensions: {fixed_data.get('dimensions')}")
        logger.info(f"Moving image dimensions: {moving_data.get('dimensions')}")

        # Convert base64 image data to numpy arrays
        fixed_array = decode_base64_image(fixed_data["imageData"], fixed_data)
        moving_array = decode_base64_image(moving_data["imageData"], moving_data)

        logger.info(f"Arrays decoded - Fixed shape: {fixed_array.shape}, Moving shape: {moving_array.shape}")

        # Convert to SimpleITK images
        fixed_image = sitk.GetImageFromArray(fixed_array)
        moving_image = sitk.GetImageFromArray(moving_array)

        # Register images
        registered_array = register_images(
            fixed_array, moving_array,
            fixed_image, moving_image
        )

        # Clean up memory
        del fixed_array
        del moving_array
        gc.collect()

        # Prepare response
        registered_data = encode_numpy_to_base64(registered_array)

        logger.info("Registration completed successfully")
        return JSONResponse({
            "success": True,
            "data": registered_data,
            "metadata": {
                "dimensions": [fixed_data["dimensions"][0], 
                             fixed_data["dimensions"][1]],
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