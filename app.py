import streamlit as st
import numpy as np
from components.sidebar import render_sidebar
from components.viewer import display_image
from components.analysis import show_analysis, show_measurements
from utils.image_processing import load_image
from utils.measurements import draw_measurement

def main():
    st.set_page_config(
        page_title="Medical Image Viewer",
        page_icon="🏥",
        layout="wide"
    )
    
    st.title("Medical Image Viewer and Analysis")
    
    # Initialize session state
    if 'image' not in st.session_state:
        st.session_state.image = None
    if 'points' not in st.session_state:
        st.session_state.points = []
    
    # Render sidebar and get controls
    controls = render_sidebar()
    
    # File upload
    uploaded_file = st.file_uploader(
        "Upload Medical Image",
        type=['png', 'jpg', 'jpeg', 'dcm']
    )
    
    # Load and display image
    if uploaded_file is not None:
        if controls["reset"] or st.session_state.image is None:
            st.session_state.image = load_image(uploaded_file)
            st.session_state.points = []
    
    # Create two columns for image viewer and analysis
    col1, col2 = st.columns([2, 1])
    
    with col1:
        if st.session_state.image is not None:
            # Display image with measurements
            display_image = st.session_state.image.copy()
            if st.session_state.points:
                display_image = draw_measurement(
                    display_image,
                    st.session_state.points,
                    controls["measurement_tool"].lower()
                )
            
            # Handle click events for measurements
            clicked = st.image(display_image, use_column_width=True)
            
            if controls["measurement_tool"] != "None":
                st.write("Click on the image to add measurement points")
                if st.button("Clear Points"):
                    st.session_state.points = []
    
    with col2:
        if st.session_state.image is not None:
            # Show analysis
            show_analysis(st.session_state.image)
            
            # Show measurements
            if st.session_state.points:
                show_measurements(
                    st.session_state.points,
                    controls["measurement_tool"]
                )

if __name__ == "__main__":
    main()
