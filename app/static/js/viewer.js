const BASE_URL = window.location.origin;

class ImageViewer {
    constructor(container) {
        this.container = container;
        this.imageContainer = container.querySelector(".image-container");

        // Initialize canvas with high precision
        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.outline = "none";
        this.imageContainer.querySelector(".canvas-container").appendChild(this.canvas);

        // Initialize file input
        this.fileInput = container.querySelector(".hidden-file-input");
        this.uploadBtn = container.querySelector(".upload-btn");

        // Setup upload event listeners
        this.setupEventListeners();

        // Initialize Babylon.js scene
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
            console.log("Upload response:", result);  // Debug log

            if (result.success && result.data) {
                console.log("Upload successful, creating texture...");

                // Get the first slice of data (for 2D view)
                const base64Data = result.data[0];
                console.log("Using base64 data length:", base64Data.length);  // Debug log

                // Create an array buffer from the base64 data
                const binaryString = atob(base64Data);
                const len = binaryString.length;
                const bytes = new Float32Array(len / 4);  // 4 bytes per float

                // Convert binary string to Float32Array
                for (let i = 0; i < len; i += 4) {
                    const value = 
                        binaryString.charCodeAt(i) |
                        (binaryString.charCodeAt(i + 1) << 8) |
                        (binaryString.charCodeAt(i + 2) << 16) |
                        (binaryString.charCodeAt(i + 3) << 24);
                    bytes[i / 4] = new Float32Array(new Uint32Array([value]).buffer)[0];
                }

                // Create a raw texture from the float data
                const width = result.metadata.dimensions[0];
                const height = result.metadata.dimensions[1];
                console.log("Creating texture with dimensions:", width, "x", height);  // Debug log

                const texture = new BABYLON.RawTexture(
                    bytes,
                    width,
                    height,
                    BABYLON.Engine.TEXTUREFORMAT_R,
                    this.scene,
                    false,
                    false,
                    BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
                    BABYLON.Engine.TEXTURETYPE_FLOAT
                );

                // Create new material with the texture
                const material = new BABYLON.StandardMaterial("texturedMaterial", this.scene);
                material.diffuseTexture = texture;
                material.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
                material.useFloatValues = true;

                // Apply material to cube
                this.cube.material = material;

                // Mark viewer as having image
                this.container.classList.add("has-image");

                console.log("Texture creation complete");  // Debug log
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