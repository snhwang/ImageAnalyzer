const BASE_URL = window.location.protocol + "//" + window.location.hostname + ":5000";

class ImageViewer {
    constructor(container, state = null) {
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
        // Mouse wheel for slice navigation
        const renderCanvas = this.container.querySelector(".image-container canvas");
        if(renderCanvas){
            renderCanvas.addEventListener("wheel", (e) => {
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
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const result = await response.json();
            if (result.success) {
                this.container.classList.add("has-image");
                const img = this.container.querySelector("img");
                if (img) {
                    // Construct full URL
                    const imageUrl = `${BASE_URL}${result.url}`;
                    img.src = imageUrl;
                    img.style.display = "block";
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

    getState() {
        return {
            windowCenter: this.windowCenter,
            windowWidth: this.windowWidth,
            currentSlice: this.currentSlice,
            totalSlices: this.totalSlices,
            imageId: this.imageId,
            rotation: this.rotation,
            currentLabel: this.currentLabel
        };
    }

    updateWindowingInfo() {
        if (this.imageInfo) {
            this.imageInfo.textContent = `Window: C: ${Math.round(this.windowCenter)} W: ${Math.round(this.windowWidth)} | Slice: ${this.currentSlice + 1}/${this.totalSlices}`;
        }
    }

    loadSlice(sliceNumber) {
        // Implementation will be added when slice handling is needed
        console.log("Load slice:", sliceNumber);
    }

    updateSliceInfo() {
        // Implementation will be added when slice handling is needed
        console.log("Update slice info");
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