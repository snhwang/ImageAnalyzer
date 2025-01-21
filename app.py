import streamlit as st
import os
from pathlib import Path

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

# File upload endpoint
def handle_file_upload():
    uploaded_file = st.file_uploader("Choose a file", type=['nii', 'nii.gz', 'dcm', 'jpg', 'png', 'bmp'], key='file_uploader')
    if uploaded_file is not None:
        # Save the file
        save_path = Path("app/static/uploads") / uploaded_file.name
        with open(save_path, "wb") as f:
            f.write(uploaded_file.getvalue())
        st.session_state.uploaded_files[uploaded_file.name] = str(save_path)
        return str(save_path)
    return None

# Load and inject custom JavaScript
with open("app/static/js/viewer.js", "r") as js_file:
    js_code = js_file.read()

# Render the HTML template with injected JavaScript
with open("app/templates/index.html", "r") as f:
    html_content = f.read()
    # Inject the JavaScript code directly into a script tag
    html_content = html_content.replace('</body>', f'<script>{js_code}</script></body>')
    st.components.v1.html(html_content, height=1000)

# Handle file uploads
handle_file_upload()