from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
import numpy as np
import logging
from app.utils.image_processing import apply_window_level
from typing import Dict, Any
import traceback

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory storage for images
image_storage = {}

@router.post("/rotate180")
async def rotate_180(request_data: Dict[str, Any]):
    """Rotate an image 180 degrees."""
    try:
        logger.info("Starting 180-degree rotation")

        if "image_data" not in request_data:
            raise HTTPException(status_code=400, detail="Missing image data")

        image_data = request_data["image_data"]
        metadata = request_data["metadata"]

        # Convert string data to numpy array
        width, height = metadata['dimensions'][:2]
        depth = len(image_data)

        # Initialize 3D array
        image_array = np.zeros((depth, height, width), dtype=np.float32)

        # Decode each slice
        for z, slice_data in enumerate(image_data):
            binary_data = np.frombuffer(slice_data.encode('utf-8'), dtype=np.float32)
            image_array[z] = binary_data.reshape((height, width))

        # Rotate 180 degrees (flip both axes)
        rotated_array = np.rot90(image_array, k=2, axes=(1, 2))

        # Encode result back to string format
        rotated_data = []
        for z in range(rotated_array.shape[0]):
            slice_data = rotated_array[z].astype(np.float32)
            rotated_data.append(slice_data.tobytes().decode('utf-8'))

        return JSONResponse({
            "success": True,
            "data": rotated_data,
            "metadata": {
                "dimensions": [int(d) for d in rotated_array.shape],
                "min_value": float(np.min(rotated_array)),
                "max_value": float(np.max(rotated_array))
            }
        })

    except Exception as e:
        logger.error(f"Rotation error: {str(e)}")
        logger.error(traceback.format_exc())
        return JSONResponse({
            "success": False,
            "error": str(e),
            "detail": "Rotation failed"
        }, status_code=500)

@router.get("/slice/{slice_number}")
async def get_slice(slice_number: int, image_id: str):
    """Retrieve a specific slice of a 3D image."""
    try:
        if image_id not in image_storage:
            raise HTTPException(status_code=404, detail="Image not found")

        image_data = image_storage[image_id]
        slices = image_data.get("normalized_slices")
        if slices is None or slice_number < 0 or slice_number >= len(slices):
            raise HTTPException(status_code=400, detail="Invalid slice number")

        slice_data = slices[slice_number]

        # Convert slice to a base64 image
        import io
        from PIL import Image
        import base64

        img_byte_arr = io.BytesIO()
        Image.fromarray(slice_data).save(img_byte_arr, format="PNG")
        img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode("utf-8")

        return {
            "status": "success",
            "slice": f"data:image/png;base64,{img_base64}",
        }

    except Exception as e:
        logger.error(f"Error retrieving slice: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the slice")


@router.post("/window-level")
async def update_window_level(image_id: str, window_center: int, window_width: int):
    """Apply window-level adjustments to an image."""
    try:
        if image_id not in image_storage:
            raise HTTPException(status_code=404, detail="Image not found")

        image_data = image_storage[image_id]
        data = image_data.get("data")
        if data is None:
            raise HTTPException(status_code=404, detail="Image data not found")

        updated_slices = []
        for slice_data in data:
            updated_slice = apply_window_level(slice_data, window_center, window_width)
            updated_slices.append(updated_slice)

        # Update normalized slices in storage
        image_storage[image_id]["normalized_slices"] = updated_slices
        image_storage[image_id]["window_center"] = window_center
        image_storage[image_id]["window_width"] = window_width

        return {"status": "success", "message": "Window-level updated successfully"}
    except Exception as e:
        logger.error(f"Error updating window-level: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while updating window-level")


@router.post("/rotate")
async def rotate_image(image_id: str, angle: int):
    """Rotate an image by a specified angle."""
    try:
        if image_id not in image_storage:
            raise HTTPException(status_code=404, detail="Image not found")

        image_data = image_storage[image_id]
        data = image_data.get("data")
        if data is None:
            raise HTTPException(status_code=404, detail="Image data not found")

        # Rotate each slice
        rotated_slices = []
        for slice_data in data:
            rotated_slice = np.rot90(slice_data, k=angle // 90)
            rotated_slices.append(rotated_slice)

        # Update storage
        image_storage[image_id]["data"] = rotated_slices
        image_storage[image_id]["normalized_slices"] = rotated_slices

        return {"status": "success", "message": "Image rotated successfully"}
    except Exception as e:
        logger.error(f"Error rotating image: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while rotating the image")