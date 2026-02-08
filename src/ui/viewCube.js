/**
 * FromScratch - View Cube Module
 * A 3D axis indicator that shows current orientation and allows view selection.
 * - Click faces for orthogonal views
 * - Click edges for 3/4 views
 * - Drag to rotate the main camera
 * Inspired by Shapr3D's navigation cube.
 */

import * as THREE from 'three';

let cubeScene, cubeCamera, cubeRenderer;
let cubeMesh, axisGroup;
let container;
let mainCamera;

// View label element
let viewLabel;
let labelTimeout;

// Drag state
const dragState = {
    isDragging: false,
    startX: 0,
    startY: 0
};

// Face definitions (orthogonal views)
const FACES = {
    RIGHT:  { name: 'Right',  theta: Math.PI / 2,  phi: Math.PI / 2 },
    LEFT:   { name: 'Left',   theta: -Math.PI / 2, phi: Math.PI / 2 },
    TOP:    { name: 'Top',    theta: 0,            phi: 0.01 },
    BOTTOM: { name: 'Bottom', theta: 0,            phi: Math.PI - 0.01 },
    FRONT:  { name: 'Front',  theta: 0,            phi: Math.PI / 2 },
    BACK:   { name: 'Back',   theta: Math.PI,      phi: Math.PI / 2 }
};

// Edge/corner definitions (3/4 views) - combinations of faces
const CORNERS = {
    // Top corners
    TOP_FRONT_RIGHT:  { name: 'Top Front Right',  theta: Math.PI / 4,      phi: Math.PI / 4 },
    TOP_FRONT_LEFT:   { name: 'Top Front Left',   theta: -Math.PI / 4,     phi: Math.PI / 4 },
    TOP_BACK_RIGHT:   { name: 'Top Back Right',   theta: 3 * Math.PI / 4,  phi: Math.PI / 4 },
    TOP_BACK_LEFT:    { name: 'Top Back Left',    theta: -3 * Math.PI / 4, phi: Math.PI / 4 },
    // Bottom corners
    BOT_FRONT_RIGHT:  { name: 'Bottom Front Right', theta: Math.PI / 4,      phi: 3 * Math.PI / 4 },
    BOT_FRONT_LEFT:   { name: 'Bottom Front Left',  theta: -Math.PI / 4,     phi: 3 * Math.PI / 4 },
    BOT_BACK_RIGHT:   { name: 'Bottom Back Right',  theta: 3 * Math.PI / 4,  phi: 3 * Math.PI / 4 },
    BOT_BACK_LEFT:    { name: 'Bottom Back Left',   theta: -3 * Math.PI / 4, phi: 3 * Math.PI / 4 }
};

// Top edges (between top face and side faces)
const EDGES = {
    TOP_FRONT:  { name: 'Top Front',  theta: 0,            phi: Math.PI / 4 },
    TOP_BACK:   { name: 'Top Back',   theta: Math.PI,      phi: Math.PI / 4 },
    TOP_RIGHT:  { name: 'Top Right',  theta: Math.PI / 2,  phi: Math.PI / 4 },
    TOP_LEFT:   { name: 'Top Left',   theta: -Math.PI / 2, phi: Math.PI / 4 },
    // Bottom edges
    BOT_FRONT:  { name: 'Bottom Front',  theta: 0,            phi: 3 * Math.PI / 4 },
    BOT_BACK:   { name: 'Bottom Back',   theta: Math.PI,      phi: 3 * Math.PI / 4 },
    BOT_RIGHT:  { name: 'Bottom Right',  theta: Math.PI / 2,  phi: 3 * Math.PI / 4 },
    BOT_LEFT:   { name: 'Bottom Left',   theta: -Math.PI / 2, phi: 3 * Math.PI / 4 },
    // Vertical edges
    FRONT_RIGHT: { name: 'Front Right', theta: Math.PI / 4,      phi: Math.PI / 2 },
    FRONT_LEFT:  { name: 'Front Left',  theta: -Math.PI / 4,     phi: Math.PI / 2 },
    BACK_RIGHT:  { name: 'Back Right',  theta: 3 * Math.PI / 4,  phi: Math.PI / 2 },
    BACK_LEFT:   { name: 'Back Left',   theta: -3 * Math.PI / 4, phi: Math.PI / 2 }
};

/**
 * Initialize the view cube
 */
export function initViewCube(containerElement, camera) {
    container = containerElement;
    mainCamera = camera;

    cubeScene = new THREE.Scene();

    const size = 1.8;
    cubeCamera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 100);
    cubeCamera.position.set(0, 0, 5);
    cubeCamera.lookAt(0, 0, 0);

    cubeRenderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true
    });
    cubeRenderer.setSize(100, 100);
    cubeRenderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(cubeRenderer.domElement);

    createCube();
    createAxisLines();
    setupInteraction();
    createViewLabel();
}

/**
 * Create the cube mesh with labeled faces
 */
function createCube() {
    const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);

    const materials = [
        createFaceMaterial('R', '#ef4444'),  // Right (+X)
        createFaceMaterial('L', '#ef4444'),  // Left (-X)
        createFaceMaterial('T', '#22c55e'),  // Top (+Y)
        createFaceMaterial('B', '#22c55e'),  // Bottom (-Y)
        createFaceMaterial('F', '#3b82f6'),  // Front (+Z)
        createFaceMaterial('K', '#3b82f6'),  // Back (-Z)
    ];

    cubeMesh = new THREE.Mesh(geometry, materials);
    cubeScene.add(cubeMesh);

    // Add visible edges
    const edges = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        opacity: 0.5,
        transparent: true
    });
    const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
    cubeMesh.add(edgeLines);
}

/**
 * Create a material with a letter label
 */
function createFaceMaterial(letter, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 64, 64);

    // Lighter center area
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(16, 16, 32, 32);

    ctx.fillStyle = 'white';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 32, 34);

    const texture = new THREE.CanvasTexture(canvas);
    return new THREE.MeshBasicMaterial({ map: texture });
}

/**
 * Create colored axis lines
 */
function createAxisLines() {
    axisGroup = new THREE.Group();
    const length = 1.3;

    // X - Red
    const xGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(length, 0, 0)
    ]);
    axisGroup.add(new THREE.Line(xGeom, new THREE.LineBasicMaterial({ color: 0xef4444 })));

    // Y - Green
    const yGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, length, 0)
    ]);
    axisGroup.add(new THREE.Line(yGeom, new THREE.LineBasicMaterial({ color: 0x22c55e })));

    // Z - Blue
    const zGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, length)
    ]);
    axisGroup.add(new THREE.Line(zGeom, new THREE.LineBasicMaterial({ color: 0x3b82f6 })));

    cubeScene.add(axisGroup);
}

/**
 * Create the view label element
 */
function createViewLabel() {
    viewLabel = document.createElement('div');
    viewLabel.id = 'view-label';
    viewLabel.style.cssText = `
        position: absolute;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(26, 26, 46, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 600;
        color: #fff;
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
        z-index: 100;
    `;
    document.getElementById('app').appendChild(viewLabel);
}

/**
 * Show view label temporarily
 */
export function showViewLabel(viewName) {
    if (!viewLabel) return;

    viewLabel.textContent = viewName + ' View';
    viewLabel.style.opacity = '1';

    if (labelTimeout) clearTimeout(labelTimeout);
    labelTimeout = setTimeout(() => {
        viewLabel.style.opacity = '0';
    }, 1500);
}

/**
 * Setup mouse/touch interaction
 */
function setupInteraction() {
    const canvas = cubeRenderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Mouse down - start potential drag
    canvas.addEventListener('mousedown', (e) => {
        dragState.isDragging = false;
        dragState.startX = e.clientX;
        dragState.startY = e.clientY;
        canvas.style.cursor = 'grabbing';
    });

    // Mouse move - if dragging, rotate camera
    canvas.addEventListener('mousemove', (e) => {
        if (e.buttons !== 1) return;

        const deltaX = e.clientX - dragState.startX;
        const deltaY = e.clientY - dragState.startY;

        // If moved more than 3px, it's a drag not a click
        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
            dragState.isDragging = true;
        }

        if (dragState.isDragging) {
            // Dispatch orbit event to main camera
            window.dispatchEvent(new CustomEvent('fromscratch:cubeorbit', {
                detail: { deltaX: deltaX * 2.0, deltaY: deltaY * 2.0 }
            }));

            dragState.startX = e.clientX;
            dragState.startY = e.clientY;
        }
    });

    // Mouse up - if not dragged, treat as click
    canvas.addEventListener('mouseup', (e) => {
        canvas.style.cursor = 'pointer';

        if (dragState.isDragging) {
            dragState.isDragging = false;
            return;
        }

        // It was a click - detect what was clicked
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, cubeCamera);
        const intersects = raycaster.intersectObject(cubeMesh);

        if (intersects.length > 0) {
            handleCubeClick(intersects[0]);
        }
    });

    canvas.addEventListener('mouseleave', () => {
        canvas.style.cursor = 'pointer';
        dragState.isDragging = false;
    });

    canvas.style.cursor = 'pointer';
}

/**
 * Handle click on cube - determine if face, edge, or corner
 */
function handleCubeClick(intersection) {
    const point = intersection.point;
    const absX = Math.abs(point.x);
    const absY = Math.abs(point.y);
    const absZ = Math.abs(point.z);

    // Threshold for edge/corner detection (how close to edge)
    const edgeThreshold = 0.55;
    const cubeHalf = 0.8;  // Half of cube size (1.6/2)

    // Count how many axes are near the edge
    const nearEdgeX = absX > cubeHalf * edgeThreshold;
    const nearEdgeY = absY > cubeHalf * edgeThreshold;
    const nearEdgeZ = absZ > cubeHalf * edgeThreshold;
    const nearEdgeCount = (nearEdgeX ? 1 : 0) + (nearEdgeY ? 1 : 0) + (nearEdgeZ ? 1 : 0);

    let view;

    if (nearEdgeCount >= 3) {
        // Corner click - 3/4 view
        view = getCornerView(point);
    } else if (nearEdgeCount === 2) {
        // Edge click - 3/4 view from edge
        view = getEdgeView(point);
    } else {
        // Face click - orthogonal view
        view = getFaceView(intersection.faceIndex);
    }

    if (view) {
        window.dispatchEvent(new CustomEvent('fromscratch:setview', {
            detail: { theta: view.theta, phi: view.phi, name: view.name }
        }));
    }
}

/**
 * Get face view based on face index
 */
function getFaceView(faceIndex) {
    const faceNames = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK'];
    const idx = Math.floor(faceIndex / 2);
    return FACES[faceNames[idx]];
}

/**
 * Get corner view based on click position
 */
function getCornerView(point) {
    const isTop = point.y > 0;
    const isFront = point.z > 0;
    const isRight = point.x > 0;

    if (isTop) {
        if (isFront && isRight) return CORNERS.TOP_FRONT_RIGHT;
        if (isFront && !isRight) return CORNERS.TOP_FRONT_LEFT;
        if (!isFront && isRight) return CORNERS.TOP_BACK_RIGHT;
        return CORNERS.TOP_BACK_LEFT;
    } else {
        if (isFront && isRight) return CORNERS.BOT_FRONT_RIGHT;
        if (isFront && !isRight) return CORNERS.BOT_FRONT_LEFT;
        if (!isFront && isRight) return CORNERS.BOT_BACK_RIGHT;
        return CORNERS.BOT_BACK_LEFT;
    }
}

/**
 * Get edge view based on click position
 */
function getEdgeView(point) {
    const absX = Math.abs(point.x);
    const absY = Math.abs(point.y);
    const absZ = Math.abs(point.z);

    // Find which axis is closest to center (that's the edge axis)
    const min = Math.min(absX, absY, absZ);

    if (min === absY) {
        // Vertical edge (Y is small)
        if (point.z > 0 && point.x > 0) return EDGES.FRONT_RIGHT;
        if (point.z > 0 && point.x < 0) return EDGES.FRONT_LEFT;
        if (point.z < 0 && point.x > 0) return EDGES.BACK_RIGHT;
        return EDGES.BACK_LEFT;
    } else if (min === absX) {
        // X is small - front/back top/bottom edge
        if (point.y > 0 && point.z > 0) return EDGES.TOP_FRONT;
        if (point.y > 0 && point.z < 0) return EDGES.TOP_BACK;
        if (point.y < 0 && point.z > 0) return EDGES.BOT_FRONT;
        return EDGES.BOT_BACK;
    } else {
        // Z is small - left/right top/bottom edge
        if (point.y > 0 && point.x > 0) return EDGES.TOP_RIGHT;
        if (point.y > 0 && point.x < 0) return EDGES.TOP_LEFT;
        if (point.y < 0 && point.x > 0) return EDGES.BOT_RIGHT;
        return EDGES.BOT_LEFT;
    }
}

/**
 * Update view cube to match main camera
 */
export function updateViewCube() {
    if (!cubeScene || !mainCamera) return;

    const cameraDirection = new THREE.Vector3();
    mainCamera.getWorldDirection(cameraDirection);

    const distance = 5;
    cubeCamera.position.copy(cameraDirection).multiplyScalar(-distance);
    cubeCamera.lookAt(0, 0, 0);
    cubeCamera.up.copy(mainCamera.up);

    cubeRenderer.render(cubeScene, cubeCamera);
}

export default {
    initViewCube,
    updateViewCube,
    showViewLabel
};
