import streamlit as st
import os
from pathlib import Path
import json
from PIL import Image
import io
from flask import Flask, request, jsonify, send_from_directory, Response
from werkzeug.utils import secure_filename
from threading import Thread
from flask_cors import CORS

# Create Flask app for handling uploads
flask_app = Flask(__name__, static_folder='app/static')
CORS(flask_app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Set up upload folder with proper permissions
UPLOAD_FOLDER = 'app/static/uploads'
ALLOWED_EXTENSIONS = {'nii', 'gz', 'dcm', 'jpg', 'png', 'bmp'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.chmod(UPLOAD_FOLDER, 0o777)  # Full permissions for uploads
flask_app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
flask_app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@flask_app.route('/upload', methods=['POST', 'OPTIONS'])
def upload_file():
    if request.method == 'OPTIONS':
        return Response(status=200)

    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No file part'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'message': 'No selected file'}), 400

        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(flask_app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            os.chmod(filepath, 0o666)  # Read/write for uploaded files
            return jsonify({
                'success': True,
                'url': f'/static/uploads/{filename}',
                'filename': filename
            })
        return jsonify({'success': False, 'message': 'File type not allowed'}), 400
    except Exception as e:
        print(f"Upload error: {str(e)}")
        return jsonify({
            'success': False, 
            'message': 'Upload failed',
            'error': str(e)
        }), 500

@flask_app.route('/static/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory(flask_app.config['UPLOAD_FOLDER'], filename)

def run_flask():
    flask_app.run(host='0.0.0.0', port=5001, debug=False)

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
        try:
            files = {'file': (uploaded_file.name, uploaded_file, uploaded_file.type)}
            import requests
            response = requests.post('http://localhost:5001/upload', files=files)
            if response.ok:
                return response.json()
            else:
                return {"success": False, "message": f"Upload failed: {response.text}"}
        except requests.exceptions.RequestException as e:
            return {"success": False, "message": f"Connection error: {str(e)}"}
        except Exception as e:
            return {"success": False, "message": f"Error: {str(e)}"}

    return None

# Set Streamlit config
st.set_page_config(
    page_title="Medical Image Viewer",
    page_icon="🏥",
    layout="wide"
)

# Create necessary directories
os.makedirs("app/static/js", exist_ok=True)
os.makedirs("app/static/uploads", exist_ok=True)
os.chmod("app/static/uploads", 0o777)

# Start Flask server in a separate thread
flask_thread = Thread(target=run_flask)
flask_thread.daemon = True
flask_thread.start()

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

    # Replace default port in JavaScript
    html_content = html_content.replace(
        'const BASE_URL = window.location.origin;', 
        'const BASE_URL = window.location.protocol + "//" + window.location.hostname + ":5001";'
    )

    # Render the page
    st.components.v1.html(
        html_content,
        height=800,
        scrolling=True
    )

# If there's an upload response, convert it to JSON
if upload_response:
    st.json(upload_response)