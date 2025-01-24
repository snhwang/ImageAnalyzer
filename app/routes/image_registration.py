from fastapi import APIRouter, HTTPException
from typing import Dict, Any
import numpy as np
import base64
import struct
from ..utils.image_processing import register_images
import SimpleITK as sitk

router = APIRouter()

def decode_base64_image(image_data: list[str], metadata: Dict[str, Any]) -> np.ndarray:
    """Decode base64 encoded image data back to numpy array"""
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

def encode_numpy_to_base64(image_array: np.ndarray) -> list[str]:
    """Encode numpy array to base64 strings per slice"""
    encoded_slices = []
    for z in range(image_array.shape[0]):
        slice_data = image_array[z].astype(np.float32)
        binary_data = struct.pack('f' * slice_data.size, *slice_data.flatten())
        encoded_slices.append(base64.b64encode(binary_data).decode('utf-8'))
    return encoded_slices

@router.post("/register")
async def register_images_endpoint(request_data: Dict[str, Any]):
    try:
        # Extract data from request
        fixed_data = request_data["fixed_image"]
        moving_data = request_data["moving_image"]

        # Convert base64 image data to numpy arrays
        fixed_array = decode_base64_image(fixed_data["imageData"], fixed_data["metadata"])
        moving_array = decode_base64_image(moving_data["imageData"], moving_data["metadata"])

        # Convert to SimpleITK images
        fixed_image = sitk.GetImageFromArray(fixed_array)
        moving_image = sitk.GetImageFromArray(moving_array)

        # Register images
        registered_array = register_images(
            fixed_array, moving_array,
            fixed_image, moving_image
        )

        # Prepare response
        registered_data = encode_numpy_to_base64(registered_array)

        return {
            "success": True,
            "data": registered_data,
            "metadata": {
                "dimensions": [fixed_data["metadata"]["dimensions"][0], 
                             fixed_data["metadata"]["dimensions"][1]],
                "min_value": float(np.min(registered_array)),
                "max_value": float(np.max(registered_array))
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))