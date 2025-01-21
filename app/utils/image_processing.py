import numpy as np
import logging

logger = logging.getLogger(__name__)

def calculate_optimal_window_settings(image_data):
    """Calculate optimal window width and center based on dynamic histogram analysis."""
    # Convert to float64 for precise calculations
    data = image_data.astype(np.float64)

    # Handle 1D data first
    if len(data.shape) == 1:
        size = int(np.sqrt(data.shape[0]))
        data = data.reshape(size, size)
        logger.info(f"Reshaped 1D data to 2D for window calculation: {data.shape}")

    # Remove any NaN or infinite values
    data = data[np.isfinite(data)]

    if len(data) == 0:
        return data.max() - data.min(), (data.max() + data.min()) / 2

    # Calculate dynamic percentiles
    p2 = np.percentile(data, 2)
    p98 = np.percentile(data, 98)

    # Window width is the range between percentiles
    window_width = p98 - p2

    # Window center is the midpoint
    window_center = (p98 + p2) / 2

    # Ensure minimum window width
    window_width = max(window_width, np.finfo(float).eps)

    return float(window_width), float(window_center)

def apply_window_level(data, window_center, window_width, output_range=(0, 255)):
    """
    Apply window/level adjustments to image data preserving original bit depth.

    Args:
        data: Input image data (any numeric type)
        window_center: Center of the window
        window_width: Width of the window
        output_range: Tuple of (min, max) for output scaling
    """
    # Convert to float64 for calculations
    data = np.array(data, dtype=np.float64)

    # Calculate window range
    window_min = window_center - window_width / 2
    window_max = window_center + window_width / 2

    # Create a mask for background (assuming 0 is background)
    background_mask = (data == 0)

    # Apply windowing to non-background pixels
    normalized = np.zeros_like(data, dtype=np.float64)

    # Apply windowing only to non-background pixels
    non_background_data = data[~background_mask]
    if len(non_background_data) > 0:
        # Normalize to 0-1 range first
        normalized_values = (non_background_data - window_min) / (window_max - window_min)
        # Then scale to output range
        normalized_values = (normalized_values * (output_range[1] - output_range[0])) + output_range[0]
        normalized[~background_mask] = normalized_values

    # Clip values to valid range
    normalized = np.clip(normalized, output_range[0], output_range[1])

    # Ensure background stays exactly zero
    normalized[background_mask] = output_range[0]

    return normalized

def normalize_data(data):
    """
    Normalize data while preserving original precision.
    Returns normalized data and scaling factors for reconstruction.
    """
    data_type = data.dtype
    data = np.array(data, dtype=np.float64)

    data_min = data.min()
    data_max = data.max()

    # If data is already normalized or constant, return as is
    if data_max == data_min:
        return data, data_min, data_max

    # Normalize to 0-1 range
    normalized = (data - data_min) / (data_max - data_min)

    # Store original type info for reconstruction
    type_info = {
        'dtype': str(data_type),
        'min': float(data_min),
        'max': float(data_max)
    }

    return normalized, data_min, data_max

def precompute_normalized_slices(data, display_range=(0, 255)):
    """
    Pre-compute normalized slices for 3D data using dynamic windowing.
    Preserves original bit depth in calculations.
    """
    # Handle reshaping of 1D data first
    if len(data.shape) == 1:
        size = int(np.sqrt(data.shape[0]))
        data = data.reshape(size, size)
        logger.info(f"Reshaped 1D data to 2D: {data.shape}")

    # Calculate window settings based on the entire volume
    window_width, window_center = calculate_optimal_window_settings(data)

    # Store original data range
    data_min = float(data.min())
    data_max = float(data.max())

    normalized_slices = []

    # Handle different dimensionalities
    if len(data.shape) == 3:
        # For 3D data, process each slice
        for i in range(data.shape[2]):
            slice_data = data[:, :, i]
            # Normalize to display range while preserving precision
            normalized = apply_window_level(
                slice_data, 
                window_center, 
                window_width,
                output_range=display_range
            )
            normalized_slices.append(normalized.astype(np.uint8))

    elif len(data.shape) == 2:
        # For 2D data, process single slice
        normalized = apply_window_level(
            data,
            window_center,
            window_width,
            output_range=display_range
        )
        normalized_slices.append(normalized.astype(np.uint8))
    else:
        raise ValueError(f"Unexpected data dimensionality: {len(data.shape)}D after reshaping")

    # Also return the original data range for reconstruction
    return normalized_slices, data_min, data_max