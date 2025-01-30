import os
from pathlib import Path

# General Settings
APP_NAME = "Medical Image Viewer"
APP_VERSION = "1.0.0"
DEBUG = os.getenv("DEBUG", "true").lower() == "true"

# Environment
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
SECRET_KEY = os.getenv("SECRET_KEY", "default_secret_key")

# Base directory for the application
BASE_DIR = Path(__file__).resolve().parent.parent

# Directory for storing images
IMAGES_DIR = os.getenv("IMAGES_DIR", "./images")

# Directory for storing uploaded files
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./images/uploads")

# Maximum file size for uploads (in bytes)
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", 100 * 1024 * 1024))  # 100MB default

# Supported file extensions
SUPPORTED_EXTENSIONS = {
    '.nii',     # NIfTI format
    '.nii.gz',  # Compressed NIfTI
    '.dcm',     # DICOM format
    '.jpg',     # JPEG format
    '.jpeg',    # JPEG format
    '.png',     # PNG format
    '.bmp',     # BMP format
}

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./test.db")

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

# Logging configuration
LOGGING_CONFIG = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'standard': {
            'format': '%(asctime)s [%(levelname)s] %(name)s: %(message)s'
        },
    },
    'handlers': {
        'default': {
            'level': 'INFO',
            'formatter': 'standard',
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        '': {
            'handlers': ['default'],
            'level': 'INFO',
            'propagate': True
        }
    }
}
