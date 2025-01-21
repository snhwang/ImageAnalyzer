const BASE_URL = "";

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

        // Debug logs for file input
        console.log("Container:", container);
        console.log("Hidden file inputs in container:", container.querySelectorAll(".hidden-file-input"));
        this.fileInput = container.querySelector(".hidden-file-input");
        console.log("Selected file input:", this.fileInput);

        this.uploadBtn = container.querySelector(".upload-btn");
        this.browseBtn = container.querySelector(".browse-btn");
        this.rotateLeftBtn = container.querySelector(".rotate-left-btn");
        this.rotateRightBtn = container.querySelector(".rotate-right-btn");
        this.optimizeWindowBtn = container.querySelector(".optimize-window-btn");
        this.windowLevelBtn = container.querySelector(".window-level-btn");
        this.toolbar = container.querySelector(".toolbar");
        this.slices = state ? state.slices : [];
        this.rotation = state ? state.rotation : 0;
        this.mode = "window-level"; // 'window-level' or 'roi'
        this.isDrawingROI = false;
        this.roiPoints = [];
        this.lastBrowsePath = "images"; // Store last browsed path
        this.currentImagePath = ""; // Store current image path

        // Remove any existing dropdown
        const existingDropdown = this.toolbar.querySelector(".image-label");
        if (existingDropdown) {
            existingDropdown.remove();
        }

        // Create image element for loading if it doesn't exist
        this.img = this.imageContainer.querySelector("img");
        if (!this.img) {
            this.img = document.createElement("img");
            this.imageContainer.querySelector(".canvas-container").appendChild(this.img);
        }
        this.img.style.display = "none";

        // Set up image onload handler
        this.img.onload = () => {
            this.canvas.width = this.img.width;
            this.canvas.height = this.img.height;
            this.roiCanvas.width = this.canvas.width;
            this.roiCanvas.height = this.canvas.height;
            this.applyWindowLevel();
        };

        if (state && state.imageId) {
            // Restore image if state exists
            this.container.classList.add("has-image");
            this.addImageLabelDropdown();
            this.loadSlice(this.currentSlice);
            this.updateWindowingInfo();
        }

        // Create canvas for image manipulation
        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.display = "none";

        // Set willReadFrequently to true since getImageData is called multiple times
        this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
        this.imageContainer.appendChild(this.canvas);

        // getImageData is called multiple times, so we cache the result
        this.cachedImageData = null;
        this.cachedImageDataWillReadFrequently = true;

        // Create ROI canvas
        this.roiCanvas = document.createElement("canvas");
        this.roiCanvas.className = "roi-canvas";
        this.roiCtx = this.roiCanvas.getContext("2d");
        this.imageContainer.appendChild(this.roiCanvas);

        // Add resize handler
        this.resizeHandler = () => {
            if (this.img.complete && this.img.src) {
                this.applyWindowLevel();
            }
        };
        window.addEventListener("resize", this.resizeHandler);

        this.setupEventListeners();
        this.dataMin = 0; // Initialize dataMin and dataMax.  These values need to be set correctly elsewhere in your code based on the image data.
        this.dataMax = 255; //  Ideally this would come from the image metadata or processing step.
    }

    getState() {
        return {
            windowCenter: this.windowCenter,
            windowWidth: this.windowWidth,
            currentSlice: this.currentSlice,
            totalSlices: this.totalSlices,
            imageId: this.imageId,
            slices: this.slices,
            rotation: this.rotation,
            currentLabel: this.currentLabel
        };
    }

    setupEventListeners() {
        // Upload button click
        this.uploadBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.fileInput.click();
        });

        // Rotation buttons
        this.rotateLeftBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.container.classList.contains("has-image")) {
                this.rotation = (this.rotation - 90) % 360;
                this.applyWindowLevel();
            }
        });

        this.rotateRightBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.container.classList.contains("has-image")) {
                this.rotation = (this.rotation + 90) % 360;
                this.applyWindowLevel();
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
                            this.applyWindowLevel();
                        }
                        break;
                    case "rotate-right":
                        if (this.container.classList.contains("has-image")) {
                            this.rotation = (this.rotation + 90) % 360;
                            this.applyWindowLevel();
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

        // Drag and drop events
        this.container.addEventListener("dragenter", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.container.classList.add("drag-over");
        });

        this.container.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        this.container.addEventListener("dragleave", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!this.container.contains(e.relatedTarget)) {
                this.container.classList.remove("drag-over");
            }
        });

        this.container.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.container.classList.remove("drag-over");

            const file = e.dataTransfer.files[0];
            if (file) {
                this.uploadFile(file);
            }
        });

        // Window/Level adjustment with left mouse button
        this.container.addEventListener("mousedown", (e) => {
            // Ignore clicks on the dropdown
            if (e.target.closest('.image-label')) {
                return;
            }

            if (
                this.mode === "window-level" &&
                (e.button === 0 || e.buttons === 1) &&
                this.container.classList.contains("has-image")
            ) {
                e.preventDefault();
                this.isWindowLevelDrag = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        });

        this.container.addEventListener("mousemove", (e) => {
            if (!this.isWindowLevelDrag) return;
            e.preventDefault();

            // Ensure we still have the left button pressed
            if (!(e.buttons & 1)) {
                this.isWindowLevelDrag = false;
                return;
            }

            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = this.lastMouseY - e.clientY;

            // Calculate sensitivity based on data range
            const dataRange = Math.max(1, this.dataMax - this.dataMin);
            const sensitivity = dataRange / 500;  // Reduced sensitivity for finer control

            // Update window width (horizontal movement)
            const newWidth = this.windowWidth + (deltaX * sensitivity);
            this.windowWidth = Math.max(dataRange / 100, newWidth); // Minimum 1% of data range

            // Update window center (vertical movement)
            const centerDelta = deltaY * sensitivity;
            const newCenter = this.windowCenter + centerDelta;
            this.windowCenter = Math.min(this.dataMax, Math.max(this.dataMin, newCenter));

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.updateWindowingInfo();
            this.applyWindowLevel();
        });

        // Handle mouse up and leave for window/level adjustment
        const endWindowLevelDrag = (e) => {
            if (this.isWindowLevelDrag) {
                e.preventDefault();
                this.isWindowLevelDrag = false;
                // cursor handled by CSS
            }
        };

        this.container.addEventListener("mouseup", endWindowLevelDrag);
        this.container.addEventListener("mouseleave", endWindowLevelDrag);

        // Prevent context menu
        this.container.addEventListener("contextmenu", (e) => {
            if (this.isWindowLevelDrag) {
                e.preventDefault();
            }
        });

        // Mouse wheel for slice navigation
        this.container.addEventListener("wheel", (e) => {
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

        // Optimize window button
        this.optimizeWindowBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.container.classList.contains("has-image")) {
                this.mode = "roi";
                this.optimizeWindowBtn.classList.add("active");
                this.windowLevelBtn.classList.remove("active");
                this.roiCanvas.classList.add("active");
                this.clearROI();
            }
        });

        // Window level mode button
        this.windowLevelBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.container.classList.contains("has-image")) {
                this.mode = "window-level";
                this.windowLevelBtn.classList.add("active");
                this.optimizeWindowBtn.classList.remove("active");
                this.roiCanvas.classList.remove("active");
                this.clearROI();
            }
        });

        // ROI drawing events
        this.roiCanvas.addEventListener("mousedown", (e) => {
            if (this.mode === "roi" && e.button === 0) {
                e.preventDefault();
                const rect = this.roiCanvas.getBoundingClientRect();

                // Get mouse position relative to the canvas
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // Convert to canvas coordinates
                const x = mouseX * (this.roiCanvas.width / rect.width);
                const y = mouseY * (this.roiCanvas.height / rect.height);

                // Only start drawing if within the canvas bounds
                if (
                    mouseX >= 0 &&
                    mouseX <= rect.width &&
                    mouseY >= 0 &&
                    mouseY <= rect.height
                ) {
                    this.isDrawingROI = true;
                    this.roiPoints = [{ x, y }];
                    this.lastPoint = { x, y };
                    this.drawROI();
                }
            }
        });

        this.roiCanvas.addEventListener("mousemove", (e) => {
            if (this.isDrawingROI) {
                e.preventDefault();
                const rect = this.roiCanvas.getBoundingClientRect();

                // Get mouse position relative to the canvas
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // Convert to canvas coordinates
                const x = mouseX * (this.roiCanvas.width / rect.width);
                const y = mouseY * (this.roiCanvas.height / rect.height);

                // Only add points if within the canvas bounds
                if (
                    mouseX >= 0 &&
                    mouseX <= rect.width &&
                    mouseY >= 0 &&
                    mouseY <= rect.height
                ) {
                    this.roiPoints.push({ x, y });
                    this.drawROI();
                }
            }
        });

        this.roiCanvas.addEventListener("mouseup", (e) => {
            if (this.isDrawingROI) {
                e.preventDefault();
                this.isDrawingROI = false;

                if (this.roiPoints.length > 2) {
                    // Close the ROI polygon
                    this.roiPoints.push(this.roiPoints[0]);
                    this.drawROI(true); // Draw final ROI
                    this.optimizeWindowFromROI();

                    // Clear ROI but stay in ROI mode
                    this.clearROI();
                } else {
                    this.clearROI();
                }
            }
        });

        // Prevent ROI drawing from continuing if mouse leaves canvas
        this.roiCanvas.addEventListener("mouseleave", () => {
            if (this.isDrawingROI) {
                this.isDrawingROI = false;
                this.clearROI();
            }
        });

        // Browse button click
        this.browseBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const modal = document.getElementById("urlImportModal");
            modal.classList.add("show");
            const currentPath = document.getElementById("currentPath");
            // Use last browsed path if it exists and is a directory
            if (
                this.lastBrowsePath &&
                this.lastBrowsePath !== currentPath.textContent
            ) {
                currentPath.textContent = this.lastBrowsePath;
            }
            this.importFromUrl();
        });
    }

    applyWindowLevel() {
        if (!this.img.complete || !this.img.src) return;

        try {
            // Calculate canvas size based on rotation
            const useWidth = this.rotation % 180 === 0 ? this.img.width : this.img.height;
            const useHeight = this.rotation % 180 === 0 ? this.img.height : this.img.width;

            if (!useWidth || !useHeight) return; // Skip if dimensions are invalid

            // Set canvas dimensions to match image
            this.canvas.width = useWidth;
            this.canvas.height = useHeight;

            // Clear canvas and save context
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.save();

            // Move to center and rotate
            this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
            this.ctx.rotate((this.rotation * Math.PI) / 180);

            // Draw image centered
            this.ctx.drawImage(
                this.img,
                -this.img.width / 2,
                -this.img.height / 2
            );

            // Restore context
            this.ctx.restore();

            // Get image data
            const imageData = this.ctx.getImageData(
                0,
                0,
                this.canvas.width,
                this.canvas.height
            );
            const data = imageData.data;

            // Apply window/level to each pixel
            for (let i = 0; i < data.length; i += 4) {
                const value = data[i]; // Assuming grayscale, so just use red channel
                const normalized = this.applyWindow(value);
                data[i] = normalized;     // R
                data[i + 1] = normalized; // G
                data[i + 2] = normalized; // B
                // Keep alpha channel (i + 3) unchanged
            }

            // Put the modified image data back
            this.ctx.putImageData(imageData, 0, 0);
            this.canvas.style.display = "block";

            // Calculate container dimensions
            const containerRect = this.imageContainer.getBoundingClientRect();
            if (!containerRect.width || !containerRect.height) return;

            const containerAspect = containerRect.width / containerRect.height;
            const imageAspect = useWidth / useHeight;

            // Calculate dimensions to fit container while maintaining aspect ratio
            let displayWidth, displayHeight;
            if (imageAspect > containerAspect) {
                displayWidth = containerRect.width;
                displayHeight = containerRect.width / imageAspect;
            } else {
                displayHeight = containerRect.height;
                displayWidth = containerRect.height * imageAspect;
            }

            // Center the canvas in the container
            const leftOffset = (containerRect.width - displayWidth) / 2;
            this.canvas.style.position = "absolute";
            this.canvas.style.left = `${leftOffset}px`;
            this.canvas.style.width = `${displayWidth}px`;
            this.canvas.style.height = `${displayHeight}px`;

            // Update ROI canvas dimensions and position to match main canvas
            this.roiCanvas.width = this.canvas.width;
            this.roiCanvas.height = this.canvas.height;
            this.roiCanvas.style.position = "absolute";
            this.roiCanvas.style.left = this.canvas.style.left;
            this.roiCanvas.style.width = this.canvas.style.width;
            this.roiCanvas.style.height = this.canvas.style.height;

        } catch (error) {
            console.error("Error applying window level:", error);
        }
    }

    applyWindow(value) {
        // Ensure window width is always positive
        this.windowWidth = Math.max(1, this.windowWidth);

        const windowMin = this.windowCenter - this.windowWidth / 2;
        const windowMax = this.windowCenter + this.windowWidth / 2;

        // Clamp value to window range
        if (value <= windowMin) return 0;
        if (value >= windowMax) return 255;

        // Linear scaling from window range to display range
        const normalized = (value - windowMin) / this.windowWidth;
        return Math.round(normalized * 255);
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
                this.dataMin = data.data_min; // Assuming the server response provides this
                this.dataMax = data.data_max; // Assuming the server response provides this
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

    updateWindowingInfo() {
        const infoElement = this.container.querySelector(".image-info");
        if (infoElement) {
            infoElement.textContent = `Window: C: ${Math.round(this.windowCenter)} W: ${Math.round(this.windowWidth)} | Slice: ${this.currentSlice + 1}/${this.totalSlices}`;
        }
    }

    updateSliceInfo() {
        const infoElement = this.container.querySelector(".image-info");
        if (infoElement) {
            infoElement.textContent = `Window: C: ${Math.round(this.windowCenter)} W: ${Math.round(this.windowWidth)} | Slice: ${this.currentSlice + 1}/${this.totalSlices}`;
        }
    }

    async loadSlice(sliceNumber) {
        if (!this.slices || !this.slices.length) return;
        this.currentSlice = sliceNumber;

        try {
            let sliceUrl;
            // Check if the slice is a full URL or just a base64 string
            if (this.slices[sliceNumber].startsWith('http')) {
                sliceUrl = this.slices[sliceNumber];
            } else if (this.slices[sliceNumber].startsWith('data:image')) {
                // Handle base64 encoded images directly
                this.img.src = this.slices[sliceNumber];
                this.updateWindowingInfo();
                return;
            } else {
                // Construct URL for slice endpoint
                sliceUrl = `${BASE_URL}/slice/${this.imageId}/${sliceNumber}`;
            }

            const response = await fetch(sliceUrl, {
                headers: {
                    'Accept': 'image/*'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Create a blob URL from the binary data
            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);

            // Load the image
            this.img.src = imageUrl;
            this.updateWindowingInfo();

            // Clean up the old URL
            URL.revokeObjectURL(this.img.src);
        } catch (error) {
            console.error("Error loading slice:", error);
            this.showError(`Failed to load slice: ${error.message}`);
        }
    }

    drawROI(isFinal = false) {
        this.roiCtx.clearRect(
            0,
            0,
            this.roiCanvas.width,
            this.roiCanvas.height,
        );
        if (this.roiPoints.length < 2) return;

        this.roiCtx.beginPath();
        this.roiCtx.moveTo(this.roiPoints[0].x, this.roiPoints[0].y);

        for (let i = 1; i < this.roiPoints.length; i++) {
            this.roiCtx.lineTo(this.roiPoints[i].x, this.roiPoints[i].y);
        }

        if (isFinal) {
            this.roiCtx.closePath();
        }

        this.roiCtx.strokeStyle = "#00ff00"; // Bright green for better visibility
        this.roiCtx.lineWidth = 2;
        this.roiCtx.stroke();

        if (isFinal) {
            this.roiCtx.fillStyle = "rgba(0, 255, 0, 0.1)";
            this.roiCtx.fill();
        }
    }

    clearROI() {
        this.roiPoints = [];
        this.roiCtx.clearRect(
            0,
            0,
            this.roiCanvas.width,
            this.roiCanvas.height,
        );
    }

    optimizeWindowFromROI() {
        // Get original image data before windowing
        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d");
        tempCanvas.width = this.img.width;
        tempCanvas.height = this.img.height;

        // Draw original image without windowing
        tempCtx.drawImage(this.img, 0, 0);
        const imageData = tempCtx.getImageData(
            0,
            0,
            tempCanvas.width,
            tempCanvas.height,
        );
        const data = imageData.data;

        // Create a path for point-in-polygon testing
        const path = new Path2D();
        path.moveTo(this.roiPoints[0].x, this.roiPoints[0].y);

        for (let i = 1; i < this.roiPoints.length; i++) {
            path.lineTo(this.roiPoints[i].x, this.roiPoints[i].y);
        }
        path.closePath();

        // Scale ROI points to match original image dimensions
        const scaleX = tempCanvas.width / this.roiCanvas.width;
        const scaleY = tempCanvas.height / this.roiCanvas.height;

        // Collect pixel values within ROI
        const values = [];
        for (let y = 0; y < tempCanvas.height; y++) {
            for (let x = 0; x < tempCanvas.width; x++) {
                // Scale the test point to match ROI coordinates
                const testX = x / scaleX;
                const testY = y / scaleY;

                if (this.roiCtx.isPointInPath(path, testX, testY)) {
                    const idx = (y * tempCanvas.width + x) * 4;
                    const value = data[idx];
                    if (value > 0) {
                        // Exclude background pixels
                        values.push(value);
                    }
                }
            }
        }

        if (values.length > 0) {
            // Calculate new window settings from ROI values
            values.sort((a, b) => a - b);
            const p2 = values[Math.floor(values.length * 0.02)];
            const p98 = values[Math.floor(values.length * 0.98)];

            // Set window width and center based on the ROI values
            this.windowWidth = p98 - p2;
            this.windowCenter = (p98 + p2) / 2;

            this.updateWindowingInfo();
            this.applyWindowLevel();
        }

        // Clean up
        tempCanvas.remove();
    }

    async importFromUrl() {
        const currentPath = document.getElementById("currentPath").textContent;
        const directoryList = document.getElementById("directoryList");

        // Show loading state
        directoryList.innerHTML = '<div class="loading">Loading...</div>';

        try {
            // For image files, directly try to import
            if (currentPath.match(/\.(nii|nii\.gz|dcm|jpg|jpeg|png|bmp)$/i)) {
                const formData = new FormData();
                formData.append("path", currentPath);

                const response = await fetch(`${BASE_URL}/import-from-url`, {
                    method: "POST",
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Failed to import file: ${errorText}`);
                }

                const data = await response.json();

                if (data.status === "success" && data.slices && data.slices.length > 0) {
                    // Process image data
                    this.slices = data.slices;
                    this.totalSlices = data.total_slices;
                    this.currentSlice = 0;
                    this.imageId = data.image_id;
                    this.windowWidth = data.window_width;
                    this.windowCenter = data.window_center;
                    this.dataMin = data.data_min;
                    this.dataMax = data.data_max;

                    // Load first slice
                    await this.loadSlice(0);
                    this.updateWindowingInfo();
                    this.container.classList.add("has-image");

                    // Hide modal
                    document.getElementById("urlImportModal").classList.remove("show");

                    // Update image label dropdown
                    this.addImageLabelDropdown();
                    return;
                }
                throw new Error("Invalid response format from server");
            }

            // Otherwise, list directory contents
            const listResponse = await fetch(`${BASE_URL}/list-directory`, {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: currentPath })
            });

            if (!listResponse.ok) {
                const errorText = await listResponse.text();
                throw new Error(`Failed to list directory: ${errorText}`);
            }

            const listData = await listResponse.json();

            if (listData.status === "success") {
                this.updateDirectoryList(listData.files || [], listData.directories || []);
                return;
            }

            throw new Error("Invalid directory listing response");

        } catch (error) {            console.error("Error importing from URL:", error);
            directoryList.innerHTML = `<div class="error">${error.message}</div>`;
        }
    }

    updateDirectoryList(files, directories) {
        const directoryList = document.getElementById("directoryList");
        const currentPath = document.getElementById("currentPath");

        let html = '';

        // Add parent directory link if not in root
        if (currentPath.textContent !== "images") {
            html += `
                <div class="directory-item" data-path="${currentPath.textContent}">
                    <span class="directory-icon">📁</span>
                    <span class="directory-name">..</span>
                </div>
            `;
        }

        // Add directories
        directories.forEach(dir => {
            html += `
                <div class="directory-item" data-path="${dir.url}">
                    <span class="directory-icon">📁</span>
                    <span class="directory-name">${dir.name}</span>
                </div>
            `;
        });

        // Add files
        files.forEach(file => {
            html += `
                <div class="file-item" data-path="${file.url}">
                    <span class="file-icon">📄</span>
                    <span class="file-name">${file.name}</span>
                </div>
            `;
        });

        directoryList.innerHTML = html || '<div class="empty">No items found</div>';

        // Add click handlers for directories and files
        const directoryItems = directoryList.querySelectorAll(".directory-item");
        const fileItems = directoryList.querySelectorAll(".file-item");

        directoryItems.forEach(item => {
            item.addEventListener("click", (e) => {
                const path = item.dataset.path;
                if (item.querySelector(".directory-name").textContent === "..") {
                    // Handle parent directory
                    const pathParts = currentPath.textContent.split("/").filter(Boolean);
                    pathParts.pop();
                    const newPath = pathParts.length ? pathParts.join("/") : "images";
                    currentPath.textContent = newPath;
                } else {
                    currentPath.textContent = path;
                }
                this.importFromUrl();
            });
        });

        fileItems.forEach(item => {
            item.addEventListener("click", () => {
                currentPath.textContent = item.dataset.path;
                this.importFromUrl();
            });
        });
    }

    addImageLabelDropdown() {
        // Remove any existing dropdown first
        const existingDropdown = this.toolbar.querySelector(".image-label");
        if (existingDropdown) {
            existingDropdown.remove();
        }

        const dropdown = document.createElement("select");
        dropdown.className = "image-label";

        const options = [
            { value: "", text: "Select image type..." },
            { value: "T1", text: "T1" },
            { value: "T2", text: "T2" },
            { value: "FLAIR", text: "FLAIR" },
            { value: "PostT1", text: "PostT1" },
            { value: "MPRAGE", text: "MPRAGE" },
            { value: "PostMPRAGE", text: "PostMPRAGE" }
        ];

        options.forEach(option => {
            const opt = document.createElement("option");
            opt.value = option.value;
            opt.textContent = option.text;
            dropdown.appendChild(opt);
        });

        dropdown.addEventListener("change", (e) => {
            e.stopPropagation();
            console.log("Dropdown change event fired");
            const selectedLabel = e.target.value;
            console.log(`Image labeled as: ${selectedLabel}`);
            this.currentLabel = selectedLabel;
        });

        dropdown.addEventListener("click", (e) => {
            e.stopPropagation();
        });

        // Insert dropdown before the menu container
        const menuContainer = this.toolbar.querySelector(".menu-container");
        if (menuContainer) {
            menuContainer.parentNode.insertBefore(dropdown, menuContainer);
        } else {
            // Add to toolbar if menu container not found
            this.toolbar.appendChild(dropdown);
        }

        // Store reference to the dropdown
        this.imageLabel = dropdown;

        // Reset the dropdown value
        dropdown.value = "";
        this.currentLabel = "";
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