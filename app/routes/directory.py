from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
import os
import logging
from app.utils.file_handling import process_file
import nibabel as nib
import pydicom
import numpy as np
from PIL import Image
from app.utils.image_processing import calculate_optimal_window_settings, precompute_normalized_slices
from app.routes.image import image_storage
import io
import base64
import uuid

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/list-directory")
async def list_directory(request: Request):
    """List the contents of a given directory."""
    try:
        data = await request.json()
        url = data.get('url', '')

        # Default to images directory if no URL provided
        if not url:
            url = 'images'

        # Ensure the directory path starts with 'images'
        if not url.startswith('images'):
            url = 'images'

        # Validate the directory path
        if '..' in url:  # Prevent directory traversal
            raise HTTPException(status_code=400, detail="Invalid directory path")

        # Get absolute paths
        base_path = os.path.abspath(os.getcwd())
        path = os.path.join(base_path, url)
        logger.info(f"Listing directory at path: {path}")

        # Create images directory if it doesn't exist
        images_dir = os.path.join(base_path, 'images')
        if not os.path.exists(images_dir):
            os.makedirs(images_dir)
            logger.info(f"Created images directory at: {images_dir}")

        # If requested path doesn't exist, default to images directory
        if not os.path.exists(path):
            path = images_dir
            logger.info(f"Path not found, defaulting to: {path}")

        if not os.path.isdir(path):
            raise HTTPException(status_code=400, detail="Path is not a directory")

        # List directory contents
        files = []
        directories = []

        try:
            for item in sorted(os.listdir(path)):
                item_path = os.path.join(path, item)
                relative_path = os.path.relpath(item_path, base_path)

                # Skip hidden files and directories
                if item.startswith('.'):
                    continue

                if os.path.isdir(item_path):
                    directories.append({
                        "name": item,
                        "url": relative_path.replace("\\", "/")
                    })
                else:
                    # Only include supported image formats
                    if any(item.lower().endswith(ext) for ext in ['.nii', '.nii.gz', '.dcm', '.jpg', '.jpeg', '.png', '.bmp']):
                        files.append({
                            "name": item,
                            "url": relative_path.replace("\\", "/")
                        })

            logger.info(f"Listed directory {path}: {len(files)} files, {len(directories)} directories")
            return {
                "status": "success",
                "files": files,
                "directories": directories,
                "current_path": url
            }

        except Exception as e:
            logger.error(f"Error listing directory contents: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error listing directory contents: {str(e)}")

    except Exception as e:
        logger.error(f"Error in list_directory: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/import-from-url")
async def import_from_url(path: str = Form(...)):
    try:
        logger.info(f"Received import request for path: {path}")

        # Get absolute paths
        base_path = os.path.abspath(os.getcwd())

        # Ensure the path starts with 'images'
        if not path.startswith('images/'):
            path = f'images/{path}'

        # Normalize path and prevent directory traversal
        path = os.path.normpath(path).replace('\\', '/')
        if '..' in path:
            path = 'images'

        full_path = os.path.join(base_path, path)
        logger.info(f"Processing file: {full_path}")

        if not os.path.exists(full_path):
            logger.error(f"File not found: {full_path}")
            raise HTTPException(status_code=404, detail=f"File not found: {path}")

        if not os.path.isfile(full_path):
            logger.error(f"Not a file: {full_path}")
            raise HTTPException(status_code=400, detail="Not a file")

        # Check file extension
        file_ext = os.path.splitext(full_path)[1].lower()
        if file_ext == '.gz' and full_path.lower().endswith('.nii.gz'):
            file_ext = '.nii.gz'

        supported_extensions = {'.nii', '.nii.gz', '.dcm', '.jpg', '.jpeg', '.png', '.bmp'}
        if not any(full_path.lower().endswith(ext) for ext in supported_extensions):
            logger.error(f"Unsupported file type: {file_ext}")
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Supported extensions: {', '.join(supported_extensions)}"
            )

        try:
            data = None
            total_slices = 1

            # Process different file types
            if file_ext in ['.nii', '.nii.gz']:
                logger.info("Loading NIfTI file")
                img = nib.load(full_path)
                data = img.get_fdata()
                data = np.array(data, dtype=np.float32)
                if len(data.shape) == 3:
                    total_slices = data.shape[2]
                img.uncache()
                del img

            elif file_ext == '.dcm':
                logger.info("Loading DICOM file")
                dcm = pydicom.dcmread(full_path)
                data = dcm.pixel_array.astype(np.float32)
                del dcm

            else:
                logger.info("Loading standard image file")
                with Image.open(full_path) as img:
                    data = np.array(img, dtype=np.float32)
                    if len(data.shape) == 3 and data.shape[2] in [3, 4]:
                        data = np.mean(data, axis=2)

            if data is None:
                raise HTTPException(status_code=400, detail="Failed to load image data")

            logger.info(f"Image loaded successfully. Shape: {data.shape}, Type: {data.dtype}")

            # Calculate window settings
            window_width, window_center = calculate_optimal_window_settings(data)
            normalized_slices, data_min, data_max = precompute_normalized_slices(data)

            logger.info(f"Processed {len(normalized_slices)} slices")

            # Convert slices to base64
            all_slices = []
            for i, normalized in enumerate(normalized_slices):
                img_byte_arr = io.BytesIO()
                Image.fromarray(normalized).save(img_byte_arr, format='PNG', optimize=True)
                img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
                all_slices.append(f"data:image/png;base64,{img_base64}")
                logger.info(f"Encoded slice {i+1}/{len(normalized_slices)}")

            # Store in image storage
            image_id = str(uuid.uuid4())
            image_storage[image_id] = {
                'data': data,
                'window_width': float(window_width),
                'window_center': float(window_center),
                'total_slices': total_slices,
                'data_min': float(data_min),
                'data_max': float(data_max),
                'normalized_slices': normalized_slices
            }

            logger.info(f"Successfully processed image. ID: {image_id}")
            return {
                "status": "success",
                "slices": all_slices,
                "image_id": image_id,
                "total_slices": total_slices,
                "window_width": float(window_width),
                "window_center": float(window_center)
            }

        except Exception as e:
            logger.error(f"Error processing image: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))