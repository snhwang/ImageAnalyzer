import streamlit as st
import cv2
import numpy as np
from PIL import Image
import matplotlib.pyplot as plt

def main():
    st.title("Medical Image Viewer and Analysis")
    
    # File uploader
    uploaded_file = st.file_uploader("Choose a medical image...", type=["jpg", "png", "dcm"])
    
    if uploaded_file is not None:
        # Read image
        image = Image.open(uploaded_file)
        # Convert to array
        image_array = np.array(image)
        
        # Display image
        st.image(image_array, caption='Uploaded Medical Image', use_column_width=True)

if __name__ == '__main__':
    main()
