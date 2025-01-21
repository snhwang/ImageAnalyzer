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
        # Parse request body
        try:
            data = await request.json()
            url = data.get('url', '')
            logger.info(f"Received list directory request for URL: {url}")
        except Exception as e:
            logger.error(f"Error parsing request JSON: {str(e)}")
            url = ''

        # Default to images directory if no URL provided
        if not url:
            url = 'images'
            logger.info("Using default images directory")

        # Clean and normalize path
        url = url.replace('\\', '/')
        if not url.startswith('images'):
            url = 'images'

        # Get absolute paths
        base_path = os.path.abspath(os.getcwd())
        path = os.path.join(base_path, url)
        logger.info(f"Resolved path: {path}")

        # Create images directory if it doesn't exist
        images_dir = os.path.join(base_path, 'images')
        if not os.path.exists(images_dir):
            os.makedirs(images_dir)
            logger.info(f"Created images directory at: {images_dir}")

        # If requested path doesn't exist or isn't a directory, default to images directory
        if not os.path.exists(path) or not os.path.isdir(path):
            path = images_dir
            logger.info(f"Using default images directory: {path}")

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
                    logger.info(f"Added directory: {item}")
                else:
                    # Only include supported image formats
                    if any(item.lower().endswith(ext) for ext in ['.nii', '.nii.gz', '.dcm', '.jpg', '.jpeg', '.png', '.bmp']):
                        files.append({
                            "name": item,
                            "url": relative_path.replace("\\", "/")
                        })
                        logger.info(f"Added file: {item}")

            logger.info(f"Listed directory {path}: {len(files)} files, {len(directories)} directories")
            return {
                "status": "success",
                "files": files,
                "directories": directories,
                "current_path": url
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

@router.post("/import-from-url")
async def import_from_url(path: str = Form(...)):
    """Import an image from a URL path."""
    try:
        logger.info(f"Received import request for path: {path}")

        # Get absolute paths and clean the path
        base_path = os.path.abspath(os.getcwd())
        path = path.replace('\\', '/')

        # Ensure path starts with images/
        if not path.startswith('images/'):
            path = f'images/{path}'

        # Construct full path
        full_path = os.path.join(base_path, path)
        logger.info(f"Full path resolved to: {full_path}")

        # Verify file exists and is a file
        if not os.path.exists(full_path):
            msg = f"File not found: {path}"
            logger.error(msg)
            raise HTTPException(status_code=404, detail=msg)

        if not os.path.isfile(full_path):
            msg = "Path is not a file"
            logger.error(msg)
            raise HTTPException(status_code=400, detail=msg)

        # Process file based on extension
        file_ext = os.path.splitext(full_path)[1].lower()
        if file_ext == '.gz' and full_path.lower().endswith('.nii.gz'):
            file_ext = '.nii.gz'

        supported_extensions = {'.nii', '.nii.gz', '.dcm', '.jpg', '.jpeg', '.png', '.bmp'}
        if not any(full_path.lower().endswith(ext) for ext in supported_extensions):
            msg = f"Unsupported file type. Supported extensions: {', '.join(supported_extensions)}"
            logger.error(msg)
            raise HTTPException(status_code=400, detail=msg)

        try:
            data = None
            total_slices = 1

            # Process different file types
            if file_ext in ['.nii', '.nii.gz']:
                logger.info("Processing NIfTI file")
                try:
                    img = nib.load(full_path)
                    data = img.get_fdata()
                    data = np.array(data, dtype=np.float32)
                    if len(data.shape) == 3:
                        total_slices = data.shape[2]
                    elif len(data.shape) == 4:
                        data = data[..., 0]  # Take first time point for 4D data
                        total_slices = data.shape[2]
                    img.uncache()
                except Exception as e:
                    msg = f"Error loading NIfTI file: {str(e)}"
                    logger.error(msg, exc_info=True)
                    raise HTTPException(status_code=400, detail=msg)

            elif file_ext == '.dcm':
                logger.info("Processing DICOM file")
                try:
                    dcm = pydicom.dcmread(full_path)
                    data = dcm.pixel_array.astype(np.float32)
                except Exception as e:
                    msg = f"Error loading DICOM file: {str(e)}"
                    logger.error(msg, exc_info=True)
                    raise HTTPException(status_code=400, detail=msg)

            else:  # Standard image formats (PNG, JPG, etc.)
                logger.info("Processing standard image file")
                try:
                    with Image.open(full_path) as img:
                        # Convert to grayscale if needed
                        if img.mode in ['RGB', 'RGBA']:
                            img = img.convert('L')
                        data = np.array(img, dtype=np.float32)
                except Exception as e:
                    msg = f"Error loading image file: {str(e)}"
                    logger.error(msg, exc_info=True)
                    raise HTTPException(status_code=400, detail=msg)

            if data is None:
                msg = "Failed to load image data"
                logger.error(msg)
                raise HTTPException(status_code=400, detail=msg)

            logger.info(f"Successfully loaded image. Shape: {data.shape}, Type: {data.dtype}")

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