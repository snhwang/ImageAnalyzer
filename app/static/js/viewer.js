const BASE_URL = window.location.origin;

class ImageViewer {
    constructor(container) {
        this.container = container;
        // Attach viewer instance to container element
        container.viewer = this;
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
        this.imageLabel = "";

        const labelSelect = this.container.querySelector(".image-label");
        if (labelSelect) {
            this.imageLabel = labelSelect.value;
        }

        this.canvas2D = document.createElement("canvas");
        this.ctx2D = this.canvas2D.getContext("2d");
        this.canvas2D.style.width = "100%";
        this.canvas2D.style.height = "100%";
        this.canvas2D.style.position = "absolute";
        this.canvas2D.style.top = "0";
        this.canvas2D.style.left = "0";
        this.canvas2D.style.display = "none";
        this.canvas2D.style.userSelect = "none";
        this.imageContainer
            .querySelector(".canvas-container")
            .appendChild(this.canvas2D);

        this.canvas3D = document.createElement("canvas");
        this.canvas3D.style.width = "100%";
        this.canvas3D.style.height = "100%";
        this.canvas3D.style.position = "absolute";
        this.canvas3D.style.top = "0";
        this.canvas3D.style.left = "0";
        this.canvas3D.style.userSelect = "none";
        this.imageContainer
            .querySelector(".canvas-container")
            .appendChild(this.canvas3D);

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
        this.imageContainer
            .querySelector(".canvas-container")
            .appendChild(this.roiCanvas);

        this.uploadOverlay = this.container.querySelector(".upload-overlay");

        this.fileInput = container.querySelector(".hidden-file-input");
        this.uploadBtn = container.querySelector(".upload-btn");
        this.viewModeBtn = container.querySelector(".view-mode-btn");
        this.windowLevelBtn = container.querySelector(".window-level-btn");
        this.optimizeWindowBtn = container.querySelector(
            ".optimize-window-btn",
        );
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

        this.setupEventListeners();
        this.initializeBabylonScene();
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

        this.viewModeBtn?.addEventListener("click", () => {
            console.log("View mode button clicked");
            this.toggleViewMode();
        });

        this.windowLevelBtn?.addEventListener("click", () => {
            console.log("Window level button clicked");
            this.toggleWindowLevelMode();
        });

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
            if (
                !this.is3DMode &&
                this.windowLevelBtn.classList.contains("active")
            ) {
                console.log("Starting window/level adjustment");
                this.isDragging = true;
                this.dragStart = { x: e.clientX, y: e.clientY };
                this.startWindowCenter = this.windowCenter;
                this.startWindowWidth = this.windowWidth;
                e.preventDefault();
            }
        });

        this.canvas2D.addEventListener("mousemove", (e) => {
            if (
                this.isDragging &&
                this.windowLevelBtn.classList.contains("active")
            ) {
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

        this.canvas2D.style.display = this.is3DMode ? "none" : "block";
        this.canvas3D.style.display = this.is3DMode ? "block" : "none";
        this.roiCanvas.style.display = this.is3DMode ? "none" : "block";

        this.canvas2D.style.pointerEvents = this.is3DMode ? "none" : "auto";
        this.canvas3D.style.pointerEvents = this.is3DMode ? "auto" : "none";

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
            this.canvas2D.style.cursor = this.windowLevelBtn.classList.contains(
                "active",
            )
                ? "crosshair"
                : "default";
            this.roiCanvas.style.pointerEvents = "none";
        }
    }

    toggleOptimizeWindow() {
        if (!this.is3DMode) {
            console.log("Toggling optimize window mode");
            this.optimizeWindowBtn.classList.toggle("active");
            this.windowLevelBtn.classList.remove("active");

            if (this.optimizeWindowBtn.classList.contains("active")) {
                this.roiCanvas.style.pointerEvents = "auto";
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

        const windowWidthScale = (this.maxVal - this.minVal) / 500;
        const windowCenterScale = (this.maxVal - this.minVal) / 500;

        this.windowWidth = Math.max(
            1,
            this.startWindowWidth + dx * windowWidthScale,
        );
        this.windowCenter = this.startWindowCenter + dy * windowCenterScale;

        this.windowCenter = Math.max(
            this.minVal,
            Math.min(this.maxVal, this.windowCenter),
        );

        console.log(
            `Window/Level adjusted - C: ${this.windowCenter}, W: ${this.windowWidth}`,
        );
        this.updateSlice();
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
        if (!this.imageData || !this.imageData.length) return;

        if (this.is3DMode) {
            this.updateTexture();
            return;
        }

        const pixels = await this.loadSliceData(this.currentSlice);

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = this.width;
        tempCanvas.height = this.height;
        const tempCtx = tempCanvas.getContext("2d");

        const imageData = new ImageData(this.width, this.height);
        const data = imageData.data;

        const low = this.windowCenter - this.windowWidth / 2;
        const high = this.windowCenter + this.windowWidth / 2;
        const range = high - low;
        const scale = 255 / range;

        const length = pixels.length;
        for (let i = 0; i < length; i++) {
            const value = pixels[i];
            const normalizedValue = Math.max(
                0,
                Math.min(1, (value - low) / range),
            );
            const pixelValue = Math.round(normalizedValue * 255);
            const index = i << 2;
            data[index] = pixelValue;
            data[index + 1] = pixelValue;
            data[index + 2] = pixelValue;
            data[index + 3] = 255;
        }

        tempCtx.putImageData(imageData, 0, 0);

        requestAnimationFrame(() => {
            this.ctx2D.clearRect(
                0,
                0,
                this.canvas2D.width,
                this.canvas2D.height,
            );

            if (this.rotation !== 0) {
                this.ctx2D.save();
                this.ctx2D.translate(
                    this.canvas2D.width / 2,
                    this.canvas2D.height / 2,
                );
                this.ctx2D.rotate((this.rotation * Math.PI) / 180);
                this.ctx2D.translate(
                    -this.canvas2D.width / 2,
                    -this.canvas2D.height / 2,
                );
            }

            const scale = Math.min(
                this.canvas2D.width / this.width,
                this.canvas2D.height / this.height,
            );
            const x = (this.canvas2D.width - this.width * scale) / 2;
            const y = (this.canvas2D.height - this.height * scale) / 2;

            this.ctx2D.drawImage(
                tempCanvas,
                x,
                y,
                this.width * scale,
                this.height * scale,
            );

            if (this.rotation !== 0) {
                this.ctx2D.restore();
            }

            const infoElement = this.container.querySelector(".image-info");
            if (infoElement) {
                infoElement.textContent = `Window: C: ${Math.round(this.windowCenter)} W: ${Math.round(this.windowWidth)} | Slice: ${this.currentSlice + 1}/${this.totalSlices}`;
            }
        });
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
                BABYLON.Engine.TEXTURETYPE_FLOAT,
            );

            const material = new BABYLON.StandardMaterial(
                "imageMaterial",
                this.scene,
            );
            material.diffuseTexture = this.texture;
            material.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
            material.useFloatValues = true;

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
        };
    }

    setState(state) {
        if (!state) return;

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

        if (this.imageData) {
            this.resizeCanvases();
            this.canvas2D.style.display = this.is3DMode ? "none" : "block";
            this.canvas3D.style.display = this.is3DMode ? "block" : "none";
            this.roiCanvas.style.display = this.is3DMode ? "none" : "block";

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

        this.camera = new BABYLON.ArcRotateCamera(
            "camera",
            0,
            Math.PI / 3,
            10,
            BABYLON.Vector3.Zero(),
            this.scene,
        );
        this.camera.setTarget(BABYLON.Vector3.Zero());
        this.camera.attachControl(this.canvas3D, true);

        const material = new BABYLON.StandardMaterial(
            "cubeMaterial",
            this.scene,
        );
        material.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        material.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);

        this.cube = BABYLON.MeshBuilder.CreateBox(
            "cube",
            { size: 2 },
            this.scene,
        );
        this.cube.material = material;

        new BABYLON.HemisphericLight(
            "light",
            new BABYLON.Vector3(0, 1, 0),
            this.scene,
        );

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
                `${BASE_URL}/load?path=${encodeURIComponent(path)}`,
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
        this.roiCtx.clearRect(
            0,
            0,
            this.roiCanvas.width,
            this.roiCanvas.height,
        );

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
    }

    loadImageData(result) {
        this.imageData = result.data;
        this.totalSlices = this.imageData.length;
        this.currentSlice = 0;
        this.minVal = result.metadata.min_value;
        this.maxVal = result.metadata.max_value;
        this.width = result.metadata.dimensions[0];
        this.height = result.metadata.dimensions[1];

        this.windowWidth = (this.maxVal - this.minVal) / 2;
        this.windowCenter = this.minVal + this.windowWidth;

        if (this.is3DMode) {
            this.toggleViewMode();
        }

        this.resizeCanvases();
        this.updateSlice();
    }

    async showDirectoryBrowser(path = "images") {
        console.log("Showing directory browser for path:", path);
        this.urlImportModal.classList.add("show");
        this.currentPathElement.textContent = path;

        try {
            this.directoryList.innerHTML =
                '<div class="loading">Loading...</div>';

            const response = await fetch(
                `${BASE_URL}/directory?path=${encodeURIComponent(path)}`,
                        );
            if (!response.ok) {
                throw new Error(`Failed to load directory: ${response.statusText}`,
                );
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
                    this.showDirectoryBrowser(parentPath),
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
                    fileElement.className = "directoryitem image";
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

        // Get all viewers with loaded images
        const viewers = Array.from(document.querySelectorAll(".viewer-container"))
            .map((container) => container.viewer)
            .filter(viewer => viewer && viewer.imageData);

        if (viewers.length < 2) {
            alert("Please load at least two images before attempting registration");
            return;
        }

        const sourceSelect = document.getElementById("registrationSourceSelect");
        const targetSelect = document.getElementById("registrationTargetSelect");

        // Clear previous options
        sourceSelect.innerHTML = '<option value="">Select moving image...</option>';
        targetSelect.innerHTML = '<option value="">Select fixed image...</option>';

        // Add options for each viewer
        viewers.forEach((viewer, index) => {
            const label = viewer.getLabel() || `Image ${index + 1}`;
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
            try {
                const sourceIndex = parseInt(sourceSelect.value);
                const targetIndex = parseInt(targetSelect.value);

                if (isNaN(sourceIndex) || isNaN(targetIndex)) {
                    alert("Please select both moving and fixed images");
                    return;
                }

                const movingViewer = viewers[sourceIndex];
                const fixedViewer = viewers[targetIndex];

                if (!movingViewer || !fixedViewer) {
                    alert("Selected viewers not found");
                    return;
                }

                const requestData = {
                    moving_image: {
                        data: movingViewer.imageData,
                        metadata: {
                            dimensions: [movingViewer.width, movingViewer.height],
                            min_value: movingViewer.minVal,
                            max_value: movingViewer.maxVal
                        }
                    },
                    fixed_image: {
                        data: fixedViewer.imageData,
                        metadata: {
                            dimensions: [fixedViewer.width, fixedViewer.height],
                            min_value: fixedViewer.minVal,
                            max_value: fixedViewer.maxVal
                        }
                    }
                };

                modal.classList.add("loading");
                const response = await fetch(`${BASE_URL}/api/registration`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(requestData)
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || "Registration failed");
                }

                if (result.success && result.data) {
                    // Update the moving image viewer with registered data
                    movingViewer.loadImageData(result);
                    modal.classList.remove("show");
                    modal.classList.remove("loading");
                } else {
                    throw new Error(result.message || "Registration failed");
                }
            } catch (error) {
                modal.classList.remove("loading");
                console.error("Registration error:", error);
                alert(`Registration failed: ${error.message}`);
            }
        });

        newCancelBtn.addEventListener("click", () => {
            modal.classList.remove("show");
        });

        // Show the modal
        modal.classList.add("show");
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

}

function updateGridLayout() {
    const gridSelect = document.getElementById("gridLayout");
    const imageGrid = document.querySelector(".image-grid");
    const template = document.getElementById("imageWindowTemplate");

    if (!gridSelect || !imageGrid || !template) {
        console.error("Required elements not found. Retrying in 500ms...");
        setTimeout(updateGridLayout, 500);
        return;
    }

    const layout = gridSelect.value.split("x");
    const rows = parseInt(layout[0]);
    const cols = parseInt(layout[1]);
    const totalViewers = rows * cols;

    const existingStates = Array.from(imageGrid.children).map((container) => {
        return container.viewer?.getState();
    });

    while (imageGrid.firstChild) {
        const viewer = imageGrid.firstChild.viewer;
        if (viewer) {
            viewer.cleanup && viewer.cleanup();
        }
        imageGrid.removeChild(imageGrid.firstChild);
    }

    imageGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    imageGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    for (let i = 0; i < totalViewers; i++) {
        try {
            const viewer = template.content.cloneNode(true);
            const container = viewer.querySelector(".image-window");

            if (!container) {
                console.error("Container not found in template!");
                continue;
            }

            container.id = `viewer-${i + 1}`;

            imageGrid.appendChild(container);

            requestAnimationFrame(() => {
                try {
                    const viewerInstance = new ImageViewer(container);
                    container.viewer = viewerInstance;

                    if (existingStates[i]) {
                        viewerInstance.setState(existingStates[i]);
                    }
                } catch (error) {
                    console.error(`Error initializing viewer ${i + 1}:`, error);
                }
            });
        } catch (error) {
            console.error(`Error creating viewer ${i + 1}:`, error);
        }
    }
}

function initializeGridLayout() {
    const gridSelect = document.getElementById("gridLayout");
    if (!gridSelect) {
        console.warn("Grid select not found, retrying in 100ms...");
        setTimeout(initializeGridLayout, 100);
        return;
    }

    gridSelect.addEventListener("change", updateGridLayout);
    updateGridLayout();
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
        };
        viewer.setState(state);
    }
}