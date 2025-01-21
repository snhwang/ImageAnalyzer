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

        if not url:
            url = 'images'  # Default to images directory

        # Ensure the directory path starts with 'images'
        if not url.startswith('images'):
            url = 'images'

        # Validate the directory path
        if '..' in url:  # Prevent directory traversal
            raise HTTPException(status_code=400, detail="Invalid directory path")

        base_path = os.path.abspath(os.getcwd())
        path = os.path.join(base_path, url)

        # Create images directory if it doesn't exist
        if not os.path.exists(os.path.join(base_path, 'images')):
            os.makedirs(os.path.join(base_path, 'images'))

        if not os.path.exists(path):
            path = os.path.join(base_path, 'images')

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
        
        base_path = os.path.abspath(os.getcwd())

        # Ensure the path starts with 'images' directory
        if not path.startswith('images'):
            path = 'images/' + path

        # Ensure the path is relative and secure
        path = os.path.normpath(path).replace('\\', '/')
        if '..' in path:  # Prevent directory traversal
            path = 'images'

        full_path = os.path.join(base_path, path)

        # Create images directory if it doesn't exist
        if not os.path.exists(os.path.join(base_path, 'images')):
            os.makedirs(os.path.join(base_path, 'images'))
        
        logger.info(f"Resolved full path: {full_path}")

        if not os.path.exists(full_path):
            logger.error(f"Path does not exist: {full_path}")
            raise HTTPException(status_code=404, detail=f"Path not found: {path}")

        try:
            if os.path.isfile(full_path):
                logger.info(f"Processing as file: {full_path}")
                # Check if it's an image file
                supported_extensions = {'.nii', '.nii.gz', '.dcm', '.jpg', '.jpeg', '.png', '.bmp'}
                file_ext = os.path.splitext(full_path)[1].lower()
                # Special handling for .nii.gz files
                if file_ext == '.gz' and full_path.lower().endswith('.nii.gz'):
                    file_ext = '.nii.gz'
                is_image = any(full_path.lower().endswith(ext) for ext in supported_extensions)

                if is_image:
                    logger.info(f"Processing image file with extension: {file_ext}")
                    try:
                        # Process the image file
                        data = None
                        total_slices = 1

                        # Process file based on extension
                        if file_ext in ['.nii', '.nii.gz']:
                            logger.info("Loading as NIfTI file")
                            img = nib.load(full_path)
                            data = img.get_fdata()
                            data = np.array(data, copy=True)
                            if len(data.shape) == 3:
                                total_slices = data.shape[2]
                            img.uncache()
                            del img
                        elif file_ext == '.dcm':
                            logger.info("Loading as DICOM file")
                            dcm = pydicom.dcmread(full_path)
                            data = dcm.pixel_array.copy()
                            del dcm
                        else:
                            logger.info("Loading as standard image file")
                            img = Image.open(full_path)
                            data = np.array(img)
                            img.close()
                            del img
                            if len(data.shape) == 3 and data.shape[2] in [3, 4]:
                                data = np.mean(data, axis=2)

                        if data is None:
                            logger.error("Failed to load image data")
                            raise HTTPException(status_code=400, detail="Failed to load image data")

                        logger.info(f"Image data loaded successfully. Shape: {data.shape}, Type: {data.dtype}")

                        # Convert to float32 for processing
                        data = data.astype(np.float32)

                        # Calculate window settings and normalize
                        window_width, window_center = calculate_optimal_window_settings(data)
                        normalized_slices, data_min, data_max = precompute_normalized_slices(data)

                        logger.info(f"Processed {len(normalized_slices)} slices")

                        # Convert to base64
                        all_slices = []
                        for i, normalized in enumerate(normalized_slices):
                            img_byte_arr = io.BytesIO()
                            Image.fromarray(normalized).save(img_byte_arr, format='PNG', optimize=True)
                            img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
                            all_slices.append(f"data:image/png;base64,{img_base64}")
                            logger.info(f"Encoded slice {i+1}/{len(normalized_slices)}")

                        # Generate image ID and store data
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
                        logger.error(f"Error processing image file: {str(e)}", exc_info=True)
                        raise HTTPException(
                            status_code=500,
                            detail=f"Error processing image file: {str(e)}"
                        )
                else:
                    logger.error(f"Unsupported file type: {file_ext}")
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Not a supported image file. Supported extensions: {', '.join(supported_extensions)}"
                    )
            else:
                logger.info(f"Processing as directory: {full_path}")
                try:
                    # List directory contents
                    files = []
                    directories = []

                    for item in sorted(os.listdir(full_path)):
                        item_path = os.path.join(full_path, item)
                        relative_path = os.path.relpath(item_path, base_path)

                        # Skip hidden files and directories
                        if item.startswith('.'):
                            continue

                        if os.path.isdir(item_path):
                            directories.append({
                                "name": item,
                                "url": relative_path.replace('\\', '/')
                            })
                            logger.info(f"Added directory: {item}")
                        else:
                            files.append({
                                "name": item,
                                "url": relative_path.replace('\\', '/')
                            })
                            logger.info(f"Added file: {item}")

                    logger.info(f"Found {len(directories)} directories and {len(files)} files")
                    return {
                        "status": "directory",
                        "current_url": path,
                        "files": files,
                        "directories": directories
                    }

                except Exception as e:
                    logger.error(f"Failed to list directory: {str(e)}", exc_info=True)
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to list directory: {str(e)}"
                    )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to access path: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to access path: {str(e)}"
            )

    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))