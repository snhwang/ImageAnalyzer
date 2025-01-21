import streamlit as st
import numpy as np
from utils.image_processing import extract_metadata
import matplotlib.pyplot as plt

def show_analysis(image):
    """Display image analysis information"""
    if image is not None:
        st.subheader("Image Analysis")
        
        # Display metadata
        metadata = extract_metadata(image)
        st.write("Image Metadata:")
        for key, value in metadata.items():
            st.text(f"{key}: {value}")
        
        # Display histogram
        st.write("Histogram Analysis:")
        fig, ax = plt.subplots(figsize=(8, 4))
        ax.hist(image.ravel(), bins=256, range=[0, 256], density=True)
        ax.set_xlabel("Pixel Intensity")
        ax.set_ylabel("Frequency")
        ax.grid(True)
        st.pyplot(fig)
        plt.close()

def show_measurements(points, measurement_type):
    """Display measurement information"""
    if measurement_type == "Distance" and len(points) == 2:
        distance = np.sqrt((points[1][0] - points[0][0])**2 + 
                         (points[1][1] - points[0][1])**2)
        st.write(f"Distance: {distance:.2f} pixels")
    
    elif measurement_type == "Area" and len(points) > 2:
        points_array = np.array(points)
        area = 0.5 * np.abs(np.dot(points_array[:, 0], np.roll(points_array[:, 1], 1)) - 
                           np.dot(points_array[:, 1], np.roll(points_array[:, 0], 1)))
        st.write(f"Area: {area:.2f} square pixels")
