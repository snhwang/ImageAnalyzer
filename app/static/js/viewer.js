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

        // Initialize canvas
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.position = "absolute";
        this.canvas.style.top = "0";
        this.canvas.style.left = "0";
        this.imageContainer.querySelector(".canvas-container").appendChild(this.canvas);

        // ROI canvas
        this.roiCanvas = document.createElement("canvas");
        this.roiCtx = this.roiCanvas.getContext("2d");
        this.roiCanvas.style.width = "100%";
        this.roiCanvas.style.height = "100%";
        this.roiCanvas.style.position = "absolute";
        this.roiCanvas.style.top = "0";
        this.roiCanvas.style.left = "0";
        this.roiCanvas.style.pointerEvents = "none";
        this.imageContainer.querySelector(".canvas-container").appendChild(this.roiCanvas);

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
            console.log("View mode toggled");
            this.toggleViewMode();
        });

        // Window level toggle
        this.windowLevelBtn?.addEventListener("click", () => {
            console.log("Window level toggled");
            this.toggleWindowLevelMode();
        });

        // Optimize window with ROI
        this.optimizeWindowBtn?.addEventListener("click", () => {
            console.log("Optimize window toggled");
            this.toggleOptimizeWindow();
        });

        // Rotation buttons
        this.rotateLeftBtn?.addEventListener("click", () => {
            console.log("Rotate left clicked");
            this.rotate(-90);
        });

        this.rotateRightBtn?.addEventListener("click", () => {
            console.log("Rotate right clicked");
            this.rotate(90);
        });

        // Menu button handling
        this.menuBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            const menuContainer = this.menuBtn.closest('.menu-container');
            menuContainer.classList.toggle('show');
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
            }
        });

        this.roiCanvas.addEventListener("mouseup", () => {
            if (this.isDrawingROI) {
                this.isDrawingROI = false;
                this.optimizeWindowFromROI();
            }
        });

        // Window/Level drag handling
        this.canvas.addEventListener("mousedown", (e) => {
            if (!this.is3DMode && this.windowLevelBtn.classList.contains("active")) {
                this.isDragging = true;
                this.dragStart = { x: e.clientX, y: e.clientY };
                this.startWindowCenter = this.windowCenter;
                this.startWindowWidth = this.windowWidth;
            }
        });

        this.canvas.addEventListener("mousemove", (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.dragStart.x;
                const dy = this.dragStart.y - e.clientY;  // Invert Y for natural feel

                // Adjust window/level based on drag distance
                this.windowWidth = Math.max(1, this.startWindowWidth + dx);
                this.windowCenter = this.startWindowCenter + dy;

                console.log(`Window/Level: C=${this.windowCenter}, W=${this.windowWidth}`);
                this.updateSlice();
            }
        });

        this.canvas.addEventListener("mouseup", () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener("mouseleave", () => {
            this.isDragging = false;
        });

        // Mouse wheel for slice navigation
        this.canvas.addEventListener("wheel", (e) => {
            if (!this.is3DMode && this.totalSlices > 1) {
                e.preventDefault();
                const delta = Math.sign(e.deltaY);
                this.currentSlice = Math.max(0, Math.min(this.totalSlices - 1, this.currentSlice + delta));
                console.log(`Slice changed to ${this.currentSlice + 1}/${this.totalSlices}`);
                this.updateSlice();
            }
        });

        // Handle window resize
        window.addEventListener("resize", () => {
            this.resizeCanvas();
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
        const scaleX = this.width / this.canvas.width;
        const scaleY = this.height / this.canvas.height;

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

    resizeCanvas() {
        const container = this.imageContainer.querySelector(".canvas-container");
        const rect = container.getBoundingClientRect();

        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.roiCanvas.width = rect.width;
        this.roiCanvas.height = rect.height;

        if (!this.is3DMode) {
            this.updateSlice();
        }
    }

    toggleViewMode() {
        this.is3DMode = !this.is3DMode;
        this.viewModeBtn.classList.toggle("active");
        this.windowLevelBtn.classList.remove("active");
        this.optimizeWindowBtn.classList.remove("active");

        if (this.is3DMode) {
            this.camera.attachControl(this.canvas, true);
            this.camera.alpha = 0;
            this.camera.beta = Math.PI / 3;
            this.camera.radius = 10;
            this.canvas.style.pointerEvents = "none";
            this.roiCanvas.style.display = "none";
        } else {
            this.camera.detachControl();
            this.camera.alpha = 0;
            this.camera.beta = 0;
            this.camera.radius = 5;
            this.canvas.style.pointerEvents = "auto";
            this.roiCanvas.style.display = "block";
            this.resizeCanvas();
        }

        this.updateSlice();
    }

    toggleWindowLevelMode() {
        if (!this.is3DMode) {
            this.windowLevelBtn.classList.toggle("active");
            this.optimizeWindowBtn.classList.remove("active");
            this.canvas.style.cursor = this.windowLevelBtn.classList.contains("active") ? "crosshair" : "default";
        }
    }

    toggleOptimizeWindow() {
        if (!this.is3DMode) {
            this.optimizeWindowBtn.classList.toggle("active");
            this.windowLevelBtn.classList.remove("active");
            this.roiCanvas.style.pointerEvents = this.optimizeWindowBtn.classList.contains("active") ? "auto" : "none";
            this.canvas.style.cursor = "default";

            if (!this.optimizeWindowBtn.classList.contains("active")) {
                this.roiCtx.clearRect(0, 0, this.roiCanvas.width, this.roiCanvas.height);
                this.roiStart = null;
                this.roiEnd = null;
            }
        }
    }

    rotate(degrees) {
        if (!this.is3DMode) {
            this.rotation = (this.rotation + degrees) % 360;
            console.log(`Rotating image by ${degrees} degrees, total rotation: ${this.rotation}`);
            this.updateSlice();
        }
    }

    updateInfoDisplay() {
        const infoElement = this.container.querySelector(".image-info");
        if (infoElement) {
            infoElement.textContent = `Window: C: ${Math.round(this.windowCenter)} W: ${Math.round(this.windowWidth)} | Slice: ${this.currentSlice + 1}/${this.totalSlices}`;
        }
    }

    updateSlice() {
        if (!this.imageData || !this.imageData.length) return;

        const currentSliceData = this.imageData[this.currentSlice];
        const binaryString = atob(currentSliceData);
        const pixels = new Float32Array(binaryString.length / 4);

        // Convert binary string to Float32Array
        for (let i = 0; i < binaryString.length; i += 4) {
            const value =
                binaryString.charCodeAt(i) |
                (binaryString.charCodeAt(i + 1) << 8) |
                (binaryString.charCodeAt(i + 2) << 16) |
                (binaryString.charCodeAt(i + 3) << 24);
            pixels[i / 4] = new Float32Array(new Uint32Array([value]).buffer)[0];
        }

        // Apply window/level
        const minVal = this.minVal;
        const maxVal = this.maxVal;
        const windowCenter = this.windowCenter || (maxVal + minVal) / 2;
        const windowWidth = this.windowWidth || (maxVal - minVal);
        const low = windowCenter - windowWidth / 2;
        const high = windowCenter + windowWidth / 2;

        const imgWidth = this.width;
        const imgHeight = this.height;

        // Create a temporary canvas for rotation
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgWidth;
        tempCanvas.height = imgHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Create ImageData for the original orientation
        const imageData = new ImageData(imgWidth, imgHeight);
        const data = imageData.data;

        // Apply window/level to pixel data
        for (let i = 0; i < pixels.length; i++) {
            const value = pixels[i];
            let normalizedValue = (value - low) / (high - low);
            normalizedValue = Math.max(0, Math.min(1, normalizedValue));

            const pixelValue = Math.round(normalizedValue * 255);
            const index = i * 4;
            data[index] = pixelValue;     // R
            data[index + 1] = pixelValue; // G
            data[index + 2] = pixelValue; // B
            data[index + 3] = 255;        // A
        }

        // Put the image data on the temporary canvas
        tempCtx.putImageData(imageData, 0, 0);

        // Clear the main canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Set up the transform for rotation
        if (this.rotation !== 0) {
            this.ctx.save();
            this.ctx.translate(this.canvas.width/2, this.canvas.height/2);
            this.ctx.rotate(this.rotation * Math.PI / 180);
            this.ctx.translate(-this.canvas.width/2, -this.canvas.height/2);
        }

        // Draw the image centered
        const scale = Math.min(this.canvas.width / imgWidth, this.canvas.height / imgHeight);
        const x = (this.canvas.width - imgWidth * scale) / 2;
        const y = (this.canvas.height - imgHeight * scale) / 2;
        this.ctx.drawImage(tempCanvas, x, y, imgWidth * scale, imgHeight * scale);

        if (this.rotation !== 0) {
            this.ctx.restore();
        }

        // Update display info
        const infoElement = this.container.querySelector(".image-info");
        if (infoElement) {
            infoElement.textContent = `Window: C: ${Math.round(windowCenter)} W: ${Math.round(windowWidth)} | Slice: ${this.currentSlice + 1}/${this.totalSlices}`;
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

                this.resizeCanvas();
                this.updateSlice();
            } else {
                console.error("Upload failed:", result.message);
            }
        } catch (error) {
            console.error("Error uploading file:", error);
        }
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