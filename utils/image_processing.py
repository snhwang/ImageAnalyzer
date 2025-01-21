import cv2
import numpy as np
from PIL import Image
import io

def load_image(uploaded_file):
    """Load and convert uploaded image to numpy array"""
    if uploaded_file is not None:
        file_bytes = np.asarray(bytearray(uploaded_file.read()), dtype=np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    return None

def adjust_contrast_brightness(image, contrast, brightness):
    """Adjust image contrast and brightness"""
    adjusted = cv2.convertScaleAbs(image, alpha=contrast, beta=brightness)
    return adjusted

def apply_window_level(image, window_width, window_center):
    """Apply windowing to medical images"""
    min_value = window_center - window_width // 2
    max_value = window_center + window_width // 2
    windowed = np.clip(image, min_value, max_value)
    windowed = ((windowed - min_value) / (max_value - min_value) * 255).astype(np.uint8)
    return windowed

def extract_metadata(image):
    """Extract basic image metadata"""
    height, width = image.shape[:2]
    channels = 1 if len(image.shape) == 2 else image.shape[2]
    mean_intensity = np.mean(image)
    std_intensity = np.std(image)
    
    return {
        "Dimensions": f"{width}x{height}",
        "Channels": channels,
        "Mean Intensity": f"{mean_intensity:.2f}",
        "Std Deviation": f"{std_intensity:.2f}"
    }
