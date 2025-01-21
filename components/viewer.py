import streamlit as st
import numpy as np
from utils.image_processing import adjust_contrast_brightness, apply_window_level

def display_image(image, controls, points=None):
    """Display the image with current processing settings"""
    if image is not None:
        # Apply image adjustments
        processed_image = adjust_contrast_brightness(
            image,
            controls["contrast"],
            controls["brightness"]
        )
        
        # Apply windowing
        processed_image = apply_window_level(
            processed_image,
            controls["window_width"],
            controls["window_center"]
        )
        
        # Create a container for the image
        image_container = st.container()
        with image_container:
            st.image(processed_image, use_column_width=True)
            
        return processed_image
    return None
