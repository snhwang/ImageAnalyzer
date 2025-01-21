import streamlit as st
import os
from pathlib import Path
import json
from PIL import Image
import io

# Set page config
st.set_page_config(
    page_title="Medical Image Viewer",
    page_icon="🏥",
    layout="wide"
)

# Create necessary directories
os.makedirs("app/static/js", exist_ok=True)
os.makedirs("app/static/uploads", exist_ok=True)

# Initialize session state for file uploads
if 'uploaded_files' not in st.session_state:
    st.session_state.uploaded_files = {}

def handle_file_upload():
    """Handle file upload and return the file path"""
    uploaded_file = st.file_uploader(
        "Choose a file",
        type=['nii', 'nii.gz', 'dcm', 'jpg', 'png', 'bmp'],
        key='file_uploader'
    )

    if uploaded_file:
        # Create a unique filename
        file_path = Path("app/static/uploads") / uploaded_file.name

        # Save the file
        with open(file_path, "wb") as f:
            f.write(uploaded_file.getvalue())

        # Store in session state
        st.session_state.uploaded_files[uploaded_file.name] = str(file_path)

        # Return success response
        return {
            "success": True,
            "url": f"/static/uploads/{uploaded_file.name}",
            "filename": uploaded_file.name
        }

    return None

# Create the layout
st.title("Medical Image Viewer")

# Add file uploader widget
upload_response = handle_file_upload()

# Load and inject viewer.js
with open("app/static/js/viewer.js", "r") as js_file:
    js_code = js_file.read()

# Load the HTML template
with open("app/templates/index.html", "r") as f:
    html_content = f.read()

    # Inject the JavaScript code
    html_content = html_content.replace('</body>', f'<script>{js_code}</script></body>')

    # Render the page
    st.components.v1.html(
        html_content,
        height=800,
        scrolling=True
    )

# If there's an upload response, convert it to JSON
if upload_response:
    st.json(upload_response)