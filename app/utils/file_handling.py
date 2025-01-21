import nibabel as nib
import pydicom
import numpy as np
from PIL import Image
import logging

logger = logging.getLogger(__name__)

def process_file(file_path, filename):
    """Process an uploaded file based on its type."""
    try:
        extension = filename.lower().split('.')[-1]
        if extension in ['nii', 'nii.gz']:
            return process_nifti_file(file_path)
        elif extension == 'dcm':
            return process_dicom_file(file_path)
        elif extension in ['jpg', 'jpeg', 'png', 'bmp']:
            return process_image_file(file_path)
        else:
            raise ValueError(f"Unsupported file type: {extension}")
    except Exception as e:
        logger.error(f"Error processing file: {e}", exc_info=True)
        raise

def process_nifti_file(file_path):
    """Process a NIfTI file."""
    logger.info(f"Processing NIfTI file: {file_path}")
    img = nib.load(file_path)
    data = img.get_fdata()
    return data

def process_dicom_file(file_path):
    """Process a DICOM file."""
    logger.info(f"Processing DICOM file: {file_path}")
    dcm = pydicom.dcmread(file_path)
    data = dcm.pixel_array
    return data

def process_image_file(file_path):
    """Process a standard image file."""
    logger.info(f"Processing image file: {file_path}")
    img = Image.open(file_path)
    data = np.array(img)
    if data.ndim == 3:  # Convert RGB to grayscale if needed
        data = np.mean(data, axis=2)
    return data
