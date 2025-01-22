from fastapi import APIRouter, HTTPException, Request
import os
import logging
from app.utils.file_handling import process_file
import nibabel as nib
import pydicom
import numpy as np
from PIL import Image
from app.utils.image_processing import calculate_optimal_window_settings, precompute_normalized_slices
import base64

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/directory")
async def list_directory(path: str = "images"):
    """List the contents of a given directory."""
    try:
        logger.info(f"Listing directory: {path}")

        # Clean and normalize path
        path = path.replace('\\', '/')
        if not path.startswith('images'):
            path = 'images'

        # Get absolute paths
        base_path = os.path.abspath(os.getcwd())
        target_path = os.path.join(base_path, path)
        logger.info(f"Resolved path: {target_path}")

        # Create images directory if it doesn't exist
        images_dir = os.path.join(base_path, 'images')
        if not os.path.exists(images_dir):
            os.makedirs(images_dir)
            logger.info(f"Created images directory at: {images_dir}")

        # If requested path doesn't exist or isn't a directory, default to images directory
        if not os.path.exists(target_path) or not os.path.isdir(target_path):
            target_path = images_dir
            logger.info(f"Using default images directory: {target_path}")

        # List directory contents
        files = []
        directories = []

        try:
            for item in sorted(os.listdir(target_path)):
                item_path = os.path.join(target_path, item)

                # Skip hidden files and directories
                if item.startswith('.'):
                    continue

                if os.path.isdir(item_path):
                    directories.append(item)
                    logger.info(f"Added directory: {item}")
                else:
                    # Only include supported image formats
                    if any(item.lower().endswith(ext) for ext in ['.nii', '.nii.gz', '.dcm', '.jpg', '.jpeg', '.png', '.bmp']):
                        files.append(item)
                        logger.info(f"Added file: {item}")

            return {
                "success": True,
                "files": files,
                "directories": directories
            }

        except Exception as e:
            logger.error(f"Error listing directory contents: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Error listing directory contents: {str(e)}"
            )

    except Exception as e:
        logger.error(f"Error in list_directory: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error in list_directory: {str(e)}"
        )

@router.get("/load")
async def load_remote_file(path: str):
    """Load a file from the server."""
    try:
        logger.info(f"Loading file: {path}")

        # Clean and normalize path
        path = path.replace('\\', '/')
        if not path.startswith('images/'):
            path = f'images/{path}'

        # Get absolute paths
        base_path = os.path.abspath(os.getcwd())
        file_path = os.path.join(base_path, path)
        logger.info(f"Full path resolved to: {file_path}")

        # Verify file exists and is a file
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {path}")

        if not os.path.isfile(file_path):
            raise HTTPException(status_code=400, detail="Path is not a file")

        # Process file based on extension
        file_ext = os.path.splitext(file_path)[1].lower()
        if file_ext == '.gz' and file_path.lower().endswith('.nii.gz'):
            file_ext = '.nii.gz'

        supported_extensions = {'.nii', '.nii.gz', '.dcm', '.jpg', '.jpeg', '.png', '.bmp'}
        if not any(file_path.lower().endswith(ext) for ext in supported_extensions):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Supported extensions: {', '.join(supported_extensions)}"
            )

        try:
            data = None
            dimensions = None

            # Process different file types
            if file_ext in ['.nii', '.nii.gz']:
                logger.info("Processing NIfTI file")
                img = nib.load(file_path)
                data = img.get_fdata()
                data = np.array(data, dtype=np.float32)
                dimensions = data.shape[:2]
                if len(data.shape) > 3:
                    data = data[..., 0]  # Take first time point for 4D data
                img.uncache()

            elif file_ext == '.dcm':
                logger.info("Processing DICOM file")
                dcm = pydicom.dcmread(file_path)
                data = dcm.pixel_array.astype(np.float32)
                dimensions = data.shape[:2]

            else:  # Standard image formats
                logger.info("Processing standard image file")
                with Image.open(file_path) as img:
                    if img.mode in ['RGB', 'RGBA']:
                        img = img.convert('L')
                    data = np.array(img, dtype=np.float32)
                    dimensions = data.shape[:2]

            if data is None:
                raise HTTPException(status_code=400, detail="Failed to load image data")

            # Calculate window settings and normalize data
            min_val = float(np.min(data))
            max_val = float(np.max(data))

            # Prepare slices if 3D, otherwise wrap 2D image in a list
            if len(data.shape) == 3:
                slices = [data[:, :, i] for i in range(data.shape[2])]
            else:
                slices = [data]

            # Convert to base64
            encoded_slices = []
            for slice_data in slices:
                # Normalize to 0-255 range for visualization
                normalized = ((slice_data - min_val) / (max_val - min_val) * 255).astype(np.uint8)
                slice_bytes = normalized.tobytes()
                encoded = base64.b64encode(slice_bytes).decode('utf-8')
                encoded_slices.append(encoded)

            logger.info(f"Successfully processed image. Shape: {data.shape}")
            return {
                "success": True,
                "data": encoded_slices,
                "metadata": {
                    "dimensions": dimensions,
                    "min_value": min_val,
                    "max_value": max_val
                }
            }

        except HTTPException:
            raise
        except Exception as e:
            msg = f"Error processing image: {str(e)}"
            logger.error(msg, exc_info=True)
            raise HTTPException(status_code=500, detail=msg)

    except HTTPException:
        raise
    except Exception as e:
        msg = f"Unexpected error: {str(e)}"
        logger.error(msg, exc_info=True)
        raise HTTPException(status_code=500, detail=msg)