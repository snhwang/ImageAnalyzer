from fastapi import APIRouter, HTTPException
import numpy as np
import logging
from app.utils.image_processing import apply_window_level

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory storage for images
# Example structure: {image_id: {"data": np_array, "normalized_slices": list, "window_center": int, "window_width": int}}
image_storage = {}


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
