import streamlit as st
import os

# Set page config
st.set_page_config(
    page_title="Medical Image Viewer",
    page_icon="🏥",
    layout="wide"
)

# Render the HTML template
with open("app/templates/index.html", "r") as f:
    html_content = f.read()
    st.components.v1.html(html_content, height=1000)
