const BASE_URL = window.location.origin;

class ImageViewer {
    constructor(container) {
        this.container = container;
        this.imageContainer = container.querySelector(".image-container");
        this.is3DMode = true;
        this.currentSlice = 0;
        this.totalSlices = 1;

        // Initialize canvas with high precision
        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.outline = "none";
        this.imageContainer.querySelector(".canvas-container").appendChild(this.canvas);

        // Initialize file input and buttons
        this.fileInput = container.querySelector(".hidden-file-input");
        this.uploadBtn = container.querySelector(".upload-btn");
        this.viewModeBtn = container.querySelector(".view-mode-btn");
        this.windowLevelBtn = container.querySelector(".window-level-btn");
        this.menuBtn = container.querySelector(".menu-btn");
        this.menuDropdown = container.querySelector(".menu-dropdown");

        // Setup event listeners
        this.setupEventListeners();
        this.initializeBabylonScene();
    }

    setupEventListeners() {
        // File upload handling
        this.uploadBtn?.addEventListener("click", () => {
            this.fileInput?.click();
        });

        this.fileInput?.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                this.uploadFile(file);
            }
        });

        // View mode toggle
        this.viewModeBtn?.addEventListener("click", () => {
            this.toggleViewMode();
        });

        // Window level toggle
        this.windowLevelBtn?.addEventListener("click", () => {
            this.toggleWindowLevelMode();
        });

        // Menu button handling
        this.menuBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            const menuContainer = this.menuBtn.closest('.menu-container');
            menuContainer.classList.toggle('show');
        });

        // Close menu when clicking outside
        document.addEventListener("click", (e) => {
            if (!e.target.closest('.menu-container')) {
                const menuContainers = document.querySelectorAll('.menu-container');
                menuContainers.forEach(container => container.classList.remove('show'));
            }
        });

        // Menu item actions
        this.menuDropdown?.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = item.dataset.action;
                switch (action) {
                    case 'upload':
                        this.fileInput?.click();
                        break;
                    case 'view-mode':
                        this.toggleViewMode();
                        break;
                    case 'window-level':
                        this.toggleWindowLevelMode();
                        break;
                }
                // Close menu after action
                item.closest('.menu-container').classList.remove('show');
            });
        });

        // Handle mouse wheel for slice navigation in 2D mode
        this.canvas.addEventListener("wheel", (e) => {
            if (!this.is3DMode && this.totalSlices > 1) {
                e.preventDefault();
                const delta = Math.sign(e.deltaY);
                this.currentSlice = Math.max(0, Math.min(this.totalSlices - 1, this.currentSlice + delta));
                this.updateSlice();
            }
        });
    }

    initializeBabylonScene() {
        // Initialize engine with high precision options
        const engineOptions = {
            preserveDrawingBuffer: true,
            stencil: true,
            antialias: true,
            depth: true,
            powerPreference: "high-performance"
        };
        this.engine = new BABYLON.Engine(this.canvas, true, engineOptions, true);

        // Create scene with high precision
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
        this.scene.useRightHandedSystem = true;

        // Create camera
        this.camera = new BABYLON.ArcRotateCamera(
            "camera",
            0,
            Math.PI / 3,
            10,
            BABYLON.Vector3.Zero(),
            this.scene
        );
        this.camera.setTarget(BABYLON.Vector3.Zero());
        this.camera.attachControl(this.canvas, true);

        // Create initial gray material
        const material = new BABYLON.StandardMaterial("cubeMaterial", this.scene);
        material.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        material.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        material.useFloatValues = true;  // Enable high precision values

        // Create a cube
        this.cube = BABYLON.MeshBuilder.CreateBox("cube", {size: 2}, this.scene);
        this.cube.material = material;

        // Add lights for proper visibility
        const hemisphericLight = new BABYLON.HemisphericLight(
            "light",
            new BABYLON.Vector3(0, 1, 0),
            this.scene
        );
        hemisphericLight.intensity = 0.7;

        const pointLight = new BABYLON.PointLight(
            "pointLight",
            new BABYLON.Vector3(0, 4, 0),
            this.scene
        );
        pointLight.intensity = 0.5;

        // Start rendering loop
        this.engine.runRenderLoop(() => {
            this.scene.render();
        });

        // Handle window resize
        window.addEventListener("resize", () => {
            this.engine.resize();
        });
    }

    toggleViewMode() {
        this.is3DMode = !this.is3DMode;
        this.viewModeBtn.classList.toggle("active");
        this.windowLevelBtn.classList.remove("active");

        if (this.is3DMode) {
            // Enable camera controls for 3D mode
            this.camera.attachControl(this.canvas, true);
            // Reset camera position
            this.camera.alpha = 0;
            this.camera.beta = Math.PI / 3;
            this.camera.radius = 10;
        } else {
            // Disable camera controls for 2D mode
            this.camera.detachControl();
            // Set camera to front view
            this.camera.alpha = 0;
            this.camera.beta = 0;
            this.camera.radius = 5;
        }
    }

    toggleWindowLevelMode() {
        this.windowLevelBtn.classList.toggle("active");
        // Additional window/level mode logic will be implemented here
    }

    updateSlice() {
        if (!this.imageData || !this.imageData.length) return;

        // Update the texture with the current slice data
        const currentSliceData = this.imageData[this.currentSlice];
        const binaryString = atob(currentSliceData);
        const len = binaryString.length;
        const pixels = new Float32Array(len / 4);

        // Convert binary string to Float32Array
        for (let i = 0; i < len; i += 4) {
            const value =
                binaryString.charCodeAt(i) |
                (binaryString.charCodeAt(i + 1) << 8) |
                (binaryString.charCodeAt(i + 2) << 16) |
                (binaryString.charCodeAt(i + 3) << 24);
            pixels[i / 4] = new Float32Array(new Uint32Array([value]).buffer)[0];
        }

        // Normalize values to [0,1] range
        const minVal = this.minVal;
        const maxVal = this.maxVal;
        const range = maxVal - minVal;

        const width = this.width;
        const height = this.height;
        const rgbData = new Float32Array(width * height * 3);

        // Convert grayscale to RGB, maintaining high precision
        for (let i = 0; i < pixels.length; i++) {
            const normalizedValue = (pixels[i] - minVal) / range;
            rgbData[i * 3] = normalizedValue;
            rgbData[i * 3 + 1] = normalizedValue;
            rgbData[i * 3 + 2] = normalizedValue;
        }


        this.texture.update(rgbData);

        // Update info display
        const infoElement = this.container.querySelector(".image-info");
        if (infoElement) {
            infoElement.textContent = `Slice: ${this.currentSlice + 1}/${this.totalSlices}`;
        }
    }

    async uploadFile(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${BASE_URL}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const result = await response.json();
            console.log("Upload response:", result);

            if (result.success && result.data) {
                console.log("Upload successful, creating texture...");

                this.imageData = result.data;
                this.totalSlices = this.imageData.length;
                this.currentSlice = 0;
                this.minVal = result.metadata.min_value;
                this.maxVal = result.metadata.max_value;
                this.width = result.metadata.dimensions[0];
                this.height = result.metadata.dimensions[1];

                // Get the first slice of data
                const base64Data = result.data[0];
                console.log("Using base64 data length:", base64Data.length);

                // Create an array buffer from the base64 data
                const binaryString = atob(base64Data);
                const len = binaryString.length;
                const pixels = new Float32Array(len / 4);

                // Convert binary string to Float32Array
                for (let i = 0; i < len; i += 4) {
                    const value =
                        binaryString.charCodeAt(i) |
                        (binaryString.charCodeAt(i + 1) << 8) |
                        (binaryString.charCodeAt(i + 2) << 16) |
                        (binaryString.charCodeAt(i + 3) << 24);
                    pixels[i / 4] = new Float32Array(new Uint32Array([value]).buffer)[0];
                }

                // Normalize values to [0,1] range
                const minVal = this.minVal;
                const maxVal = this.maxVal;
                const range = maxVal - minVal;

                const width = this.width;
                const height = this.height;
                const rgbData = new Float32Array(width * height * 3);

                // Convert grayscale to RGB, maintaining high precision
                for (let i = 0; i < pixels.length; i++) {
                    const normalizedValue = (pixels[i] - minVal) / range;
                    rgbData[i * 3] = normalizedValue;
                    rgbData[i * 3 + 1] = normalizedValue;
                    rgbData[i * 3 + 2] = normalizedValue;
                }

                console.log("Creating texture with dimensions:", width, "x", height);

                this.texture = new BABYLON.RawTexture(
                    rgbData,
                    width,
                    height,
                    BABYLON.Engine.TEXTUREFORMAT_RGB,
                    this.scene,
                    false,
                    false,
                    BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
                    BABYLON.Engine.TEXTURETYPE_FLOAT
                );

                // Create new material with the texture
                const material = new BABYLON.StandardMaterial("texturedMaterial", this.scene);
                material.diffuseTexture = this.texture;
                material.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
                material.useFloatValues = true;

                // Apply material to cube
                this.cube.material = material;

                // Mark viewer as having image
                this.container.classList.add("has-image");

                console.log("Texture creation complete");
                this.updateSlice();
            } else {
                console.error("Upload failed:", result.message);
            }
        } catch (error) {
            console.error("Error uploading file:", error);
        }
    }
}

// Grid layout management (simplified)
class GridManager {
    constructor() {
        this.gridLayout = document.getElementById("gridLayout");
        this.imageGrid = document.getElementById("imageGrid");
        this.viewers = [];
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.gridLayout?.addEventListener("change", () => this.updateGrid());
    }

    updateGrid() {
        const [rows, cols] = this.gridLayout.value.split("x").map(Number);
        const totalCells = rows * cols;

        // Clear existing grid
        this.imageGrid.innerHTML = "";
        this.viewers = [];

        // Update grid layout
        this.imageGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

        // Create new cells
        const template = document.getElementById("imageWindowTemplate");
        for (let i = 0; i < totalCells; i++) {
            const clone = template.content.cloneNode(true);
            const container = clone.querySelector(".image-window");
            this.imageGrid.appendChild(container);
            this.viewers.push(new ImageViewer(container));
        }
    }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
    const gridManager = new GridManager();
    gridManager.updateGrid(); // Initialize with default 1x1 grid
});

// Make ImageViewer available globally
window.ImageViewer = ImageViewer;