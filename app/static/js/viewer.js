const BASE_URL = "";

class ImageViewer {
    constructor(container, state = null) {
        // Constructor remains the same
        this.container = container;
        this.imageContainer = container.querySelector(".image-container");
        this.imageInfo = container.querySelector(".image-info");
        this.windowCenter = state ? state.windowCenter : 128;
        this.windowWidth = state ? state.windowWidth : 255;
        this.currentSlice = state ? state.currentSlice : 0;
        this.totalSlices = state ? state.totalSlices : 0;
        this.imageId = state ? state.imageId : null;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.currentLabel = state ? state.currentLabel : "";

        // Initialize UI elements
        this.initializeUI();

        // Initialize Babylon.js scene if BABYLON is available
        if (typeof BABYLON !== 'undefined') {
            this.initializeBabylonScene();
        } else {
            console.error('BABYLON is not loaded');
        }

        // Set up event listeners
        this.setupEventListeners();

        // Restore state if provided
        if (state && state.imageId) {
            this.container.classList.add("has-image");
            this.loadSlice(this.currentSlice);
            this.updateWindowingInfo();
        }
    }

    initializeUI() {
        // UI elements initialization
        this.fileInput = this.container.querySelector(".hidden-file-input");
        this.uploadBtn = this.container.querySelector(".upload-btn");
        this.browseBtn = this.container.querySelector(".browse-btn");
        this.rotateLeftBtn = this.container.querySelector(".rotate-left-btn");
        this.rotateRightBtn = this.container.querySelector(".rotate-right-btn");
        this.optimizeWindowBtn = this.container.querySelector(".optimize-window-btn");
        this.windowLevelBtn = this.container.querySelector(".window-level-btn");
        this.toolbar = this.container.querySelector(".toolbar");
    }

    initializeBabylonScene() {
        // Create canvas for Babylon.js
        this.renderCanvas = document.createElement("canvas");
        this.renderCanvas.style.width = "100%";
        this.renderCanvas.style.height = "100%";
        this.imageContainer.appendChild(this.renderCanvas);

        // Initialize Babylon.js engine and scene
        this.engine = new BABYLON.Engine(this.renderCanvas, true);
        this.scene = new BABYLON.Scene(this.engine);

        // Setup camera
        this.camera = new BABYLON.ArcRotateCamera("camera", 0, Math.PI / 2, 10, 
            BABYLON.Vector3.Zero(), this.scene);
        this.camera.attachControl(this.renderCanvas, true);

        // Add basic lighting
        new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);

        // Create shader material for window/level adjustment
        this.createWindowLevelShader();

        // Start rendering loop
        this.engine.runRenderLoop(() => {
            this.scene.render();
        });

        // Handle window resize
        window.addEventListener("resize", () => {
            this.engine.resize();
        });
    }

    createWindowLevelShader() {
        // Custom shader for window/level adjustment
        BABYLON.Effect.ShadersStore["windowLevelVertexShader"] = `
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

        BABYLON.Effect.ShadersStore["windowLevelFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform float windowCenter;
            uniform float windowWidth;
            uniform float dataMin;
            uniform float dataMax;

            void main() {
                float value = texture2D(textureSampler, vUV).r;
                float windowMin = windowCenter - (windowWidth / 2.0);
                float windowMax = windowCenter + (windowWidth / 2.0);

                float normalized;
                if(value <= windowMin) {
                    normalized = 0.0;
                } else if(value >= windowMax) {
                    normalized = 1.0;
                } else {
                    normalized = (value - windowMin) / windowWidth;
                }

                gl_FragColor = vec4(normalized, normalized, normalized, 1.0);
            }
        `;

        // Create shader material
        this.windowLevelMaterial = new BABYLON.ShaderMaterial(
            "windowLevel",
            this.scene,
            {
                vertex: "windowLevel",
                fragment: "windowLevel",
            },
            {
                attributes: ["position", "uv"],
                uniforms: ["worldViewProjection", "windowCenter", "windowWidth", "dataMin", "dataMax"],
                samplers: ["textureSampler"]
            }
        );

        // Set initial values
        this.windowLevelMaterial.setFloat("windowCenter", this.windowCenter);
        this.windowLevelMaterial.setFloat("windowWidth", this.windowWidth);
        this.windowLevelMaterial.setFloat("dataMin", 0);
        this.windowLevelMaterial.setFloat("dataMax", 255);
    }

    setupEventListeners() {
        // Mouse events for window/level adjustment
        this.renderCanvas.addEventListener("mousedown", (e) => {
            if (e.button === 0) { // Left mouse button
                this.isWindowLevelDrag = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        });

        this.renderCanvas.addEventListener("mousemove", (e) => {
            if (this.isWindowLevelDrag) {
                const deltaX = e.clientX - this.lastMouseX;
                const deltaY = this.lastMouseY - e.clientY;

                this.windowWidth = Math.max(1, this.windowWidth + deltaX);
                this.windowCenter += deltaY;

                // Update shader uniforms
                this.windowLevelMaterial.setFloat("windowCenter", this.windowCenter);
                this.windowLevelMaterial.setFloat("windowWidth", this.windowWidth);

                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.updateWindowingInfo();
            }
        });

        this.renderCanvas.addEventListener("mouseup", () => {
            this.isWindowLevelDrag = false;
        });

        this.renderCanvas.addEventListener("mouseleave", () => {
            this.isWindowLevelDrag = false;
        });

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

        // Rotation buttons
        this.rotateLeftBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.container.classList.contains("has-image")) {
                this.rotation = (this.rotation - 90) % 360;
                //this.applyWindowLevel(); //No longer needed with Babylon.js
            }
        });

        this.rotateRightBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.container.classList.contains("has-image")) {
                this.rotation = (this.rotation + 90) % 360;
                //this.applyWindowLevel(); //No longer needed with Babylon.js
            }
        });


        // Menu button click
        const menuBtn = this.container.querySelector(".menu-btn");
        const menuContainer = this.container.querySelector(".menu-container");

        menuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            menuContainer.classList.toggle("show");
        });

        // Close menu when clicking outside
        document.addEventListener("click", () => {
            menuContainer.classList.remove("show");
        });

        // Menu items click
        const menuItems = this.container.querySelectorAll(".menu-item");
        menuItems.forEach(item => {
            item.addEventListener("click", (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                menuContainer.classList.remove("show");  // Close menu after selection

                switch (action) {
                    case "upload":
                        this.fileInput.click();
                        break;
                    case "browse":
                        const modal = document.getElementById("urlImportModal");
                        modal.classList.add("show");
                        const currentPath = document.getElementById("currentPath");
                        if (this.lastBrowsePath && this.lastBrowsePath !== currentPath.textContent) {
                            currentPath.textContent = this.lastBrowsePath;
                        }
                        this.importFromUrl();
                        break;
                    case "rotate-left":
                        if (this.container.classList.contains("has-image")) {
                            this.rotation = (this.rotation - 90) % 360;
                            //this.applyWindowLevel(); //No longer needed with Babylon.js
                        }
                        break;
                    case "rotate-right":
                        if (this.container.classList.contains("has-image")) {
                            this.rotation = (this.rotation + 90) % 360;
                            //this.applyWindowLevel(); //No longer needed with Babylon.js
                        }
                        break;
                    case "optimize-window":
                        if (this.container.classList.contains("has-image")) {
                            this.mode = "roi";
                            this.optimizeWindowBtn.classList.add("active");
                            this.windowLevelBtn.classList.remove("active");
                            this.roiCanvas.classList.add("active");
                            this.clearROI();
                        }
                        break;
                    case "window-level":
                        if (this.container.classList.contains("has-image")) {
                            this.mode = "window-level";
                            this.windowLevelBtn.classList.add("active");
                            this.optimizeWindowBtn.classList.remove("active");
                            this.roiCanvas.classList.remove("active");
                            this.clearROI();
                        }
                        break;
                }
            });
        });

        // File input change
        this.fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                this.uploadFile(file);
            }
        });

        // Mouse wheel for slice navigation
        this.renderCanvas.addEventListener("wheel", (e) => { // Changed event target
            if (!this.container.classList.contains("has-image")) return;
            e.preventDefault();
            if (this.totalSlices <= 1) return;

            if (e.deltaY < 0) {
                this.currentSlice = Math.min(
                    this.currentSlice + 1,
                    this.totalSlices - 1,
                );
            } else {
                this.currentSlice = Math.max(this.currentSlice - 1, 0);
            }

            this.updateSliceInfo();
            this.loadSlice(this.currentSlice);
        });
    }

    async loadSlice(sliceNumber) {
        if (!this.slices || !this.slices.length) return;
        this.currentSlice = sliceNumber;

        try {
            const texture = new BABYLON.Texture(this.slices[sliceNumber], this.scene);
            this.windowLevelMaterial.setTexture("textureSampler", texture);

            // Create or update the display plane
            if (!this.displayPlane) {
                this.displayPlane = BABYLON.MeshBuilder.CreatePlane("imagePlane", 
                    { width: 1, height: 1 }, this.scene);
                this.displayPlane.material = this.windowLevelMaterial;
            }

            this.updateWindowingInfo();
        } catch (error) {
            console.error("Error loading slice:", error);
        }
    }

    updateWindowingInfo() {
        if (this.imageInfo) {
            this.imageInfo.textContent = `Window: C: ${Math.round(this.windowCenter)} W: ${Math.round(this.windowWidth)} | Slice: ${this.currentSlice + 1}/${this.totalSlices}`;
        }
    }

    async uploadFile(file) {
        try {
            // Read file as binary data
            const binaryData = await file.arrayBuffer();

            // Create a new Blob with the binary data
            const blob = new Blob([binaryData], { type: file.type || 'application/octet-stream' });

            // Create FormData and append the blob as a file
            const formData = new FormData();
            formData.append('file', blob, file.name);

            const response = await fetch(`${BASE_URL}/upload`, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server error response:', errorText);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            const data = await response.json();

            if (data.status === "success" && data.slices && data.slices.length > 0) {
                this.slices = data.slices;
                this.totalSlices = data.total_slices;
                this.currentSlice = 0;
                this.imageId = data.image_id;
                this.windowWidth = data.window_width;
                this.windowCenter = data.window_center;
                this.dataMin = data.data_min;
                this.dataMax = data.data_max;
                this.bitDepth = data.bit_depth || 8; // Get bit depth from server
                this.maxValue = Math.pow(2, this.bitDepth) - 1;
                this.loadSlice(this.currentSlice);
                this.updateWindowingInfo();
                this.container.classList.add("has-image");

                // Add the dropdown after successful upload
                this.addImageLabelDropdown();
            } else {
                const errorMessage = data.message || "Failed to process image";
                console.error("Upload failed:", errorMessage);
                this.showError(errorMessage);
            }
        } catch (error) {
            console.error("Error uploading file:", error);
            this.showError(`Upload failed: ${error.message}`);
        }
    }

    showError(message) {
        // Remove any existing error messages
        const existingErrors =
            this.container.querySelectorAll(".error-message");
        existingErrors.forEach((error) => error.remove());

        // Add error message to the container
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
            text-align: center;
            max-width: 80%;
            word-wrap: break-word;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        this.container.appendChild(errorDiv);

        // Remove the error message after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode === this.container) {
                errorDiv.remove();
            }
        }, 5000);
    }

    // Placeholder functions -  These need to be implemented or removed depending on the actual functionality
    addImageLabelDropdown() {}
    applyWindowLevel() {}
    applyWindow() {}
    drawROI() {}
    clearROI() {}
    optimizeWindowFromROI() {}
    importFromUrl() {}
    updateDirectoryList() {}
    updateSliceInfo() {}


    getState() {
        return {
            windowCenter: this.windowCenter,
            windowWidth: this.windowWidth,
            currentSlice: this.currentSlice,
            totalSlices: this.totalSlices,
            imageId: this.imageId,
            slices: this.slices,
            rotation: this.rotation,
            currentLabel: this.currentLabel,
            bitDepth: this.bitDepth,
            dataMin: this.dataMin,
            dataMax: this.dataMax
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
        this.gridLayout.addEventListener("change", () => this.updateGrid());
    }

    updateGrid() {
        const [rows, cols] = this.gridLayout.value.split("x").map(Number);
        const totalCells = rows * cols;

        // Save states of existing viewers
        const existingStates = this.viewers.map((viewer) => viewer.getState());

        // Clear existing grid
        this.imageGrid.innerHTML = "";
        this.viewers = [];

        // Update grid layout
        this.imageGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

        // Create new cells using the template
        const template = document.getElementById("imageWindowTemplate");
        for (let i = 0; i < totalCells; i++) {
            // Clone the template content
            const clone = template.content.cloneNode(true);
            const container = clone.querySelector(".image-window");

            // Append the cloned container to the grid
            this.imageGrid.appendChild(container);

            // Create new viewer for this cell with the saved state
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