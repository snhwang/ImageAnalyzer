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

        // Initialize UI elements
        this.initializeUI();

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
        this.canvas = this.container.querySelector("canvas") || document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");
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

            // Adjust window width with horizontal movement
            this.windowWidth = Math.max(1, this.windowWidth + deltaX);

            // Adjust window center with vertical movement
            this.windowCenter = this.windowCenter - deltaY;

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.updateWindowingInfo();
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
                this.currentSlice = Math.min(
                    this.currentSlice + 1,
                    this.totalSlices - 1
                );
            } else {
                this.currentSlice = Math.max(this.currentSlice - 1, 0);
            }

            this.updateWindowingInfo();
            this.loadSlice(this.currentSlice);
        });

        // Rotation buttons
        this.rotateLeftBtn?.addEventListener("click", () => {
            if (this.container.classList.contains("has-image")) {
                this.rotation = (this.rotation || 0) - 90;
                this.updateDisplayRotation();
            }
        });

        this.rotateRightBtn?.addEventListener("click", () => {
            if (this.container.classList.contains("has-image")) {
                this.rotation = (this.rotation || 0) + 90;
                this.updateDisplayRotation();
            }
        });

        // Menu handling
        const menuBtn = this.container.querySelector(".menu-btn");
        const menuContainer = this.container.querySelector(".menu-container");

        if (menuBtn && menuContainer) {
            menuBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                menuContainer.classList.toggle("show");
            });

            document.addEventListener("click", () => {
                menuContainer.classList.remove("show");
            });
        }

        // Drag and drop handling
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

    updateDisplayRotation() {
        const img = this.container.querySelector("img");
        if (img) {
            img.style.transform = `rotate(${this.rotation}deg)`;
        }
    }

    async uploadFile(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${BASE_URL}/upload`, {
                method: 'POST',
                body: formData,
                credentials: 'same-origin'
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const result = await response.json();
            if (result.success) {
                this.container.classList.add("has-image");
                const img = this.container.querySelector("img");
                if (img) {
                    img.src = result.url;
                    img.style.display = "block";
                }

                // Update metadata
                if (result.metadata) {
                    this.totalSlices = result.metadata.total_slices;
                    this.currentSlice = 0;
                    this.dimensions = result.metadata.dimensions;
                    this.imageType = result.metadata.type;
                    this.updateWindowingInfo();
                }
            } else {
                this.showError(result.message || "Upload failed");
            }
        } catch (error) {
            console.error("Error uploading file:", error);
            this.showError(error.message);
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

    loadSlice(sliceNumber) {
        // Implementation will be added when slice handling is needed
        console.log("Load slice:", sliceNumber);
    }

    updateSliceInfo() {
        this.updateWindowingInfo();
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