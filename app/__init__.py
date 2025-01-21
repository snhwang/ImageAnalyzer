import logging

# Set up logging for the app
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import the FastAPI app instance to make it available at the package level
from .main import app

# Import submodules to make them accessible
from . import routes, utils

__all__ = ['app']