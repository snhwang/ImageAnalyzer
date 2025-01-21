import numpy as np
from PIL import Image
import os

def create_test_image():
    # Create a directory for test images if it doesn't exist
    os.makedirs("images", exist_ok=True)
    
    # Create a simple grayscale test pattern
    size = 512
    image = np.zeros((size, size), dtype=np.uint8)
    
    # Add some test patterns
    # Central circle
    center = size // 2
    radius = size // 4
    y, x = np.ogrid[-center:size-center, -center:size-center]
    mask = x*x + y*y <= radius*radius
    image[mask] = 255
    
    # Add some lines for reference
    image[size//4:3*size//4, size//2] = 255  # Vertical line
    image[size//2, size//4:3*size//4] = 255  # Horizontal line
    
    # Convert to PIL Image and save
    img = Image.fromarray(image)
    img.save("images/test_pattern.png")
    
    # Create a second test image with different pattern
    image_2 = np.zeros((size, size), dtype=np.uint8)
    for i in range(0, size, 50):
        image_2[i:i+25, :] = 255
    img_2 = Image.fromarray(image_2)
    img_2.save("images/test_grid.png")

if __name__ == "__main__":
    create_test_image()
