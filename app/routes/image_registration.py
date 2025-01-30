from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, Any
import numpy as np
import SimpleITK as sitk
import logging
import traceback
import base64
from ..utils.image_processing import register_images

router = APIRouter(tags=["registration"])
logger = logging.getLogger(__name__)

@router.post("/api/registration")
async def register_images_endpoint(request_data: Dict[str, Any]):
    try:
        logger.info("Starting image registration process")

        # Extract and validate data from request
        if 'fixed_image' not in request_data or 'moving_image' not in request_data:
            raise HTTPException(status_code=400, detail="Missing fixed or moving image data")

        fixed_data = request_data["fixed_image"]
        moving_data = request_data["moving_image"]

        # Get dimensions and metadata from request
        fixed_metadata = fixed_data["metadata"]
        moving_metadata = moving_data["metadata"]

        fixed_width, fixed_height = fixed_metadata["dimensions"]
        moving_width, moving_height = moving_metadata["dimensions"]

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

        # Get voxel dimensions from metadata
        fixed_voxel_dims = fixed_metadata.get('voxel_dimensions', [1.0, 1.0, 1.0])
        moving_voxel_dims = moving_metadata.get('voxel_dimensions', [1.0, 1.0, 1.0])

        # Update metadata with voxel dimensions as spacing
        fixed_metadata['spacing'] = fixed_voxel_dims
        moving_metadata['spacing'] = moving_voxel_dims

        logger.info(f"Fixed image voxel dimensions: {fixed_voxel_dims}")
        logger.info(f"Moving image voxel dimensions: {moving_voxel_dims}")

        # Convert to SimpleITK images for registration
        fixed_image = sitk.GetImageFromArray(fixed_array)
        moving_image = sitk.GetImageFromArray(moving_array)

        # Set physical spacing for both images
        fixed_image.SetSpacing(fixed_voxel_dims)
        moving_image.SetSpacing(moving_voxel_dims)

        # Process registration with metadata
        registered_array = register_images(
            fixed_array, 
            moving_array, 
            fixed_image, 
            moving_image,
            fixed_metadata,
            moving_metadata
        )

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
                "voxel_dimensions": fixed_voxel_dims,  # Include voxel dimensions in response
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