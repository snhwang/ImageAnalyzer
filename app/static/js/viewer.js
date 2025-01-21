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

        // Initialize Babylon.js scene
        this.initializeBabylonScene();
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

        // Create 16-bit gray material
        const material = new BABYLON.StandardMaterial("grayMaterial", this.scene);
        material.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);  // mid-gray
        material.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        material.useFloatValues = true;  // Enable high precision values

        // Create a cube
        const cube = BABYLON.MeshBuilder.CreateBox("cube", {size: 2}, this.scene);
        cube.material = material;

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