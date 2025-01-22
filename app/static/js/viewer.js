const BASE_URL = window.location.origin;

class ImageViewer {
    constructor(container) {
        this.container = container;
        this.imageContainer = container.querySelector(".image-container");
        this.is3DMode = true;
        this.currentSlice = 0;
        this.totalSlices = 1;
        this.windowCenter = 128;
        this.windowWidth = 256;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.rotation = 0;
        this.isDrawingROI = false;
        this.roiStart = null;
        this.roiEnd = null;

        // Initialize 2D canvas
        this.canvas2D = document.createElement("canvas");
        this.ctx2D = this.canvas2D.getContext("2d");
        this.canvas2D.style.width = "100%";
        this.canvas2D.style.height = "100%";
        this.canvas2D.style.position = "absolute";
        this.canvas2D.style.top = "0";
        this.canvas2D.style.left = "0";
        this.canvas2D.style.display = "none"; // Initially hidden
        this.canvas2D.style.userSelect = "none"; // Prevent text selection
        this.imageContainer.querySelector(".canvas-container").appendChild(this.canvas2D);

        // Initialize 3D canvas
        this.canvas3D = document.createElement("canvas");
        this.canvas3D.style.width = "100%";
        this.canvas3D.style.height = "100%";
        this.canvas3D.style.position = "absolute";
        this.canvas3D.style.top = "0";
        this.canvas3D.style.left = "0";
        this.canvas3D.style.userSelect = "none"; // Prevent text selection
        this.imageContainer.querySelector(".canvas-container").appendChild(this.canvas3D);

        // ROI canvas
        this.roiCanvas = document.createElement("canvas");
        this.roiCtx = this.roiCanvas.getContext("2d");
        this.roiCanvas.style.width = "100%";
        this.roiCanvas.style.height = "100%";
        this.roiCanvas.style.position = "absolute";
        this.roiCanvas.style.top = "0";
        this.roiCanvas.style.left = "0";
        this.roiCanvas.style.pointerEvents = "none";
        this.roiCanvas.style.display = "none"; // Initially hidden
        this.roiCanvas.style.userSelect = "none"; // Prevent text selection
        this.imageContainer.querySelector(".canvas-container").appendChild(this.roiCanvas);

        // Get upload overlay reference
        this.uploadOverlay = this.container.querySelector(".upload-overlay");

        // Initialize buttons and inputs
        this.fileInput = container.querySelector(".hidden-file-input");
        this.uploadBtn = container.querySelector(".upload-btn");
        this.viewModeBtn = container.querySelector(".view-mode-btn");
        this.windowLevelBtn = container.querySelector(".window-level-btn");
        this.optimizeWindowBtn = container.querySelector(".optimize-window-btn");
        this.rotateLeftBtn = container.querySelector(".rotate-left-btn");
        this.rotateRightBtn = container.querySelector(".rotate-right-btn");
        this.menuBtn = container.querySelector(".menu-btn");
        this.menuDropdown = container.querySelector(".menu-dropdown");
        this.browseBtn = container.querySelector('.browse-btn'); // Added browse button

        this.pixelCache = new Map(); // Cache for processed pixel data
        this.wheelThrottleTimeout = null;
        this.isProcessingWheel = false;

        // Initialize modal references
        this.urlImportModal = document.getElementById('urlImportModal');
        this.directoryList = document.getElementById('directoryList');
        this.currentPathElement = document.getElementById('currentPath');


        this.setupEventListeners();
        this.initializeBabylonScene();
    }

    setupEventListeners() {
        // File upload handling
        this.uploadBtn?.addEventListener("click", () => {
            console.log("Upload button clicked");
            this.fileInput?.click();
        });

        this.fileInput?.addEventListener("change", (e) => {
            console.log("File input changed");
            const file = e.target.files[0];
            if (file) {
                this.uploadFile(file);
            }
        });

        // View mode toggle
        this.viewModeBtn?.addEventListener("click", () => {
            console.log("View mode button clicked");
            this.toggleViewMode();
        });

        // Window level toggle
        this.windowLevelBtn?.addEventListener("click", () => {
            console.log("Window level button clicked");
            this.toggleWindowLevelMode();
        });

        // Optimize window with ROI
        this.optimizeWindowBtn?.addEventListener("click", () => {
            console.log("Optimize window button clicked");
            this.toggleOptimizeWindow();
        });

        // Rotation buttons
        this.rotateLeftBtn?.addEventListener("click", () => {
            console.log("Rotate left button clicked");
            this.rotate(-90);
        });

        this.rotateRightBtn?.addEventListener("click", () => {
            console.log("Rotate right button clicked");
            this.rotate(90);
        });

        // Menu button handling
        this.menuBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            const menuContainer = this.menuBtn.closest('.menu-container');
            menuContainer.classList.toggle('show');
        });

        // Handle menu item clicks
        this.menuDropdown?.addEventListener("click", (e) => {
            const action = e.target.dataset.action;
            if (action) {
                e.preventDefault();
                e.stopPropagation();

                // Hide menu after action
                const menuContainer = this.menuBtn.closest('.menu-container');
                menuContainer.classList.remove('show');

                // Execute corresponding action
                switch (action) {
                    case 'toggle-view':
                        this.toggleViewMode();
                        break;
                    case 'window-level':
                        this.toggleWindowLevelMode();
                        break;
                    case 'optimize-window':
                        this.toggleOptimizeWindow();
                        break;
                    case 'rotate-left':
                        this.rotate(-90);
                        break;
                    case 'rotate-right':
                        this.rotate(90);
                        break;
                    case 'upload-file':
                        this.fileInput?.click();
                        break;
                    case 'browse-remote':
                        this.showDirectoryBrowser();
                        break;
                }
            }
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.menu-container')) {
                const menuContainers = document.querySelectorAll('.menu-container');
                menuContainers.forEach(container => container.classList.remove('show'));
            }
        });

        // ROI selection
        this.roiCanvas.addEventListener("mousedown", (e) => {
            if (this.optimizeWindowBtn.classList.contains("active")) {
                this.isDrawingROI = true;
                const rect = this.roiCanvas.getBoundingClientRect();
                this.roiStart = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };
                e.stopPropagation(); // Only stop propagation for mouse events
            }
        });

        this.roiCanvas.addEventListener("mousemove", (e) => {
            if (this.isDrawingROI) {
                const rect = this.roiCanvas.getBoundingClientRect();
                this.roiEnd = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };
                this.drawROI();
                e.stopPropagation(); // Only stop propagation for mouse events
            }
        });

        this.roiCanvas.addEventListener("mouseup", (e) => {
            if (this.isDrawingROI) {
                this.isDrawingROI = false;
                this.optimizeWindowFromROI();
                e.stopPropagation(); // Only stop propagation for mouse events
            }
        });

        // Mouse wheel for slice navigation - Keep at container level and ensure it works independent of tool state
        this.imageContainer.addEventListener("wheel", (e) => {
            if (!this.is3DMode && this.totalSlices > 1) {
                e.preventDefault();

                if (this.isProcessingWheel) {
                    return;
                }

                this.isProcessingWheel = true;
                const delta = Math.sign(e.deltaY);
                const newSlice = Math.max(0, Math.min(this.totalSlices - 1, this.currentSlice + delta));

                if (newSlice !== this.currentSlice) {
                    this.currentSlice = newSlice;
                    console.log(`Navigating to slice ${this.currentSlice + 1}/${this.totalSlices}`);
                    this.updateSlice().then(() => {
                        this.isProcessingWheel = false;
                    });
                } else {
                    this.isProcessingWheel = false;
                }
            }
        }, { passive: false }); // Ensure wheel events are captured

        // Window/Level drag handling
        this.canvas2D.addEventListener("mousedown", (e) => {
            if (!this.is3DMode && this.windowLevelBtn.classList.contains("active")) {
                console.log("Starting window/level adjustment");
                this.isDragging = true;
                this.dragStart = { x: e.clientX, y: e.clientY };
                this.startWindowCenter = this.windowCenter;
                this.startWindowWidth = this.windowWidth;
                e.preventDefault();
            }
        });

        this.canvas2D.addEventListener("mousemove", (e) => {
            if (this.isDragging && this.windowLevelBtn.classList.contains("active")) {
                this.handleWindowLevelDrag(e);
                e.preventDefault();
            }
        });

        this.canvas2D.addEventListener("mouseup", () => {
            this.isDragging = false;
        });

        this.canvas2D.addEventListener("mouseleave", () => {
            this.isDragging = false;
        });

        // Handle window resize
        window.addEventListener("resize", () => {
            this.resizeCanvases();
        });

        // Browse button click handler
        this.browseBtn?.addEventListener("click", () => {
            console.log("Browse button clicked");
            this.showDirectoryBrowser();
        });

        // Close modal when clicking cancel
        const cancelBtn = this.urlImportModal?.querySelector('.cancel-btn');
        cancelBtn?.addEventListener('click', () => {
            this.urlImportModal.classList.remove('show');
        });
    }

    resizeCanvases() {
        const container = this.imageContainer.querySelector(".canvas-container");
        const rect = container.getBoundingClientRect();

        // Resize all canvases
        [this.canvas2D, this.canvas3D, this.roiCanvas].forEach(canvas => {
            canvas.width = rect.width;
            canvas.height = rect.height;
        });

        if (!this.is3DMode) {
            this.updateSlice();
        }
        if (this.engine) {
            this.engine.resize();
        }
    }

    toggleViewMode() {
        this.is3DMode = !this.is3DMode;
        console.log(`Switching to ${this.is3DMode ? '3D' : '2D'} mode`);

        // Toggle visibility of canvases
        this.canvas2D.style.display = this.is3DMode ? 'none' : 'block';
        this.canvas3D.style.display = this.is3DMode ? 'block' : 'none';
        this.roiCanvas.style.display = this.is3DMode ? 'none' : 'block';

        // Update pointer events
        this.canvas2D.style.pointerEvents = this.is3DMode ? 'none' : 'auto';
        this.canvas3D.style.pointerEvents = this.is3DMode ? 'auto' : 'none';

        this.viewModeBtn.classList.toggle("active");
        this.windowLevelBtn.classList.remove("active");
        this.optimizeWindowBtn.classList.remove("active");

        if (this.is3DMode) {
            this.camera.attachControl(this.canvas3D, true);
            if (this.imageData) {
                this.updateTexture();
            }
        } else {
            this.camera.detachControl();
            this.resizeCanvases();
            this.updateSlice();
        }
    }

    toggleWindowLevelMode() {
        if (!this.is3DMode) {
            console.log("Toggling window/level mode");
            this.windowLevelBtn.classList.toggle("active");
            this.optimizeWindowBtn.classList.remove("active");
            this.canvas2D.style.cursor = this.windowLevelBtn.classList.contains("active") ? "crosshair" : "default";
            this.roiCanvas.style.pointerEvents = "none";
        }
    }

    toggleOptimizeWindow() {
        if (!this.is3DMode) {
            console.log("Toggling optimize window mode");
            this.optimizeWindowBtn.classList.toggle("active");
            this.windowLevelBtn.classList.remove("active");

            // Configure ROI canvas for drawing while allowing wheel events to pass through
            if (this.optimizeWindowBtn.classList.contains("active")) {
                this.roiCanvas.style.pointerEvents = "auto";
                // Only capture mouse events, not wheel events
                this.roiCanvas.style.touchAction = "none";
                this.roiCanvas.style.zIndex = "1";
            } else {
                this.roiCanvas.style.pointerEvents = "none";
                this.roiCanvas.style.touchAction = "auto";
                this.roiCanvas.style.zIndex = "0";
            }
            this.canvas2D.style.cursor = "default";
        }
    }

    handleWindowLevelDrag(e) {
        if (!this.isDragging) return;

        const dx = e.clientX - this.dragStart.x;
        const dy = this.dragStart.y - e.clientY;

        // Scale the adjustments based on the image's data range
        const windowWidthScale = (this.maxVal - this.minVal) / 500; // Adjust window over 500 pixels
        const windowCenterScale = (this.maxVal - this.minVal) / 500; // Adjust center over 500 pixels

        this.windowWidth = Math.max(1, this.startWindowWidth + dx * windowWidthScale);
        this.windowCenter = this.startWindowCenter + dy * windowCenterScale;

        // Clamp window center between min and max values
        this.windowCenter = Math.max(this.minVal, Math.min(this.maxVal, this.windowCenter));

        console.log(`Window/Level adjusted - C: ${this.windowCenter}, W: ${this.windowWidth}`);
        this.updateSlice();
    }

    rotate(degrees) {
        if (!this.is3DMode) {
            this.rotation = (this.rotation + degrees) % 360;
            console.log(`Rotating image by ${degrees} degrees (total: ${this.rotation})`);
            this.updateSlice();
        }
    }

    async loadSliceData(sliceIndex) {
        if (this.pixelCache.has(sliceIndex)) {
            return this.pixelCache.get(sliceIndex);
        }

        const sliceData = this.imageData[sliceIndex];
        const binaryString = atob(sliceData);
        const pixels = new Float32Array(binaryString.length / 4);

        for (let i = 0; i < binaryString.length; i += 4) {
            const value =
                binaryString.charCodeAt(i) |
                (binaryString.charCodeAt(i + 1) << 8) |
                (binaryString.charCodeAt(i + 2) << 16) |
                (binaryString.charCodeAt(i + 3) << 24);
            pixels[i / 4] = new Float32Array(new Uint32Array([value]).buffer)[0];
        }

        this.pixelCache.set(sliceIndex, pixels);
        return pixels;
    }

    async updateSlice() {
        if (!this.imageData || !this.imageData.length) return;

        if (this.is3DMode) {
            this.updateTexture();
            return;
        }

        // Load and process pixel data
        const pixels = await this.loadSliceData(this.currentSlice);

        // Create a temporary canvas for processing
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.width;
        tempCanvas.height = this.height;
        const tempCtx = tempCanvas.getContext('2d');

        // Create ImageData with window/level applied
        const imageData = new ImageData(this.width, this.height);
        const data = imageData.data;

        // Pre-compute window/level values
        const low = this.windowCenter - this.windowWidth / 2;
        const high = this.windowCenter + this.windowWidth / 2;
        const range = high - low;
        const scale = 255 / range;

        // Optimize pixel processing loop
        const length = pixels.length;
        for (let i = 0; i < length; i++) {
            const value = pixels[i];
            const normalizedValue = Math.max(0, Math.min(1, (value - low) / range));
            const pixelValue = Math.round(normalizedValue * 255);
            const index = i << 2; // Multiply by 4 using bit shift
            data[index] = pixelValue;     // R
            data[index + 1] = pixelValue; // G
            data[index + 2] = pixelValue; // B
            data[index + 3] = 255;        // A
        }

        // Put the processed image data on the temporary canvas
        tempCtx.putImageData(imageData, 0, 0);

        // Use requestAnimationFrame for smooth rendering
        requestAnimationFrame(() => {
            // Clear the main canvas
            this.ctx2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);

            // Handle rotation if needed
            if (this.rotation !== 0) {
                this.ctx2D.save();
                this.ctx2D.translate(this.canvas2D.width / 2, this.canvas2D.height / 2);
                this.ctx2D.rotate(this.rotation * Math.PI / 180);
                this.ctx2D.translate(-this.canvas2D.width / 2, -this.canvas2D.height / 2);
            }

            // Draw the image centered and scaled
            const scale = Math.min(this.canvas2D.width / this.width, this.canvas2D.height / this.height);
            const x = (this.canvas2D.width - this.width * scale) / 2;
            const y = (this.canvas2D.height - this.height * scale) / 2;

            this.ctx2D.drawImage(tempCanvas, x, y, this.width * scale, this.height * scale);

            if (this.rotation !== 0) {
                this.ctx2D.restore();
            }

            // Update info display
            const infoElement = this.container.querySelector(".image-info");
            if (infoElement) {
                infoElement.textContent = `Window: C: ${Math.round(this.windowCenter)} W: ${Math.round(this.windowWidth)} | Slice: ${this.currentSlice + 1}/${this.totalSlices}`;
            }
        });
    }

    drawROI() {
        if (!this.roiStart || !this.roiEnd) return;

        this.roiCtx.clearRect(0, 0, this.roiCanvas.width, this.roiCanvas.height);
        this.roiCtx.strokeStyle = 'yellow';
        this.roiCtx.lineWidth = 2;

        const width = this.roiEnd.x - this.roiStart.x;
        const height = this.roiEnd.y - this.roiStart.y;

        this.roiCtx.strokeRect(
            this.roiStart.x,
            this.roiStart.y,
            width,
            height
        );
    }

    optimizeWindowFromROI() {
        if (!this.roiStart || !this.roiEnd) return;

        // Convert ROI coordinates to image coordinates
        const scaleX = this.width / this.canvas2D.width;
        const scaleY = this.height / this.canvas2D.height;

        const x1 = Math.floor(Math.min(this.roiStart.x, this.roiEnd.x) * scaleX);
        const y1 = Math.floor(Math.min(this.roiStart.y, this.roiEnd.y) * scaleY);
        const x2 = Math.floor(Math.max(this.roiStart.x, this.roiEnd.x) * scaleX);
        const y2 = Math.floor(Math.max(this.roiStart.y, this.roiEnd.y) * scaleY);

        // Get pixel data from current slice
        const currentSliceData = this.imageData[this.currentSlice];
        const binaryString = atob(currentSliceData);
        const pixels = new Float32Array(binaryString.length / 4);

        for (let i = 0; i < binaryString.length; i += 4) {
            const value =
                binaryString.charCodeAt(i) |
                (binaryString.charCodeAt(i + 1) << 8) |
                (binaryString.charCodeAt(i + 2) << 16) |
                (binaryString.charCodeAt(i + 3) << 24);
            pixels[i / 4] = new Float32Array(new Uint32Array([value]).buffer)[0];
        }

        // Calculate min and max within ROI
        let min = Infinity;
        let max = -Infinity;

        for (let y = y1; y < y2; y++) {
            for (let x = x1; x < x2; x++) {
                const value = pixels[y * this.width + x];
                min = Math.min(min, value);
                max = Math.max(max, value);
            }
        }

        // Update window/level based on ROI
        this.windowCenter = (min + max) / 2;
        this.windowWidth = max - min;

        // Clear ROI and update display
        this.roiCtx.clearRect(0, 0, this.roiCanvas.width, this.roiCanvas.height);
        this.roiStart = null;
        this.roiEnd = null;

        this.updateSlice();
    }

    updateTexture() {
        if (!this.imageData || !this.imageData.length) return;

        const currentSliceData = this.imageData[this.currentSlice];
        const binaryString = atob(currentSliceData);
        const pixels = new Float32Array(binaryString.length / 4);

        for (let i = 0; i < binaryString.length; i += 4) {
            const value =
                binaryString.charCodeAt(i) |
                (binaryString.charCodeAt(i + 1) << 8) |
                (binaryString.charCodeAt(i + 2) << 16) |
                (binaryString.charCodeAt(i + 3) << 24);
            pixels[i / 4] = new Float32Array(new Uint32Array([value]).buffer)[0];
        }

        // Apply window/level
        const low = this.windowCenter - this.windowWidth / 2;
        const high = this.windowCenter + this.windowWidth / 2;

        // Create RGB data for the texture
        const rgbData = new Float32Array(this.width * this.height * 3);
        for (let i = 0; i < pixels.length; i++) {
            const value = pixels[i];
            let normalizedValue = (value - low) / (high - low);
            normalizedValue = Math.max(0, Math.min(1, normalizedValue));

            rgbData[i * 3] = normalizedValue;
            rgbData[i * 3 + 1] = normalizedValue;
            rgbData[i * 3 + 2] = normalizedValue;
        }

        // Create or update the texture
        if (!this.texture) {
            this.texture = new BABYLON.RawTexture(
                rgbData,
                this.width,
                this.height,
                BABYLON.Engine.TEXTUREFORMAT_RGB,
                this.scene,
                false,
                false,
                BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
                BABYLON.Engine.TEXTURETYPE_FLOAT
            );

            // Create new material with the texture
            const material = new BABYLON.StandardMaterial("imageMaterial", this.scene);
            material.diffuseTexture = this.texture;
            material.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
            material.useFloatValues = true;

            // Apply material to cube
            this.cube.material = material;
        } else {
            this.texture.update(rgbData);
        }
    }

    getState() {
        return {
            imageData: this.imageData,
            currentSlice: this.currentSlice,
            totalSlices: this.totalSlices,
            windowCenter: this.windowCenter,
            windowWidth: this.windowWidth,
            rotation: this.rotation,
            width: this.width,
            height: this.height,
            minVal: this.minVal,
            maxVal: this.maxVal,
            is3DMode: this.is3DMode
        };
    }

    setState(state) {
        if (!state) return;

        // Deep copy the state to prevent reference issues
        this.imageData = state.imageData ? [...state.imageData] : null;
        this.currentSlice = state.currentSlice || 0;
        this.totalSlices = state.totalSlices || 1;
        this.windowCenter = state.windowCenter || 128;
        this.windowWidth = state.windowWidth || 256;
        this.rotation = state.rotation || 0;
        this.width = state.width || 0;
        this.height = state.height || 0;
        this.minVal = state.minVal || 0;
        this.maxVal = state.maxVal || 255;
        this.is3DMode = state.is3DMode || false;

        // Initialize canvases before updating
        if (this.imageData) {
            this.resizeCanvases();
            // Ensure proper canvas visibility based on mode
            this.canvas2D.style.display = this.is3DMode ? 'none' : 'block';
            this.canvas3D.style.display = this.is3DMode ? 'block' : 'none';
            this.roiCanvas.style.display = this.is3DMode ? 'none' : 'block';

            // Update the view
            if (this.is3DMode) {
                this.updateTexture();
            } else {
                this.updateSlice();
            }

            // Hide upload overlay
            if (this.uploadOverlay) {
                this.uploadOverlay.style.display = 'none';
            }
        }
    }

    initializeBabylonScene() {
        // Initialize Babylon.js scene using canvas3D
        this.engine = new BABYLON.Engine(this.canvas3D, true);
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);

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
        this.camera.attachControl(this.canvas3D, true);

        // Create a cube
        const material = new BABYLON.StandardMaterial("cubeMaterial", this.scene);
        material.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        material.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);

        this.cube = BABYLON.MeshBuilder.CreateBox("cube", { size: 2 }, this.scene);
        this.cube.material = material;

        // Add lights
        new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);

        // Start rendering loop
        this.engine.runRenderLoop(() => {
            this.scene.render();
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
            console.log("Upload response:", result);

            if (result.success && result.data) {
                console.log("Upload successful, processing image data...");

                // Hide upload overlay
                if (this.uploadOverlay) {
                    this.uploadOverlay.style.display = 'none';
                }

                this.imageData = result.data;
                this.totalSlices = this.imageData.length;
                this.currentSlice = 0;
                this.minVal = result.metadata.min_value;
                this.maxVal = result.metadata.max_value;
                this.width = result.metadata.dimensions[0];
                this.height = result.metadata.dimensions[1];

                // Switch to 2D mode if not already
                if (this.is3DMode) {
                    this.toggleViewMode();
                }

                this.resizeCanvases();
                this.updateSlice();
            } else {
                console.error("Upload failed:", result.message);
            }
        } catch (error) {
            console.error("Error uploading file:", error);
        }
    }

    async showDirectoryBrowser(path = 'images') {
        console.log("Showing directory browser for path:", path);
        this.urlImportModal.classList.add('show');
        this.currentPathElement.textContent = path;

        try {
            // Show loading state
            this.directoryList.innerHTML = '<div class="loading">Loading...</div>';

            const response = await fetch(`${BASE_URL}/directory?path=${encodeURIComponent(path)}`);
            if (!response.ok) {
                throw new Error(`Failed to load directory: ${response.statusText}`);
            }

            const data = await response.json();
            console.log("Directory contents:", data);

            // Clear loading state and populate directory list
            this.directoryList.innerHTML = '';

            // Add parent directory link if not in root
            if (path !== 'images') {
                const parentPath = path.split('/').slice(0, -1).join('/') || 'images';
                const parentDir = document.createElement('div');
                parentDir.className = 'directory-item folder';
                parentDir.innerHTML = '<i class="fas fa-level-up-alt"></i> ..';
                parentDir.addEventListener('click', () => this.showDirectoryBrowser(parentPath));
                this.directoryList.appendChild(parentDir);
            }

            // Add directories first
            data.directories?.forEach(dir => {
                const dirElement = document.createElement('div');
                dirElement.className = 'directory-item folder';
                dirElement.innerHTML = `<i class="fas fa-folder"></i> ${dir}`;
                dirElement.addEventListener('click', () => {
                    this.showDirectoryBrowser(`${path}/${dir}`);
                });
                this.directoryList.appendChild(dirElement);
            });

            // Then add files
            data.files?.forEach(file => {
                if (file.match(/\.(nii|nii\.gz|dcm|jpg|png|bmp)$/i)) {
                    const fileElement = document.createElement('div');
                    fileElement.className = 'directory-item image';
                    fileElement.innerHTML = `<i class="fas fa-file-image"></i> ${file}`;
                    fileElement.addEventListener('click', () => {
                        this.loadRemoteFile(`${path}/${file}`);
                    });
                    this.directoryList.appendChild(fileElement);
                }
            });

        } catch (error) {
            console.error("Error loading directory:", error);
            this.directoryList.innerHTML = `<div class="error">Error loading directory: ${error.message}</div>`;
        }
    }

    async loadRemoteFile(path) {
        console.log("Loading remote file:", path);
        try {
            const response = await fetch(`${BASE_URL}/load?path=${encodeURIComponent(path)}`);
            if (!response.ok) {
                throw new Error(`Failed to load file: ${response.statusText}`);
            }

            const result = await response.json();
            if (result.success && result.data) {
                // Hide modal
                this.urlImportModal.classList.remove('show');

                // Process the image data
                this.imageData = result.data;
                this.totalSlices = this.imageData.length;
                this.currentSlice = 0;
                this.minVal = result.metadata.min_value;
                this.maxVal = result.metadata.max_value;
                this.width = result.metadata.dimensions[0];
                this.height = result.metadata.dimensions[1];

                // Switch to 2D mode if not already
                if (this.is3DMode) {
                    this.toggleViewMode();
                }

                this.resizeCanvases();
                this.updateSlice();

                // Hide upload overlay
                if (this.uploadOverlay) {
                    this.uploadOverlay.style.display = 'none';
                }
            } else {
                throw new Error(result.message || 'Failed to load image');
            }
        } catch (error) {
            console.error("Error loading remote file:", error);
            alert(`Error loading file: ${error.message}`);
        }
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
        const oldStates = this.viewers.map(viewer => viewer.getState());

        // Clear and rebuild grid
        this.imageGrid.innerHTML = '';
        this.imageGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        this.viewers = [];

        const template = document.getElementById("imageWindowTemplate");
        for (let i = 0; i < totalCells; i++) {
            const clone = template.content.cloneNode(true);
            const container = clone.querySelector(".image-window");
            this.imageGrid.appendChild(container);

            const viewer = new ImageViewer(container);
            this.viewers.push(viewer);

            // Restore state if available
            if (oldStates[i]) {
                viewer.setState(oldStates[i]);
            }
        }
    }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
    const gridManager = new GridManager();
    gridManager.updateGrid();
});

// Make ImageViewer available globally
window.ImageViewer = ImageViewer;