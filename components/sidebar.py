import streamlit as st

def render_sidebar():
    """Render the sidebar with image manipulation controls"""
    st.sidebar.header("Image Controls")
    
    # Image adjustment controls
    st.sidebar.subheader("Adjustments")
    contrast = st.sidebar.slider("Contrast", 0.1, 3.0, 1.0, 0.1)
    brightness = st.sidebar.slider("Brightness", -100, 100, 0, 1)
    
    # Window/Level controls
    st.sidebar.subheader("Window/Level")
    window_width = st.sidebar.slider("Window Width", 1, 4000, 2000, 1)
    window_center = st.sidebar.slider("Window Center", -1000, 3000, 1000, 1)
    
    # Measurement tools
    st.sidebar.subheader("Measurements")
    measurement_tool = st.sidebar.radio(
        "Measurement Tool",
        ["None", "Distance", "Area"]
    )
    
    reset = st.sidebar.button("Reset Image")
    
    return {
        "contrast": contrast,
        "brightness": brightness,
        "window_width": window_width,
        "window_center": window_center,
        "measurement_tool": measurement_tool,
        "reset": reset
    }
