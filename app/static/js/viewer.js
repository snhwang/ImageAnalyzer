const BASE_URL = window.location.origin;

class ImageViewer {
    constructor(container) {
        this.container = container;
        // Attach viewer instance to container
        container.viewer = this;
        this.imageContainer = container.querySelector(".image-container");
        this.is3DMode = false;  // Set to false by default for 2D view
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
        this.imageLabel = "";

        const labelSelect = this.container.querySelector(".image-label");
        if (labelSelect) {
            this.imageLabel = labelSelect.value;
        }

        // Initialize canvases
        this.initializeCanvases();

        // Get UI elements
        this.uploadOverlay = this.container.querySelector(".upload-overlay");
        this.fileInput = container.querySelector(".hidden-file-input");
        this.uploadBtn = container.querySelector(".upload-btn");
        this.viewModeBtn = container.querySelector(".view-mode-btn");
        this.windowLevelBtn = container.querySelector(".window-level-btn");
        this.optimizeWindowBtn = container.querySelector(".optimize-window-btn");
        this.rotateLeftBtn = container.querySelector(".rotate-left-btn");
        this.rotateRightBtn = container.querySelector(".rotate-right-btn");
        this.menuBtn = container.querySelector(".menu-btn");
        this.menuDropdown = container.querySelector(".menu-dropdown");
        this.browseBtn = container.querySelector(".browse-btn");

        this.pixelCache = new Map();
        this.wheelThrottleTimeout = null;
        this.isProcessingWheel = false;

        this.urlImportModal = document.getElementById("urlImportModal");
        this.directoryList = document.getElementById("directoryList");
        this.currentPathElement = document.getElementById("currentPath");

        // Initialize Babylon.js scene first
        this.initializeBabylonScene();
        // Then set up event listeners
        this.setupEventListeners();

        // Add blend state properties
        this.isBlendMode = false;
        this.baseViewer = null;
        this.overlayViewer = null;
    }

    initializeCanvases() {
        // Create and set up 2D canvas
        this.canvas2D = document.createElement("canvas");
        this.ctx2D = this.canvas2D.getContext("2d");
        this.canvas2D.style.width = "100%";
        this.canvas2D.style.height = "100%";
        this.canvas2D.style.position = "absolute";
        this.canvas2D.style.top = "0";
        this.canvas2D.style.left = "0";
        this.canvas2D.style.display = "block";
        this.canvas2D.style.userSelect = "none";
        this.imageContainer.querySelector(".canvas-container").appendChild(this.canvas2D);

        // Create and set up 3D canvas
        this.canvas3D = document.createElement("canvas");
        this.canvas3D.style.width = "100%";
        this.canvas3D.style.height = "100%";
        this.canvas3D.style.position = "absolute";
        this.canvas3D.style.top = "0";
        this.canvas3D.style.left = "0";
        this.canvas3D.style.display = "none";
        this.canvas3D.style.userSelect = "none";
        this.imageContainer.querySelector(".canvas-container").appendChild(this.canvas3D);

        // Create and set up ROI canvas
        this.roiCanvas = document.createElement("canvas");
        this.roiCtx = this.roiCanvas.getContext("2d");
        this.roiCanvas.style.width = "100%";
        this.roiCanvas.style.height = "100%";
        this.roiCanvas.style.position = "absolute";
        this.roiCanvas.style.top = "0";
        this.roiCanvas.style.left = "0";
        this.roiCanvas.style.pointerEvents = "none";
        this.roiCanvas.style.display = "none";
        this.roiCanvas.style.userSelect = "none";
        this.imageContainer.querySelector(".canvas-container").appendChild(this.roiCanvas);
    }

    getLabel() {
        return this.imageLabel;
    }

    setLabel(label) {
        this.imageLabel = label;
        const labelSelect = this.container.querySelector(".image-label");
        if (labelSelect) {
            labelSelect.value = label;
        }
    }

    setupEventListeners() {
        if (this.uploadBtn) {
            this.uploadBtn.onclick = () => {
                console.log("Upload button clicked");
                if (this.fileInput) this.fileInput.click();
            };
        }

        if (this.fileInput) {
            this.fileInput.onchange = (e) => {
                console.log("File input changed");
                const file = e.target.files[0];
                if (file) {
                    this.uploadFile(file);
                }
            };
        }

        if (this.windowLevelBtn) {
            this.windowLevelBtn.addEventListener("click", () => {
                console.log("Window level button clicked");
                this.toggleWindowLevelMode();
            });
        }

        this.optimizeWindowBtn?.addEventListener("click", () => {
            console.log("Optimize window button clicked");
            this.toggleOptimizeWindow();
        });

        this.rotateLeftBtn?.addEventListener("click", () => {
            console.log("Rotate left button clicked");
            this.rotate(-90);
        });

        this.rotateRightBtn?.addEventListener("click", () => {
            console.log("Rotate right button clicked");
            this.rotate(90);
        });

        this.menuBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            const menuContainer = this.menuBtn.closest(".menu-container");
            menuContainer.classList.toggle("show");
        });

        this.menuDropdown?.addEventListener("click", (e) => {
            console.log("Menu dropdown clicked");
            const menuItem = e.target.closest(".menu-item");
            if (!menuItem) {
                console.log("No menu item found in click target");
                return;
            }

            const action = menuItem.dataset.action;
            console.log("Menu action:", action);

            if (action) {
                e.preventDefault();
                e.stopPropagation();

                const menuContainer = this.menuBtn.closest(".menu-container");
                menuContainer.classList.remove("show");

                switch (action) {
                    case "upload-file":
                        if (this.fileInput) {
                            this.fileInput.click();
                        }
                        break;
                    case "browse-remote":
                        this.showDirectoryBrowser();
                        break;
                    case "rotate-left":
                        this.rotate(-90);
                        break;
                    case "rotate-right":
                        this.rotate(90);
                        break;
                    case "optimize-window":
                        this.toggleOptimizeWindow();
                        break;
                    case "window-level":
                        this.toggleWindowLevelMode();
                        break;
                    case "toggle-view":
                        this.toggleViewMode();
                        break;
                    case "register-images":
                        this.showRegistrationDialog();
                        break;
                    case "rotate-180":
                        console.log("Rotate 180 menu item clicked");
                        this.showRotate180Dialog();
                        break;
                    case "blend-images":
                        this.showBlendDialog();
                        break;
                    default:
                        console.log("Unknown action:", action);
                }
            } else {
                console.log("No action found for menu item");
            }
        });

        document.addEventListener("click", (e) => {
            if (!e.target.closest(".menu-container")) {
                const menuContainers =
                    document.querySelectorAll(".menu-container");
                menuContainers.forEach((container) =>
                    container.classList.remove("show"),
                );
            }
        });

        this.roiCanvas.addEventListener("mousedown", (e) => {
            if (this.optimizeWindowBtn.classList.contains("active")) {
                this.isDrawingROI = true;
                const rect = this.roiCanvas.getBoundingClientRect();
                this.roiStart = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                };
                e.stopPropagation();
            }
        });

        this.roiCanvas.addEventListener("mousemove", (e) => {
            if (this.isDrawingROI) {
                const rect = this.roiCanvas.getBoundingClientRect();
                this.roiEnd = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                };
                this.drawROI();
                e.stopPropagation();
            }
        });

        this.roiCanvas.addEventListener("mouseup", (e) => {
            if (this.isDrawingROI) {
                this.isDrawingROI = false;
                this.optimizeWindowFromROI();
                e.stopPropagation();
            }
        });

        this.imageContainer.addEventListener(
            "wheel",
            (e) => {
                if (!this.is3DMode && this.totalSlices > 1) {
                    e.preventDefault();

                    if (this.isProcessingWheel) {
                        return;
                    }

                    this.isProcessingWheel = true;
                    const delta = Math.sign(e.deltaY);
                    const newSlice = Math.max(
                        0,
                        Math.min(
                            this.totalSlices - 1,
                            this.currentSlice + delta,
                        ),
                    );

                    if (newSlice !== this.currentSlice) {
                        this.currentSlice = newSlice;
                        console.log(
                            `Navigating to slice ${this.currentSlice + 1}/${this.totalSlices}`,
                        );
                        this.updateSlice().then(() => {
                            this.isProcessingWheel = false;
                        });
                    } else {
                        this.isProcessingWheel = false;
                    }
                }
            },
            { passive: false },
        );

        this.canvas2D.addEventListener("mousedown", (e) => {
            if (this.windowLevelBtn?.classList.contains("active")) {
                console.log("Starting window/level adjustment");
                this.isDragging = true;
                this.dragStart = { x: e.clientX, y: e.clientY };
                this.startWindowCenter = this.windowCenter;
                this.startWindowWidth = this.windowWidth;
                e.preventDefault();
                this.canvas2D.style.cursor = "crosshair";
            }
        });

        this.canvas2D.addEventListener("mousemove", (e) => {
            if (this.isDragging && this.windowLevelBtn?.classList.contains("active")) {
                const dx = e.clientX - this.dragStart.x;
                const dy = this.dragStart.y - e.clientY;

                const windowWidthScale = (this.maxVal - this.minVal) / 500;
                const windowCenterScale = (this.maxVal - this.minVal) / 500;

                this.windowWidth = Math.max(1, this.startWindowWidth + dx * windowWidthScale);
                this.windowCenter = this.startWindowCenter + dy * windowCenterScale;

                this.windowCenter = Math.max(this.minVal, Math.min(this.maxVal, this.windowCenter));

                console.log(`Window/Level adjusted - C: ${this.windowCenter.toFixed(2)}, W: ${this.windowWidth.toFixed(2)}`);
                this.updateSlice();
                e.preventDefault();
            }
        });

        this.canvas2D.addEventListener("mouseup", () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.canvas2D.style.cursor = this.windowLevelBtn?.classList.contains("active") ? "crosshair" : "default";
            }
        });

        this.canvas2D.addEventListener("mouseleave", () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.canvas2D.style.cursor = this.windowLevelBtn?.classList.contains("active") ? "crosshair" : "default";
            }
        });

        window.addEventListener("resize", () => {
            this.resizeCanvases();
        });

        this.browseBtn?.addEventListener("click", () => {
            console.log("Browse button clicked");
            this.showDirectoryBrowser();
        });

        const cancelBtn = this.urlImportModal?.querySelector(".cancel-btn");
        cancelBtn?.addEventListener("click", () => {
            this.urlImportModal.classList.remove("show");
        });

        const imageLabel = this.container.querySelector(".image-label");
        imageLabel?.addEventListener("change", (e) => {
            const selectedLabel = e.target.value;
            this.setLabel(selectedLabel);
            console.log(`Image label changed to: ${selectedLabel}`);
        });
    }

    resizeCanvases() {
        const container =
            this.imageContainer.querySelector(".canvas-container");
        const rect = container.getBoundingClientRect();

        [this.canvas2D, this.canvas3D, this.roiCanvas].forEach((canvas) => {
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
        console.log(`Switching to ${this.is3DMode ? "3D" : "2D"} mode`);

        if (this.is3DMode) {
            // Switch to 3D mode
            this.canvas2D.style.display = "none";
            this.canvas3D.style.display = "block";
            this.roiCanvas.style.display = "none";

            if (this.camera3D) {
                this.camera3D.attachControl(this.canvas3D, true);
                this.scene.activeCamera = this.camera3D;
            }

            if (this.cube) {
                this.cube.setEnabled(true);
            }

            if (this.imageData) {
                this.updateTexture();
            }
        } else {
            // Switch to 2D mode
            this.canvas2D.style.display = "block";
            this.canvas3D.style.display = "none";
            this.roiCanvas.style.display = "block";

            if (this.camera3D) {
                this.camera3D.detachControl();
            }

            if (this.cube) {
                this.cube.setEnabled(false);
            }

            if (this.imageData) {
                this.resizeCanvases();
                this.updateSlice();
            }
        }

        if (this.viewModeBtn) {
            this.viewModeBtn.classList.toggle("active");
            this.windowLevelBtn?.classList.remove("active");
            this.optimizeWindowBtn?.classList.remove("active");
        }
    }

    toggleWindowLevelMode() {
        if (!this.is3DMode) {
            console.log("Toggling window/level mode");

            // Toggle the active state of the window/level button
            if (this.windowLevelBtn) {
                const isActive = this.windowLevelBtn.classList.toggle("active");

                // Update cursor style based on active state
                this.canvas2D.style.cursor = isActive ? "crosshair" : "default";

                // If activating window/level, deactivate optimize window
                if (isActive && this.optimizeWindowBtn) {
                    this.optimizeWindowBtn.classList.remove("active");
                    this.roiCanvas.style.pointerEvents = "none";
                }
            }
        }
    }

    toggleOptimizeWindow() {
        if (!this.is3DMode) {
            console.log("Toggling optimize window mode");

            // Toggle the active state of the optimize window button
            const isActive = this.optimizeWindowBtn.classList.toggle("active");

            // If activating optimize window, deactivate window/level
            if (isActive && this.windowLevelBtn) {
                this.windowLevelBtn.classList.remove("active");
                this.canvas2D.style.cursor = "default";
            }

            // Update ROI canvas interaction based on active state
            this.roiCanvas.style.pointerEvents = isActive ? "auto" : "none";
            this.roiCanvas.style.touchAction = isActive ? "none" : "auto";
            this.roiCanvas.style.zIndex = isActive ? "1" : "0";
        }
    }

    rotate(degrees) {
        if (!this.is3DMode) {
            this.rotation = (this.rotation + degrees) % 360;
            console.log(
                `Rotating image by ${degrees} degrees (total: ${this.rotation})`,
            );
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
            pixels[i / 4] = new Float32Array(
                new Uint32Array([value]).buffer,
            )[0];
        }

        this.pixelCache.set(sliceIndex, pixels);
        return pixels;
    }

    async updateSlice() {
        if (!this.imageData || !this.imageData.length) {
            console.log("No image data available");
            return;
        }

        console.log(`Updating slice ${this.currentSlice + 1}/${this.totalSlices}`);
        console.log(`Canvas dimensions: ${this.canvas2D.width}x${this.canvas2D.height}`);
        console.log(`Image dimensions: ${this.width}x${this.height}`);

        const pixels = await this.loadSliceData(this.currentSlice);
        console.log("Loaded slice data, length:", pixels.length);

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = this.width;
        tempCanvas.height = this.height;
        const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });

        const imageData = tempCtx.createImageData(this.width, this.height);
        const data = imageData.data;

        const low = this.windowCenter - this.windowWidth / 2;
        const high = this.windowCenter + this.windowWidth / 2;
        const range = high - low;

        console.log(`Window settings - Center: ${this.windowCenter}, Width: ${this.windowWidth}`);
        console.log(`Value range - Low: ${low}, High: ${high}`);

        const length = pixels.length;
        for (let i = 0; i < length; i++) {
            const value = pixels[i];
            const normalizedValue = Math.max(0, Math.min(1, (value - low) / range));
            const index = i << 2;
            // Store normalized floating point values (0-1) multiplied by 255
            data[index] = data[index + 1] = data[index + 2] = normalizedValue * 255;
            data[index + 3] = 255;
        }

        tempCtx.putImageData(imageData, 0, 0);

        // Clear the entire canvas before drawing
        this.ctx2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);

        // Calculate the scaling to fit the image while maintaining aspect ratio
        const displayScale = Math.min(
            this.canvas2D.width / this.width,
            this.canvas2D.height / this.height
        );
        const x = (this.canvas2D.width - this.width * displayScale) / 2;
        const y = (this.canvas2D.height - this.height * displayScale) / 2;

        console.log(`Drawing image at (${x}, ${y}) with scale ${displayScale}`);

        if (this.rotation !== 0) {
            this.ctx2D.save();
            this.ctx2D.translate(this.canvas2D.width / 2, this.canvas2D.height / 2);
            this.ctx2D.rotate((this.rotation * Math.PI) / 180);
            this.ctx2D.translate(-this.canvas2D.width / 2, -this.canvas2D.height / 2);
        }

        // Draw the image
        this.ctx2D.drawImage(
            tempCanvas,
            x,
            y,
            this.width * displayScale,
            this.height * displayScale
        );

        if (this.rotation !== 0) {
            this.ctx2D.restore();
        }

        const infoElement = this.container.querySelector(".image-info");
        if (infoElement) {
            infoElement.textContent = `Window: C: ${Math.round(this.windowCenter)} W: ${Math.round(this.windowWidth)} | Slice: ${this.currentSlice + 1}/${this.totalSlices} | Voxel Size: ${this.voxelWidth.toFixed(2)} × ${this.voxelHeight.toFixed(2)} × ${this.voxelDepth.toFixed(2)} mm`;
        }

        // Hide the upload overlay if it exists
        if (this.uploadOverlay) {
            this.uploadOverlay.style.display = "none";
        }
    }

    drawROI() {
        if (!this.roiStart || !this.roiEnd) return;

        this.roiCtx.clearRect(
            0,
            0,
            this.roiCanvas.width,
            this.roiCanvas.height,
        );
        this.roiCtx.strokeStyle = "yellow";
        this.roiCtx.lineWidth = 2;

        const width = this.roiEnd.x - this.roiStart.x;
        const height = this.roiEnd.y - this.roiStart.y;

        this.roiCtx.strokeRect(this.roiStart.x, this.roiStart.y, width, height);
    }

    optimizeWindowFromROI() {
        if (!this.roiStart || !this.roiEnd) return;

        const scaleX = this.width / this.canvas2D.width;
        const scaleY = this.height / this.canvas2D.height;

        const x1 = Math.floor(
            Math.min(this.roiStart.x, this.roiEnd.x) * scaleX,
        );
        const y1 = Math.floor(
            Math.min(this.roiStart.y, this.roiEnd.y) * scaleY,
        );
        const x2 = Math.floor(
            Math.max(this.roiStart.x, this.roiEnd.x) * scaleX,
        );
        const y2 = Math.floor(
            Math.max(this.roiStart.y, this.roiEnd.y) * scaleY,
        );

        const currentSliceData = this.imageData[this.currentSlice];
        const binaryString = atob(currentSliceData);
        const pixels = new Float32Array(binaryString.length / 4);

        for (let i = 0; i < binaryString.length; i += 4) {
            const value =
                binaryString.charCodeAt(i) |
                (binaryString.charCodeAt(i + 1) << 8) |
                (binaryString.charCodeAt(i + 2) << 16) |
                (binaryString.charCodeAt(i + 3) << 24);
            pixels[i / 4] = new Float32Array(
                new Uint32Array([value]).buffer,
            )[0];
        }

        let min = Infinity;
        let max = -Infinity;

        for (let y = y1; y < y2; y++) {
            for (let x = x1; x < x2; x++) {
                const value = pixels[y * this.width + x];
                min = Math.min(min, value);
                max = Math.max(max, value);
            }
        }

        this.windowCenter = (min + max) / 2;
        this.windowWidth = max - min;

        this.roiCtx.clearRect(
            0,
            0,
            this.roiCanvas.width,
            this.roiCanvas.height,
        );
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
            pixels[i / 4] = new Float32Array(
                new Uint32Array([value]).buffer,
            )[0];
        }

        const low = this.windowCenter - this.windowWidth / 2;
        const high = this.windowCenter + this.windowWidth / 2;

        const rgbData = new Float32Array(this.width * this.height * 3);
        for (let i = 0; i < pixels.length; i++) {
            const value = pixels[i];
            let normalizedValue = (value - low) / (high - low);
            normalizedValue = Math.max(0, Math.min(1, normalizedValue));

            rgbData[i * 3] = normalizedValue;
            rgbData[i * 3 + 1] = normalizedValue;
            rgbData[i * 3 + 2] = normalizedValue;
        }

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

            const material = new BABYLON.StandardMaterial("imageMaterial", this.scene);
            material.diffuseTexture = this.texture;
            material.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
            material.useFloatValues = true;
            material.backFaceCulling = false;

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
            is3DMode: this.is3DMode,
            imageLabel: this.imageLabel,
            voxelWidth: this.voxelWidth,
            voxelHeight: this.voxelHeight,
            voxelDepth: this.voxelDepth
        };
    }

    setState(state) {
        if (!state) return;

        const wasBlendMode = this.isBlendMode;
        const previousBaseViewer = this.baseViewer;
        const previousOverlayViewer = this.overlayViewer;

        this.imageData = state.imageData ? [...state.imageData] : null;
        this.currentSlice = state.currentSlice || 0;
        this.totalSlices = state.totalSlices || 1;
        if (!isNaN(state.windowCenter)) {
            this.windowCenter = state.windowCenter;
        }
        if (!isNaN(state.windowWidth) && state.windowWidth > 0) {
            this.windowWidth = state.windowWidth;
        }
        this.rotation = state.rotation || 0;
        this.width = state.width || 0;
        this.height = state.height || 0;
        this.minVal = state.minVal || 0;
        this.maxVal = state.maxVal || 255;
        this.is3DMode = state.is3DMode || false;
        this.voxelWidth = state.voxelWidth || 1;
        this.voxelHeight = state.voxelHeight || 1;
        this.voxelDepth = state.voxelDepth || 1;

        // Preserve blend mode state if this is a blend update
        this.isBlendMode = state.isBlendMode !== undefined ? state.isBlendMode : wasBlendMode;
        this.baseViewer = state.baseViewer || previousBaseViewer;
        this.overlayViewer = state.overlayViewer || previousOverlayViewer;

        if (this.imageData) {
            this.resizeCanvases();
            this.canvas2D.style.display = this.is3DMode ? "none" : "block";
            this.canvas3D.style.display = this.is3DMode ? "block" : "none";
            this.roiCanvas.style.display = this.is3DMode ? "none" : "block";

            // Only hide blend controls if we're not in blend mode
            const blendControls = this.imageContainer.querySelector('.blend-controls-container');
            if (blendControls) {
                if (this.isBlendMode) {
                    blendControls.style.removeProperty('display');
                    blendControls.classList.add('visible');
                    blendControls.style.visibility = 'visible';
                    blendControls.style.opacity = '1';
                } else {
                    blendControls.style.display = 'none';
                    blendControls.classList.remove('visible');
                }
            }

            if (this.is3DMode) {
                this.updateTexture();
            } else {
                this.updateSlice();
            }

            if (this.uploadOverlay) {
                this.uploadOverlay.style.display = "none";
            }
        }
        if (state.imageLabel) {
            this.setLabel(state.imageLabel);
        }
    }

    initializeBabylonScene() {
        this.engine = new BABYLON.Engine(this.canvas3D, true);
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);

        // Create camera for 3D view
        this.camera3D = new BABYLON.ArcRotateCamera(
            "camera3D",
            0,
            Math.PI / 3,
            10,
            BABYLON.Vector3.Zero(),
            this.scene
        );
        this.camera3D.setTarget(BABYLON.Vector3.Zero());
        this.camera3D.attachControl(this.canvas3D, true);

        // Create materials
        const material = new BABYLON.StandardMaterial("imageMaterial", this.scene);
        material.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        material.useFloatValues = true;
        material.backFaceCulling = false;

        // Create cube for 3D view
        this.cube = BABYLON.MeshBuilder.CreateBox("cube", { size: 2 }, this.scene);
        this.cube.material = material;
        this.cube.setEnabled(false);  // Hide initially

        new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);

        this.engine.runRenderLoop(() => {
            this.scene.render();
        });
    }

    async uploadFile(file) {
        try {
            this.clearImageState();

            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch(`${BASE_URL}/upload`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const result = await response.json();
            console.log("Upload response:", result);

            if (result.success && result.data) {
                console.log("Upload successful, processing image data...");

                if (this.uploadOverlay) {
                    this.uploadOverlay.style.display = "none";
                }

                this.loadImageData(result);
            } else {
                console.error("Upload failed:", result.message);
            }
        } catch (error) {
            console.error("Error uploading file:", error);
        }
    }

    async loadRemoteFile(path) {
        console.log("Loading remote file:", path);
        try {
            this.clearImageState();

            const response = await fetch(
                `${BASE_URL}/api/load?path=${encodeURIComponent(path)}`,
            );
            if (!response.ok) {
                throw new Error(`Failed to load file: ${response.statusText}`);
            }

            const result = await response.json();
            if (result.success && result.data) {
                this.loadImageData(result);
                this.urlImportModal.classList.remove("show");
            } else {
                throw new Error(result.message || "Failed to load image data");
            }
        } catch (error) {
            console.error("Error loading remote file:", error);
        }
    }

    clearImageState() {
        const wasBlendMode = this.isBlendMode;
        const previousBaseViewer = this.baseViewer;
        const previousOverlayViewer = this.overlayViewer;

        this.imageData = null;
        this.currentSlice = 0;
        this.totalSlices = 1;
        this.windowCenter = 128;
        this.windowWidth = 256;
        this.rotation = 0;
        this.width = 0;
        this.height = 0;
        this.minVal = 0;
        this.maxVal = 255;

        this.pixelCache.clear();

        this.ctx2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);
        this.roiCtx.clearRect(0, 0, this.roiCanvas.width, this.roiCanvas.height);

        this.isDrawingROI = false;
        this.roiStart = null;
        this.roiEnd = null;

        if (this.texture) {
            this.texture.dispose();
            this.texture = null;
        }

        const infoElement = this.container.querySelector(".image-info");
        if (infoElement) {
            infoElement.textContent = "Window: C: 0 W: 0 | Slice: 0/0";
        }

        // Only hide blend controls if we're clearing a non-blend state
        if (!wasBlendMode) {
            const blendControls = this.imageContainer.querySelector('.blend-controls-container');
            if (blendControls) {
                blendControls.classList.remove('visible');
                blendControls.style.display = 'none';
            }
            this.isBlendMode = false;
            this.baseViewer = null;
            this.overlayViewer = null;
        } else {
            // Preserve blend state
            this.isBlendMode = wasBlendMode;
            this.baseViewer = previousBaseViewer;
            this.overlayViewer = previousOverlayViewer;
        }
    }

    loadImageData(result) {
        // Store the blend controls state before updating
        const blendControls = this.imageContainer.querySelector('.blend-controls-container');
        const wasBlendControlsVisible = blendControls && window.getComputedStyle(blendControls).display !== 'none';

        this.imageData = result.data;
        this.totalSlices = this.imageData.length;
        this.minVal = result.metadata.min_value;
        this.maxVal = result.metadata.max_value;
        this.width = result.metadata.dimensions[0];
        this.height = result.metadata.dimensions[1];
        // Store voxel dimensions
        const voxelDims = result.metadata.voxel_dimensions;
        if (!voxelDims || voxelDims.length !== 3) {
            console.error('Invalid or missing voxel dimensions in metadata');
            throw new Error('Invalid voxel dimensions');
        }
        this.voxelWidth = parseFloat(voxelDims[0]);
        this.voxelHeight = parseFloat(voxelDims[1]);
        this.voxelDepth = parseFloat(voxelDims[2]);
        console.log(`Loaded voxel dimensions: ${this.voxelWidth} x ${this.voxelHeight} x ${this.voxelDepth}`);

        // Preserve current slice if in blend mode, otherwise reset to 0
        if (!result.isBlendMode) {
            this.currentSlice = 0;
            this.windowWidth = (this.maxVal - this.minVal) / 2;
            this.windowCenter = this.minVal + this.windowWidth;
        }

        // Use 2D canvas by default for initial load
        this.is3DMode = false;
        this.canvas2D.style.display = "block";
        this.canvas3D.style.display = "none";
        this.roiCanvas.style.display = "block";

        // Hide the upload overlay
        if (this.uploadOverlay) {
            this.uploadOverlay.style.display = "none";
        }

        this.resizeCanvases();
        this.updateSlice();

        // Update blend mode state and controls
        if (result.isBlendMode) {
            this.isBlendMode = true;
            this.baseViewer = result.baseViewer;
            this.overlayViewer = result.overlayViewer;
            if (blendControls) {
                blendControls.style.removeProperty('display');
                blendControls.classList.add('visible');
                blendControls.style.visibility = 'visible';
                blendControls.style.opacity = '1';
            }
        } else if (wasBlendControlsVisible && blendControls) {
            blendControls.style.removeProperty('display');
            blendControls.classList.add('visible');
            blendControls.style.visibility = 'visible';
            blendControls.style.opacity = '1';
        }
    }

    async showDirectoryBrowser(path = "images") {
        console.log("Showing directory browser for path:", path);
        this.urlImportModal.classList.add("show");
        this.currentPathElement.textContent = path;

        try {
            this.directoryList.innerHTML =
                '<div class="loading">Loading...</div>';

            const response = await fetch(
                `${BASE_URL}/api/directory?path=${encodeURIComponent(path)}`,
            );
            if (!response.ok) {
                throw new Error(`Failed to load directory: ${response.statusText}`);
            }

            const data = await response.json();
            console.log("Directory contents:", data);

            this.directoryList.innerHTML = "";

            if (path !== "images") {
                const parentPath =
                    path.split("/").slice(0, -1).join("/") || "images";
                const parentDir = document.createElement("div");
                parentDir.className = "directory-item folder";
                parentDir.innerHTML = '<i class="fas fa-level-up-alt"></i> ..';
                parentDir.addEventListener("click", () =>
                    this.showDirectoryBrowser(parentPath)
                );
                this.directoryList.appendChild(parentDir);
            }

            data.directories?.forEach((dir) => {
                const dirElement = document.createElement("div");
                dirElement.className = "directory-item folder";
                dirElement.innerHTML = `<i class="fas fa-folder"></i> ${dir}`;
                dirElement.addEventListener("click", () => {
                    this.showDirectoryBrowser(`${path}/${dir}`);
                });
                this.directoryList.appendChild(dirElement);
            });

            data.files?.forEach((file) => {
                if (file.match(/\.(nii|nii\.gz|dcm|jpg|png|bmp)$/i)) {
                    const fileElement = document.createElement("div");
                    fileElement.className = "directory-item image";
                    fileElement.innerHTML = `<i class="fas fa-file-image"></i> ${file}`;
                    fileElement.addEventListener("click", () => {
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

    async showRegistrationDialog() {
        console.log("Opening registration dialog");
        const modal = document.getElementById("registrationModal");
        if (!modal) {
            console.error("Registration modal not found");
            return;
        }

        // Get all viewers with loaded images and store as class property
        this.registrationViewers = Array.from(document.querySelectorAll(".image-window"))
            .map((container, index) => ({
                index,
                label: container.viewer?.getLabel() || `Image ${index + 1}`,
                viewer: container.viewer
            }))
            .filter(viewer => viewer.viewer && viewer.viewer.imageData);

        console.log(`Found ${this.registrationViewers.length} viewers with images`);

        if (this.registrationViewers.length < 2) {
            alert("Please load at least two images before attempting registration");
            return;
        }

        const sourceSelect = document.getElementById("registrationSourceSelect");
        const targetSelect = document.getElementById("registrationTargetSelect");

        if (!sourceSelect || !targetSelect) {
            console.error("Registration selects not found");
            return;
        }

        // Clear previous options
        sourceSelect.innerHTML = '<option value="">Select moving image...</option>';
        targetSelect.innerHTML = '<option value="">Select fixed image...</option>';

        // Add options for each viewer
        this.registrationViewers.forEach(({index, label}) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = label;

            sourceSelect.appendChild(option.cloneNode(true));
            targetSelect.appendChild(option.cloneNode(true));
        });

        // Handle registration
        const registerBtn = modal.querySelector(".register-btn");
        const cancelBtn = modal.querySelector(".cancel-btn");

        // Remove any existing event listeners
        const newRegisterBtn = registerBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        registerBtn.parentNode.replaceChild(newRegisterBtn, registerBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        newRegisterBtn.addEventListener("click", async () => {
            await this.handleRegister();
        });

        newCancelBtn.addEventListener("click", () => {
            modal.classList.remove("show");
        });

        modal.classList.add("show");
    }

    async handleRegister() {
        try {
            const sourceSelect = document.getElementById("registrationSourceSelect");
            const targetSelect = document.getElementById("registrationTargetSelect");

            if (!sourceSelect || !targetSelect) {
                console.error("Source or target select not found");
                return;
            }

            const sourceViewer = this.registrationViewers[sourceSelect.value].viewer;
            const targetViewer = this.registrationViewers[targetSelect.value].viewer;

            if (!sourceViewer || !targetViewer) {
                console.error("Source or target viewer not found");
                return;
            }

            const sourceState = sourceViewer.getState();
            const targetState = targetViewer.getState();

            const requestData = {
                fixed_image: {
                    data: targetState.imageData,
                    metadata: {
                        dimensions: [targetState.width, targetState.height],
                        voxel_dimensions: [targetState.voxelWidth, targetState.voxelHeight, targetState.voxelDepth],
                        min_value: targetState.minVal,
                        max_value: targetState.maxVal
                    }
                },
                moving_image: {
                    data: sourceState.imageData,
                    metadata: {
                        dimensions: [sourceState.width, sourceState.height],
                        voxel_dimensions: [sourceState.voxelWidth, sourceState.voxelHeight, sourceState.voxelDepth],
                        min_value: sourceState.minVal,
                        max_value: sourceState.maxVal
                    }
                }
            };

            const response = await fetch(`${BASE_URL}/api/registration`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });

            const result = await response.json();
            if (result.success) {
                // Clear the existing state of the initiating viewer
                this.clearImageState();

                // Update the initiating viewer with the registered image
                this.setState({
                    imageData: result.data,
                    width: result.metadata.dimensions[0],
                    height: result.metadata.dimensions[1],
                    minVal: result.metadata.min_value,
                    maxVal: result.metadata.max_value,
                    totalSlices: result.data.length,
                    currentSlice: 0,
                    windowCenter: (result.metadata.max_value + result.metadata.min_value) / 2,
                    windowWidth: result.metadata.max_value - result.metadata.min_value,
                    voxelWidth: result.metadata.voxel_dimensions[0],
                    voxelHeight: result.metadata.voxel_dimensions[1],
                    voxelDepth: result.metadata.voxel_dimensions[2],
                    is3DMode: false,
                    rotation: 0,
                    imageLabel: `${sourceViewer.getLabel()} (Registered to ${targetViewer.getLabel()})`
                });

                // Close the registration dialog
                const modal = document.getElementById("registrationModal");
                if (modal) {
                    modal.classList.remove("show");
                }
            } else {
                console.error("Registration failed:", result.message);
                alert("Registration failed: " + result.message);
            }
        } catch (error) {
            console.error("Error during registration:", error);
            alert("Error during registration: " + error.message);
        }
    }

    showRotate180Dialog() {
        console.log("Opening rotate 180 dialog");
        const modal = document.getElementById("rotate180Modal");
        const imageSelect = document.getElementById("rotate180ImageSelect");
        const rotateBtn = modal.querySelector(".rotate-btn");
        const cancelBtn = modal.querySelector(".cancel-btn");

        // Store the viewer that initiated the rotate command (the window where the menu was clicked)
        const initiatingViewer = this;
        console.log("Dialog initiated from viewer:", initiatingViewer.container.id);

        if (!modal || !imageSelect) {
            console.error("Required modal elements not found");
            return;
        }

        // Clear and initialize the select dropdown
        imageSelect.innerHTML = '<option value="">Select image to rotate...</option>';

        // Find all viewers with images
        const viewers = [];
        document.querySelectorAll(".image-window").forEach((container, index) => {
            if (container.viewer && container.viewer.imageData) {
                const label = container.viewer.getLabel() || `Unlabeled`;
                viewers.push({
                    index,
                    label,
                    viewer: container.viewer
                });
            }
        });

        // Populate select options
        viewers.forEach((viewerInfo) => {
            const option = document.createElement('option');
            option.value = viewerInfo.index;
            option.textContent = `Image ${viewerInfo.index + 1} (${viewerInfo.label})`;
            imageSelect.appendChild(option);
        });

        // Handle rotate button click
        rotateBtn.onclick = async () => {
            const selectedIdx = parseInt(imageSelect.value);
            if (isNaN(selectedIdx)) {
                alert("Please select an image to rotate");
                return;
            }

            const sourceViewer = viewers.find(v => v.index === selectedIdx)?.viewer;
            if (!sourceViewer) {
                alert("Selected image not found");
                return;
            }

            try {
                const response = await fetch(`${BASE_URL}/api/rotate180`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        image_data: sourceViewer.imageData,
                        metadata: {
                            dimensions: [sourceViewer.width, sourceViewer.height],
                            min_value: sourceViewer.minVal,
                            max_value: sourceViewer.maxVal,
                            total_slices: sourceViewer.totalSlices
                        }
                    })
                });

                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}`);
                }

                const result = await response.json();
                console.log("Rotation response:", result);

                if (result.success) {
                    // Update the initiating viewer with the rotated image data
                    console.log("Updating initiating viewer with rotated data");

                    // First clear the existing state
                    initiatingViewer.clearImageState();

                    // Then set the new state with rotated data
                    initiatingViewer.setState({
                        imageData: result.data,
                        width: result.metadata.dimensions[0],
                        height: result.metadata.dimensions[1],
                        minVal: result.metadata.min_value,
                        maxVal: result.metadata.max_value,
                        windowCenter: (result.metadata.max_value + result.metadata.min_value) / 2,
                        windowWidth: result.metadata.max_value - result.metadata.min_value,
                        totalSlices: result.data.length,
                        currentSlice: 0,
                        is3DMode: false,
                        rotation: 0,
                        imageLabel: `${sourceViewer.getLabel()} (Rotated)`
                    });

                    modal.classList.remove("show");
                } else {
                    throw new Error(result.message || "Rotation failed");
                }
            } catch (error) {
                console.error("Error during rotation:", error);
                alert(`Failed to rotate image: ${error.message}`);
            }
        };

        // Handle cancel button click
        cancelBtn.onclick = () => {
            modal.classList.remove("show");
        };

        // Show the modal
        modal.classList.add("show");
    }

    showBlendDialog() {
        console.log("Opening blend dialog");
        const modal = document.getElementById("blendImagesModal");
        const baseSelect = document.getElementById("baseImage");
        const overlaySelect = document.getElementById("overlayImage");
        const blendSlider = document.getElementById("blendSlider");
        const blendValue = document.getElementById("blendValue");
        const applyBtn = document.getElementById("applyBlend");
        const cancelBtn = document.getElementById("cancelBlend");
        const closeBtn = modal.querySelector(".close");

        // Clear previous options
        baseSelect.innerHTML = '<option value="">Select base image...</option>';
        overlaySelect.innerHTML = '<option value="">Select overlay image...</option>';

        // Get all viewers with loaded images
        const viewers = Array.from(document.querySelectorAll(".image-window"))
            .map((container, index) => ({
                index,
                label: container.viewer?.getLabel() || `Image ${index + 1}`,
                viewer: container.viewer
            }))
            .filter(viewer => viewer.viewer && viewer.viewer.imageData);

        console.log(`Found ${viewers.length} viewers with images`);

        if (viewers.length < 2) {
            alert("Please load at least two images before attempting to blend");
            return;
        }

        // Add options for each viewer
        viewers.forEach(({index, label}) => {
            const baseOption = document.createElement('option');
            const overlayOption = document.createElement('option');

            baseOption.value = index;
            overlayOption.value = index;

            baseOption.textContent = label;
            overlayOption.textContent = label;

            baseSelect.appendChild(baseOption);
            overlaySelect.appendChild(overlayOption);
        });

        // Update blend value display
        blendSlider.oninput = () => {
            blendValue.textContent = `${blendSlider.value}%`;
        };

        // Handle apply button click
        applyBtn.onclick = async () => {
            const sourceViewer = viewers[baseSelect.value]?.viewer;
            const overlayViewer = viewers[overlaySelect.value]?.viewer;

            if (sourceViewer && overlayViewer) {
                await this.blendImages(sourceViewer, overlayViewer, blendSlider.value / 100);
                modal.style.display = "none";
            } else {
                alert("Please select both base and overlay images");
            }
        };

        // Handle cancel and close
        const closeModal = () => {
            modal.style.display = "none";
        };

        cancelBtn.onclick = closeModal;
        closeBtn.onclick = closeModal;
        window.onclick = (event) => {
            if (event.target === modal) {
                closeModal();
            }
        };

        // Show the modal
        modal.style.display = "block";
    }

    async blendImages(baseViewer, overlayViewer, blendRatio) {
        console.log("Starting image blend with ratio:", blendRatio);

        // Set blend mode state
        this.isBlendMode = true;
        this.baseViewer = baseViewer;
        this.overlayViewer = overlayViewer;

        // Show and set up blend controls
        const blendControls = this.imageContainer.querySelector('.blend-controls-container');
        console.log('Blend controls element:', blendControls);

        if (!blendControls) {
            console.error('Blend controls container not found in image container');
            return;
        }

        const blendSlider = blendControls.querySelector('.blend-slider');
        const blendValue = blendControls.querySelector('.blend-value');
        const baseLabel = blendControls.querySelector('.base-image-label');
        const overlayLabel = blendControls.querySelector('.overlay-image-label');

        // Set labels and initial values
        baseLabel.textContent = this.baseViewer.getLabel() || 'Base Image';
        overlayLabel.textContent = this.overlayViewer.getLabel() || 'Overlay Image';
        blendSlider.value = blendRatio * 100;
        blendValue.textContent = `${Math.round(blendRatio * 100)}%`;

        // Ensure the controls are visible
        blendControls.style.removeProperty('display');
        blendControls.classList.add('visible');
        blendControls.style.visibility = 'visible';
        blendControls.style.opacity = '1';
        blendControls.style.zIndex = '1000';

        // Remove any existing event listeners
        const newSlider = blendSlider.cloneNode(true);
        blendSlider.parentNode.replaceChild(newSlider, blendSlider);

        newSlider.oninput = async (e) => {
            console.log('Slider value changed:', e.target.value);
            const newRatio = e.target.value / 100;
            blendValue.textContent = `${Math.round(newRatio * 100)}%`;
            await this.updateBlendedImage(newRatio);
        };

        // Set the blend label
        this.setLabel(`Blend: ${this.baseViewer.getLabel()} + ${this.overlayViewer.getLabel()}`);

        await this.updateBlendedImage(blendRatio);
    }

    async updateBlendedImage(blendRatio) {
        console.log('Updating blend with ratio:', blendRatio);

        // Get global min/max values for both images
        const baseMin = this.baseViewer.minVal;
        const baseMax = this.baseViewer.maxVal;
        const overlayMin = this.overlayViewer.minVal;
        const overlayMax = this.overlayViewer.maxVal;

        // Store current state before updating
        const currentSlice = this.currentSlice;
        const currentWindowCenter = this.windowCenter;
        const currentWindowWidth = this.windowWidth;

        // Helper function to convert array buffer to base64 in chunks
        const arrayBufferToBase64 = (buffer) => {
            const bytes = new Uint8Array(buffer);
            const chunkSize = 0x8000; // Process in 32KB chunks
            let binary = '';

            for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.slice(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, chunk);
            }

            return btoa(binary);
        };

        // Create array to store the blended slices
        const blendedSlices = [];
        const totalSlices = Math.min(this.baseViewer.totalSlices, this.overlayViewer.totalSlices);

        // Process each slice
        for (let slice = 0; slice < totalSlices; slice++) {
            console.log(`Processing slice ${slice + 1}/${totalSlices}`);

            // Get slice data
            let baseSlice, overlaySlice;
            try {
                baseSlice = await this.baseViewer.loadSliceData(slice);
                overlaySlice = await this.overlayViewer.loadSliceData(slice);
            } catch (error) {
                console.error(`Error loading slice ${slice}:`, error);
                continue;
            }

            // Create the blended slice
            const blendedSlice = new Float32Array(baseSlice.length);

            // Blend pixel values
            for (let i = 0; i < blendedSlice.length; i++) {
                blendedSlice[i] = (1 - blendRatio) * baseSlice[i] + blendRatio * overlaySlice[i];
            }

            // Convert the blended slice to base64
            const buffer = new ArrayBuffer(blendedSlice.length * 4);
            const view = new DataView(buffer);
            for (let i = 0; i < blendedSlice.length; i++) {
                view.setFloat32(i * 4, blendedSlice[i], true);
            }

            // Convert to base64 using chunked approach
            const base64Slice = arrayBufferToBase64(buffer);
            blendedSlices.push(base64Slice);
        }

        // Create the blended image data right away to see changes
        this.imageData = blendedSlices;
        this.width = this.baseViewer.width;
        this.height = this.baseViewer.height;
        this.minVal = Math.min(baseMin, overlayMin);
        this.maxVal = Math.max(baseMax, overlayMax);
        this.totalSlices = blendedSlices.length;

        // Force display update
        await this.updateSlice();

        // Create result object to maintain state
        const result = {
            data: blendedSlices,
            metadata: {
                dimensions: [this.baseViewer.width, this.baseViewer.height],
                min_value: Math.min(baseMin, overlayMin),
                max_value: Math.max(baseMax, overlayMax),
                voxel_dimensions: [
                    this.baseViewer.voxelWidth,
                    this.baseViewer.voxelHeight,
                    this.baseViewer.voxelDepth
                ]
            },
            isBlendMode: true,
            baseViewer: this.baseViewer,
            overlayViewer: this.overlayViewer
        };

        // Update the image using loadImageData to ensure consistent state management
        this.loadImageData(result);

        // Restore state
        this.currentSlice = Math.min(currentSlice, this.totalSlices - 1);
        this.windowCenter = currentWindowCenter;
        this.windowWidth = currentWindowWidth;
        this.updateSlice();
    }
}

function initializeGridLayout() {
    const gridSelect = document.getElementById("gridLayout");
    if (!gridSelect) return;

    const layout = gridSelect.value.split("x");
    const rows = parseInt(layout[0]);
    const cols = parseInt(layout[1]);
    const totalViewers = rows * cols;

    const imageGrid = document.querySelector(".image-grid");
    if (!imageGrid) return;

    // Store existing viewer states
    const existingViewers = Array.from(document.querySelectorAll(".image-window")).map(container => {
        if (container.viewer) {
            return {
                state: container.viewer.getState(),
                label: container.viewer.getLabel()
            };
        }
        return null;
    }).filter(state => state !== null);

    // Clear existing viewers
    imageGrid.innerHTML = '';

    imageGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    imageGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    // Create new viewers and restore states
    for (let i = 0; i < totalViewers; i++) {
        const viewer = createImageViewer();
        if (i < existingViewers.length && viewer) {
            viewer.setLabel(existingViewers[i].label);
            viewer.setState(existingViewers[i].state);
        }
    }
}

function updateGridLayout(event) {
    const layout = event.target.value.split("x");
    const rows = parseInt(layout[0]);
    const cols = parseInt(layout[1]);
    const totalViewers = rows * cols;

    const imageGrid = document.querySelector(".image-grid");
    if (!imageGrid) return;

    // Store existing viewer states
    const existingViewers = Array.from(document.querySelectorAll(".image-window")).map(container => {
        if (container.viewer) {
            return {
                state: container.viewer.getState(),
                label: container.viewer.getLabel()
            };
        }
        return null;
    }).filter(state => state !== null);

    // Clear existing viewers
    imageGrid.innerHTML = '';

    imageGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    imageGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    // Create new viewers and restore states
    for (let i = 0; i < totalViewers; i++) {
        const viewer = createImageViewer();
        if (i < existingViewers.length && viewer) {
            viewer.setLabel(existingViewers[i].label);
            viewer.setState(existingViewers[i].state);
        }
    }
}

// Initialize event listeners for toolbar buttons
function initializeToolbarButtons(container) {
    // Remove the upload button handler as it's handled in setupEventListeners
    const viewModeBtn = container.querySelector(".view-mode-btn");
    const rotateBtn = container.querySelector(".rotate-btn");
    const roiBtn = container.querySelector(".roi-btn");
    const labelSelect = container.querySelector(".image-label");

    if (viewModeBtn) {
        viewModeBtn.addEventListener("click", () => {
            if (container.viewer) {
                container.viewer.toggleViewMode();
            }
        });
    }

    if (rotateBtn) {
        rotateBtn.addEventListener("click", () => {
            if (container.viewer) {
                container.viewer.showRotate180Dialog();
            }
        });
    }

    if (roiBtn) {
        roiBtn.addEventListener("click", () => {
            if (container.viewer) {
                container.viewer.toggleROIMode();
            }
        });
    }

    if (labelSelect) {
        labelSelect.addEventListener("change", (event) => {
            if (container.viewer) {
                container.viewer.imageLabel = event.target.value;
            }
        });
    }
}

function createImageViewer() {
    const imageGrid = document.querySelector(".image-grid");
    const template = document.getElementById("imageWindowTemplate");
    if (!imageGrid || !template) return null;

    const viewer = template.content.cloneNode(true);
    const container = viewer.querySelector(".image-window");
    if (!container) return null;
    imageGrid.appendChild(container);

    const viewerInstance = new ImageViewer(container);
    container.viewer = viewerInstance;

    // Initialize toolbar buttons for the new viewer
    initializeToolbarButtons(container);

    return viewerInstance;
}

function createImageWindow(imageData, metadata) {
    const viewer = createImageViewer();
    if (viewer) {
        viewer.setLabel(metadata.label);
        const state = {
            imageData: imageData,
            width: metadata.dimensions[0],
            height: metadata.dimensions[1],
            minVal: metadata.min_value,
            maxVal: metadata.max_value,
            totalSlices: imageData.length,
            currentSlice: 0,
            windowCenter: (metadata.max_value + metadata.min_value) / 2,
            windowWidth: metadata.max_value - metadata.min_value,
            voxelWidth: metadata.voxel_dimensions[0],
            voxelHeight: metadata.voxel_dimensions[1],
            voxelDepth: metadata.voxel_dimensions[2]
        };
        viewer.setState(state);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
        setTimeout(initializeGridLayout, 100),
    );
} else {
    setTimeout(initializeGridLayout, 100);
}

document
    .getElementById("gridLayout")
    ?.addEventListener("change", updateGridLayout);

window.ImageViewer = ImageViewer;