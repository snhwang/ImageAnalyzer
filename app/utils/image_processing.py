import numpy as np
import logging

logger = logging.getLogger(__name__)

def calculate_optimal_window_settings(image_data):
    """Calculate optimal window width and center based on dynamic histogram analysis."""
    # Convert to float for calculations
    data = image_data.astype(float)
    
    # Handle 1D data first
    if len(data.shape) == 1:
        # For 1D data, reshape to a square 2D array
        size = int(np.sqrt(data.shape[0]))
        data = data.reshape(size, size)
        logger.info(f"Reshaped 1D data to 2D for window calculation: {data.shape}")
    
    # Remove any NaN or infinite values
    data = data[np.isfinite(data)]
    
    if len(data) == 0:
        return 255, 128  # Default values if no valid data
    
    # Extract central portion of the volume (middle 60% in each dimension)
    shape = data.shape
    central_data = None
    
    if len(shape) == 3:
        # For 3D data
        z_start = int(shape[2] * 0.2)
        z_end = int(shape[2] * 0.8)
        y_start = int(shape[1] * 0.2)
        y_end = int(shape[1] * 0.8)
        x_start = int(shape[0] * 0.2)
        x_end = int(shape[0] * 0.8)
        central_data = data[x_start:x_end, y_start:y_end, z_start:z_end]
    elif len(shape) == 2:
        # For 2D data
        y_start = int(shape[0] * 0.2)
        y_end = int(shape[0] * 0.8)
        x_start = int(shape[1] * 0.2)
        x_end = int(shape[1] * 0.8)
        central_data = data[y_start:y_end, x_start:x_end]
    else:
        central_data = data.reshape(-1)  # Flatten any other dimensional data
    
    # Get non-zero intensities from central portion (exclude background)
    intensities = central_data[central_data > 0]
    
    if len(intensities) == 0:
        # If no non-zero values in central portion, fall back to using all data
        intensities = data[data > 0]
        if len(intensities) == 0:
            intensities = data.reshape(-1)  # Ensure 1D array
    
    # Calculate histogram for the non-zero intensities
    hist, bins = np.histogram(intensities, bins=256, 
                            range=(intensities.min(), intensities.max()))
    
    # Calculate dynamic percentiles
    p2 = np.percentile(intensities, 2)  # Lower cutoff
    p98 = np.percentile(intensities, 98)  # Upper cutoff
    
    # Window width is the range between percentiles
    window_width = p98 - p2
    
    # Window center is the midpoint
    window_center = (p98 + p2) / 2
    
    # Ensure minimum window width
    window_width = max(window_width, 1)
    
    return float(window_width), float(window_center)

def apply_window_level(data, window_center, window_width):
    """Apply window/level adjustments to image data with strict background handling."""
    # Calculate window range
    window_min = window_center - window_width / 2
    window_max = window_center + window_width / 2
    
    # Create a mask for background (assuming 0 is background)
    background_mask = (data == 0)
    
    # Apply windowing to non-background pixels with increased contrast
    normalized = np.zeros_like(data, dtype=float)
    
    # Apply windowing only to non-background pixels
    non_background_data = data[~background_mask]
    if len(non_background_data) > 0:
        # Apply normalization with slight contrast boost
        normalized_values = ((non_background_data - window_min) * 255 / (window_max - window_min))
        # Apply slight contrast boost
        normalized_values = np.power(normalized_values / 255, 0.9) * 255
        normalized[~background_mask] = normalized_values
    
    # Clip values to valid range
    normalized = np.clip(normalized, 0, 255)
    
    # Ensure background stays exactly zero
    normalized[background_mask] = 0
    
    return normalized.astype(np.uint8)

def normalize_data(data):
    """Normalize data to 0-255 range while preserving the relative values."""
    data_min = data.min()
    data_max = data.max()
    normalized = ((data - data_min) * 255 / (data_max - data_min))
    return normalized.astype(np.uint8), data_min, data_max

def precompute_normalized_slices(data):
    """Pre-compute normalized slices for 3D data using dynamic windowing."""
    # Handle reshaping of 1D data first
    if len(data.shape) == 1:
        # For 1D data, reshape to a square 2D array
        size = int(np.sqrt(data.shape[0]))
        data = data.reshape(size, size)
        logger.info(f"Reshaped 1D data to 2D: {data.shape}")
    
    # Calculate window settings based on the entire volume
    window_width, window_center = calculate_optimal_window_settings(data)
    
    # Use these as our normalization range
    data_min = window_center - window_width/2
    data_max = window_center + window_width/2
    
    normalized_slices = []
    
    # Handle different dimensionalities
    if len(data.shape) == 3:
        # For 3D data, process each slice
        for i in range(data.shape[2]):
            slice_data = data[:, :, i]
            normalized = apply_window_level(slice_data, window_center, window_width)
            normalized_slices.append(normalized)
    elif len(data.shape) == 2:
        # For 2D data, process single slice
        normalized = apply_window_level(data, window_center, window_width)
        normalized_slices.append(normalized)
    else:
        raise ValueError(f"Unexpected data dimensionality: {len(data.shape)}D after reshaping")
    
    return normalized_slices, data_min, data_max