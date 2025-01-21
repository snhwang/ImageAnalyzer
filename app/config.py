import os

# General Settings
APP_NAME = "Medical Image Viewer"
APP_VERSION = "1.0.0"
DEBUG = os.getenv("DEBUG", "true").lower() == "true"

# Environment
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
SECRET_KEY = os.getenv("SECRET_KEY", "default_secret_key")

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./test.db")

# File Upload
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
MAX_FILE_SIZE_MB = 50
ALLOWED_FILE_EXTENSIONS = {".nii", ".nii.gz", ".dcm", ".jpg", ".jpeg", ".png", ".bmp"}

# CORS
CORS_ORIGINS = [
    "https://viewer.rad-space.com",
    "https://viewer.quantitativetech.com",
    "https://rad-viewer.replit.app",
    "https://test-viewer.replit.app",
    "http://localhost:7000",
    "http://localhost:8000"


]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = ["*"]
CORS_ALLOW_HEADERS = ["*"]

# Logging
LOGGING_LEVEL = os.getenv("LOGGING_LEVEL", "INFO")
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
