import logging

# Set up logging for the app
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import submodules to make them accessible as `app.routes` or `app.utils`
from . import routes, utils
