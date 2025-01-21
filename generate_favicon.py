from PIL import Image, ImageDraw

# Create a 32x32 image with a transparent background
img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Draw a simple medical cross symbol
draw.rectangle([8, 14, 24, 18], fill='red')  # Horizontal line
draw.rectangle([14, 8, 18, 24], fill='red')  # Vertical line

# Save as ICO
img.save('app/static/images/favicon.ico', format='ICO')
