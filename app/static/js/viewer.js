const BASE_URL = window.location.origin;

class ImageViewer {
    constructor(container, state = null) {
        this.container = container;
        this.imageContainer = container.querySelector(".image-container");
        this.imageInfo = container.querySelector(".image-info");
        this.windowCenter = state ? state.windowCenter : 128;
        this.windowWidth = state ? state.windowWidth : 255;
        this.currentSlice = state ? state.currentSlice : 0;
        this.totalSlices = state ? state.totalSlices : 0;
        this.imageType = state ? state.imageType : null;
        this.dimensions = state ? state.dimensions : null;
        this.imageId = state ? state.imageId : null;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.isDragging = false;
        this.currentLabel = state ? state.currentLabel : "";
        this.rotation = 0;
        this.currentFilename = null;
        this.volumeData = null;
        this.minValue = 0;
        this.maxValue = 255;
        this.normalizedData = null; 

        // Initialize Babylon.js components
        this.engine = null;
        this.scene = null;
        this.camera = null;
        this.texture = null;

        // Initialize UI elements
        this.initializeUI();

        // Set up event listeners
        this.setupEventListeners();

        // Initialize Babylon.js scene
        this.initializeBabylonScene();
    }

    initializeUI() {
        this.fileInput = this.container.querySelector(".hidden-file-input");
        this.uploadBtn = this.container.querySelector(".upload-btn");
        this.browseBtn = this.container.querySelector(".browse-btn");
        this.rotateLeftBtn = this.container.querySelector(".rotate-left-btn");
        this.rotateRightBtn = this.container.querySelector(".rotate-right-btn");
        this.optimizeWindowBtn = this.container.querySelector(".optimize-window-btn");
        this.windowLevelBtn = this.container.querySelector(".window-level-btn");
        this.toolbar = this.container.querySelector(".toolbar");

        // Create canvas for Babylon.js
        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.outline = "none";
        this.imageContainer.querySelector(".canvas-container").appendChild(this.canvas);
    }

    initializeBabylonScene() {
        // Initialize Babylon.js engine and scene
        this.engine = new BABYLON.Engine(this.canvas, true);
        this.scene = new BABYLON.Scene(this.engine);

        // Create orthographic camera for 2D viewing
        this.camera = new BABYLON.ArcRotateCamera("camera", 0, 0, 10, BABYLON.Vector3.Zero(), this.scene);
        this.camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
        this.camera.minZ = 0.1;
        this.camera.maxZ = 100;

        // Set orthographic scale
        const aspectRatio = this.canvas.width / this.canvas.height;
        this.camera.orthoTop = 2;
        this.camera.orthoBottom = -2;
        this.camera.orthoLeft = -2 * aspectRatio;
        this.camera.orthoRight = 2 * aspectRatio;

        // Lock camera movement
        this.camera.lowerBetaLimit = 0;
        this.camera.upperBetaLimit = 0;
        this.camera.lowerAlphaLimit = 0;
        this.camera.upperAlphaLimit = 0;
        this.camera.allowUpsideDown = false;
        this.camera.pinchPrecision = 0;
        this.camera.wheelPrecision = 0;
        this.camera.panningSensibility = 0;

        // Create a plane to display the image
        const plane = BABYLON.MeshBuilder.CreatePlane("plane", {width: 4, height: 4}, this.scene);
        plane.position = new BABYLON.Vector3(0, 0, 0);

        // Create custom shader material for window/level adjustment
        const shaderMaterial = new BABYLON.ShaderMaterial("shader", this.scene, {
            vertex: "custom",
            fragment: "custom",
        }, {
            attributes: ["position", "normal", "uv"],
            uniforms: ["world", "worldView", "worldViewProjection", "view", "projection", "windowCenter", "windowWidth", "minValue", "maxValue"]
        });

        // Set shader code
        BABYLON.Effect.ShadersStore["customVertexShader"] = `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            uniform mat4 worldViewProjection;
            varying vec2 vUV;
            void main() {
                gl_Position = worldViewProjection * vec4(position, 1.0);
                vUV = uv;
            }
        `;

        BABYLON.Effect.ShadersStore["customFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform float windowCenter;
            uniform float windowWidth;
            uniform float minValue;
            uniform float maxValue;

            void main() {
                float value = texture2D(textureSampler, vUV).r;

                // Normalize the value to [0,1] range using data range
                float normalizedValue = (value - minValue) / (maxValue - minValue);

                // Apply window/level adjustment
                float windowMin = (windowCenter - windowWidth/2.0 - minValue) / (maxValue - minValue);
                float windowMax = (windowCenter + windowWidth/2.0 - minValue) / (maxValue - minValue);
                float displayValue = (normalizedValue - windowMin) / (windowMax - windowMin);
                displayValue = clamp(displayValue, 0.0, 1.0);

                gl_FragColor = vec4(displayValue, displayValue, displayValue, 1.0);
            }
        `;

        plane.material = shaderMaterial;

        // Disable all scene interaction except what we explicitly handle
        this.scene.detachControl();

        // Start rendering loop
        this.engine.runRenderLoop(() => {
            this.scene.render();
        });

        // Handle window resize
        window.addEventListener("resize", () => {
            this.engine.resize();
            const aspectRatio = this.canvas.width / this.canvas.height;
            this.camera.orthoTop = 2;
            this.camera.orthoBottom = -2;
            this.camera.orthoLeft = -2 * aspectRatio;
            this.camera.orthoRight = 2 * aspectRatio;
        });
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

        // Mouse events for window/level adjustment
        this.imageContainer?.addEventListener("mousedown", (e) => {
            if (!this.container.classList.contains("has-image")) return;
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        document.addEventListener("mousemove", (e) => {
            if (!this.isDragging) return;

            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;

            // Calculate new window/level values based on mouse movement
            // Adjust window width with horizontal movement
            this.windowWidth = Math.max(1, this.windowWidth + deltaX);

            // Adjust window center with vertical movement
            this.windowCenter += deltaY;

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            // Prevent any default dragging behavior
            e.preventDefault();
            e.stopPropagation();

            this.updateWindowingInfo();
            this.updateShaderParameters();
        });

        document.addEventListener("mouseup", () => {
            this.isDragging = false;
        });

        // Mouse wheel for slice navigation
        this.imageContainer?.addEventListener("wheel", (e) => {
            if (!this.container.classList.contains("has-image")) return;
            e.preventDefault();
            if (this.totalSlices <= 1) return;

            if (e.deltaY < 0) {
                this.currentSlice = Math.min(this.currentSlice + 1, this.totalSlices - 1);
            } else {
                this.currentSlice = Math.max(this.currentSlice - 1, 0);
            }

            this.updateWindowingInfo();
            this.updateTexture();
        });

        // Handle drag and drop
        const dropZone = this.container.querySelector(".image-container");
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.container.classList.add('drag-over');
            });

            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.container.classList.remove('drag-over');
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.container.classList.remove('drag-over');

                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.uploadFile(files[0]);
                }
            });
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
            if (result.success) {
                this.container.classList.add("has-image");
                this.currentFilename = file.name;

                if (result.metadata) {
                    this.totalSlices = result.metadata.total_slices;
                    this.currentSlice = 0;
                    this.dimensions = result.metadata.dimensions;
                    this.imageType = result.metadata.type;
                    this.minValue = result.metadata.min_value;
                    this.maxValue = result.metadata.max_value;

                    this.updateWindowingInfo();

                    if (result.data) {
                        this.volumeData = result.data.map(slice => {
                            const buffer = new Uint8Array(atob(slice).split('').map(c => c.charCodeAt(0)));
                            return new Float32Array(buffer.buffer);
                        });

                        this.updateTexture();
                    }
                }
            } else {
                this.showError(result.message || "Upload failed");
            }
        } catch (error) {
            console.error("Error uploading file:", error);
            this.showError(error.message);
        }
    }

    updateTexture() {
        if (!this.volumeData || !this.volumeData[this.currentSlice]) {
            console.error("No volume data available");
            return;
        }

        console.log("Updating texture...");
        console.log("Dimensions:", this.dimensions);
        console.log("Data size:", this.volumeData[this.currentSlice].length);
        console.log("First few values:", this.volumeData[this.currentSlice].slice(0, 10));

        const width = this.dimensions[0];
        const height = this.dimensions[1];
        const data = this.volumeData[this.currentSlice];

        // Initialize window/level based on data range if not already set
        if (this.windowCenter === 128 && this.windowWidth === 255) {
            this.windowCenter = (this.maxValue + this.minValue) / 2;
            this.windowWidth = this.maxValue - this.minValue;
            console.log("Setting initial window/level:", {
                center: this.windowCenter,
                width: this.windowWidth,
                min: this.minValue,
                max: this.maxValue
            });
        }

        if (this.texture) {
            this.texture.dispose();
        }

        // Create raw texture with float data
        this.texture = new BABYLON.RawTexture(
            data,
            width,
            height,
            BABYLON.Engine.TEXTUREFORMAT_R,
            this.scene,
            false,
            false,
            BABYLON.Texture.NEAREST_SAMPLINGMODE,
            BABYLON.Engine.TEXTURETYPE_FLOAT
        );

        console.log("Texture created successfully");

        // Update material
        const material = this.scene.getMaterialByName("shader");
        if (material) {
            console.log("Updating material with texture");
            material.setTexture("textureSampler", this.texture);
            this.updateShaderParameters();
        } else {
            console.error("Material not found");
        }
    }

    updateShaderParameters() {
        const material = this.scene.getMaterialByName("shader");
        if (material) {
            material.setFloat("windowCenter", this.windowCenter);
            material.setFloat("windowWidth", this.windowWidth);
            material.setFloat("minValue", this.minValue);
            material.setFloat("maxValue", this.maxValue);
        }
    }

    updateWindowingInfo() {
        if (this.imageInfo) {
            const sliceInfo = this.totalSlices > 1 ?
                `Slice: ${this.currentSlice + 1}/${this.totalSlices}` :
                "Single Image";

            const dimensionsInfo = this.dimensions ?
                ` | ${this.dimensions[0]}x${this.dimensions[1]}` :
                "";

            const windowInfo = `Window: C: ${Math.round(this.windowCenter)} W: ${Math.round(this.windowWidth)}`;

            this.imageInfo.textContent = `${this.imageType?.toUpperCase() || 'IMAGE'} | ${windowInfo} | ${sliceInfo}${dimensionsInfo}`;
        }
    }

    showError(message) {
        const errorDiv = document.createElement("div");
        errorDiv.className = "error-message";
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(220, 53, 69, 0.9);
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 1000;
        `;
        this.container.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 3000);
    }

    getState() {
        return {
            windowCenter: this.windowCenter,
            windowWidth: this.windowWidth,
            currentSlice: this.currentSlice,
            totalSlices: this.totalSlices,
            imageId: this.imageId,
            rotation: this.rotation,
            currentLabel: this.currentLabel,
            imageType: this.imageType,
            dimensions: this.dimensions
        };
    }
}

// Grid layout management
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

        // Save states of existing viewers
        const existingStates = this.viewers.map(viewer => viewer.getState());

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

            const state = i < existingStates.length ? existingStates[i] : null;
            this.viewers.push(new ImageViewer(container, state));
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