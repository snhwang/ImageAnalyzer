import streamlit as st
import os

# Set page config
st.set_page_config(
    page_title="Medical Image Viewer",
    page_icon="🏥",
    layout="wide"
)

# Create a static directory if it doesn't exist
os.makedirs("app/static/js", exist_ok=True)

# Load and inject custom JavaScript
with open("app/static/js/viewer.js", "r") as js_file:
    js_code = js_file.read()

# Render the HTML template with injected JavaScript
with open("app/templates/index.html", "r") as f:
    html_content = f.read()
    # Inject the JavaScript code directly
    html_content = html_content.replace('</body>', f'<script>{js_code}</script></body>')
    st.components.v1.html(html_content, height=1000)