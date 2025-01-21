from fastapi import APIRouter, UploadFile, File, HTTPException
from app.config import UPLOAD_DIR, ALLOWED_FILE_EXTENSIONS
from app.routes.image import image_storage
from app.utils.image_processing import normalize_data, precompute_normalized_slices
from app.utils.image_processing import calculate_optimal_window_settings
import gc
import nibabel as nib
import pydicom
from PIL import Image
import numpy as np
import io
import base64
import os
import tempfile
import uuid
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

#if file_extension not in ALLOWED_FILE_EXTENSIONS:
#   raise ValueError("Unsupported file type")

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    temp_file = None
    try:
        # Validate file extension
        filename = file.filename.lower()
        valid_extensions = {'.nii', '.nii.gz', '.dcm', '.jpg', '.jpeg', '.png', '.bmp'}
        
        # Special handling for .nii.gz files
        if filename.endswith('.nii.gz'):
            suffix = '.nii.gz'
        else:
            suffix = os.path.splitext(filename)[1]
            
        if not any(filename.endswith(ext) for ext in valid_extensions):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Supported formats are: {', '.join(valid_extensions)}"
            )

        # Log file information
        logger.info(f"Receiving file: {filename}")
        
        # Create a temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        
        try:
            # Write the uploaded file content
            content = await file.read()
            if not content:
                raise HTTPException(status_code=400, detail="Empty file uploaded")
            
            temp_file.write(content)
            temp_file.flush()
            temp_file.close()
            
            image_id = str(uuid.uuid4())
            logger.info(f"Processing file with ID: {image_id}")
            
            try:
                data = None
                total_slices = 1
                
                # Try loading as NIfTI first
                if suffix in ['.nii', '.gz']:
                    logger.info("Loading NIfTI file")
                    try:
                        img = nib.load(temp_file.name)
                        # Log NIfTI header information
                        logger.info(f"NIfTI header: shape={img.shape}, affine={img.affine.shape}, datatype={img.get_data_dtype()}")
                        
                        data = img.get_fdata()
                        data = np.array(data, copy=True)
                        logger.info(f"Original data shape: {data.shape}, dtype: {data.dtype}, min: {data.min()}, max: {data.max()}")
                        
                        # Ensure data is at least 2D
                        if len(data.shape) < 2:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Invalid NIfTI data: Expected 2D or 3D data, but got {len(data.shape)}D data with shape {data.shape}"
                            )
                        
                        # Handle different dimensionalities
                        if len(data.shape) == 2:
                            # 2D data: Keep as is
                            total_slices = 1
                            logger.info("Processing as 2D image")
                        elif len(data.shape) == 3:
                            # Check if any dimension is 1, which might need squeezing
                            if 1 in data.shape:
                                logger.info(f"Found singleton dimension in shape {data.shape}")
                                data = np.squeeze(data)
                                logger.info(f"After squeezing: {data.shape}")
                                total_slices = 1 if len(data.shape) == 2 else data.shape[2]
                            else:
                                # Regular 3D data
                                total_slices = data.shape[2]
                                logger.info("Processing as 3D volume")
                        elif len(data.shape) == 4:
                            # 4D data: Take first volume
                            logger.info("4D data detected, taking first volume")
                            data = data[:, :, :, 0]
                            total_slices = data.shape[2]
                        else:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Unsupported NIfTI dimensionality: {len(data.shape)}D with shape {data.shape}"
                            )
                        
                        logger.info(f"Final processed data shape: {data.shape}, total_slices: {total_slices}")
                        
                        img.uncache()
                        del img
                        gc.collect()
                    except HTTPException:
                        raise
                    except Exception as e:
                        logger.error(f"Error processing NIfTI file", exc_info=True)
                        raise HTTPException(
                            status_code=400,
                            detail=f"Failed to load NIfTI file: {str(e)}"
                        )
                    
                elif suffix == '.dcm':
                    logger.info("Loading DICOM file")
                    try:
                        dcm = pydicom.dcmread(temp_file.name)
                        data = dcm.pixel_array.copy()
                        del dcm
                        gc.collect()
                    except Exception as e:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Failed to load DICOM file: {str(e)}"
                        )
                    
                else:
                    logger.info("Loading standard image file")
                    try:
                        img = Image.open(temp_file.name)
                        data = np.array(img)
                        img.close()
                        del img
                        if len(data.shape) == 3 and data.shape[2] in [3, 4]:  # RGB or RGBA
                            data = np.mean(data, axis=2)
                    except Exception as e:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Failed to load image file: {str(e)}"
                        )
                
                if data is None:
                    raise HTTPException(
                        status_code=400,
                        detail="Failed to load image data: No data was extracted from the file"
                    )
                
                if data.size == 0:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid image: Image contains no data"
                    )
                
                logger.info(f"Data shape: {data.shape}, dtype: {data.dtype}")
                
                # Convert data to float32 for processing
                data = data.astype(np.float32)
                
                # Calculate optimal window settings
                window_width, window_center = calculate_optimal_window_settings(data)
                logger.info(f"Window settings - Width: {window_width}, Center: {window_center}")
                
                # Precompute normalized slices with consistent normalization
                normalized_slices, data_min, data_max = precompute_normalized_slices(data)
                logger.info(f"Normalized {len(normalized_slices)} slices")
                
                if not normalized_slices:
                    raise HTTPException(
                        status_code=400,
                        detail="Failed to normalize image data"
                    )
                
                # Convert normalized slices to base64
                all_slices = []
                for i, normalized in enumerate(normalized_slices):
                    img_byte_arr = io.BytesIO()
                    Image.fromarray(normalized).save(img_byte_arr, format='PNG', optimize=True)
                    img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
                    all_slices.append(f"data:image/png;base64,{img_base64}")
                    logger.info(f"Processed slice {i+1}/{len(normalized_slices)}")
                
                # Store data in memory
                image_storage[image_id] = {
                    'data': data,
                    'window_width': float(window_width),
                    'window_center': float(window_center),
                    'total_slices': total_slices,
                    'data_min': float(data_min),
                    'data_max': float(data_max),
                    'normalized_slices': normalized_slices
                }
                
                logger.info("Successfully processed and stored image")
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
                logger.error(f"Error processing file: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=400,
                    detail=f"Error processing file: {str(e)}"
                )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error handling file: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Server error while handling file: {str(e)}"
            )
        
    finally:
        if temp_file and os.path.exists(temp_file.name):
            try:
                os.unlink(temp_file.name)
                logger.info("Cleaned up temporary file")
            except Exception as e:
                logger.error(f"Error cleaning up temp file: {str(e)}")



def process_nifti_file(file_path):
    img = nib.load(file_path)
    data = img.get_fdata()
    return data

def process_dicom_file(file_path):
    dcm = pydicom.dcmread(file_path)
    return dcm.pixel_array


