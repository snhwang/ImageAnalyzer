import os
import urllib.request
import ssl
import shutil

def download_babylon_files():
    # Create static/js directory if it doesn't exist
    os.makedirs('app/static/js', exist_ok=True)

    # URLs for Babylon.js files with specific versions
    files = {
        'babylon.js': 'https://preview.babylonjs.com/babylon.js',
        'babylonjs.loaders.min.js': 'https://preview.babylonjs.com/loaders/babylonjs.loaders.min.js'
    }

    # Create SSL context that doesn't verify certificates
    context = ssl._create_unverified_context()

    # Download each file
    for filename, url in files.items():
        output_path = os.path.join('app/static/js', filename)
        print(f"Downloading {filename}...")

        try:
            # Open URL with SSL context
            with urllib.request.urlopen(url, context=context) as response:
                # Save the content to file
                with open(output_path, 'wb') as out_file:
                    shutil.copyfileobj(response, out_file)
            print(f"Successfully downloaded {filename}")
        except Exception as e:
            print(f"Error downloading {filename}: {e}")

if __name__ == "__main__":
    download_babylon_files()