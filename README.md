# Medical Image Viewer

A professional web-based medical image viewer built with Python (FastAPI) and JavaScript. The application provides a modern interface for viewing and manipulating medical images, with support for DICOM, NIfTI, and common image formats.

## Features

- Support for multiple image formats (DICOM, NIfTI, JPG, PNG, BMP)
- Dynamic window/level adjustment
- ROI-based contrast optimization
- Image rotation tools
- Multi-slice navigation
- Configurable grid layout (1x1, 1x2, 2x2, 2x3, 2x4)
- Drag-and-drop file upload
- Responsive design

## Installation

1. Clone the repository:
```bash
git clone https://github.com/snhwang/image-analysis.git
cd image-analysis
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

## Usage

1. Start the server:
```bash
uvicorn main:app --reload
```

2. Open your browser and navigate to `http://localhost:8000`

3. Use the interface to:
   - Upload medical images via drag-and-drop or file selection
   - Adjust window/level using left-click and drag
   - Navigate through slices using the mouse wheel
   - Optimize contrast by drawing ROIs
   - Rotate images using toolbar buttons
   - Configure the grid layout using the dropdown menu

## Dependencies

- FastAPI
- Numpy
- Pillow
- Nibabel (for NIfTI support)
- pydicom (for DICOM support)
- uvicorn

## License

This project is licensed under the MIT License - see the LICENSE file for details. 