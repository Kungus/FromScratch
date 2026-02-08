/**
 * FromScratch - Pointer Module
 * Converts screen coordinates to world coordinates on the ground plane.
 * Provides unified mouse/touch handling for tools.
 */

import * as THREE from 'three';
import { getCamera } from './camera.js';
import { raycastToBodies } from './bodyRaycast.js';

let container;
let groundPlane;
let raycaster;

// Current pointer state
const pointerState = {
    // Screen position (pixels)
    screenX: 0,
    screenY: 0,

    // Normalized device coordinates (-1 to 1)
    ndcX: 0,
    ndcY: 0,

    // World position on ground plane
    worldX: 0,
    worldY: 0,  // Always 0 (ground plane is Y=0)
    worldZ: 0,

    // Is pointer over the canvas?
    isOver: false,

    // Is pointer down?
    isDown: false,

    // Which button (0=left, 1=middle, 2=right)
    button: 0,

    // Modifier keys
    shiftKey: false,

    // Body raycast hit result (null if no hit)
    bodyHit: null  // {bodyId, point, faceIndex, face, distance, object}
};

// Callbacks for pointer events
const listeners = {
    move: [],
    down: [],
    up: []
};

/**
 * Initialize the pointer system
 * @param {HTMLElement} containerElement - The canvas container
 */
export function initPointer(containerElement) {
    container = containerElement;

    // Create raycaster for picking
    raycaster = new THREE.Raycaster();

    // Create an infinite ground plane at Y=0
    groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Setup event listeners
    setupEventListeners();

    console.log('Pointer system initialized');
}

/**
 * Setup mouse and touch event listeners
 */
function setupEventListeners() {
    // Mouse events
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('mouseenter', () => { pointerState.isOver = true; });
    container.addEventListener('mouseleave', () => { pointerState.isOver = false; });

    // Touch events
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
}

/**
 * Update world position from screen coordinates
 */
function updateWorldPosition(screenX, screenY) {
    const rect = container.getBoundingClientRect();

    // Store screen position
    pointerState.screenX = screenX;
    pointerState.screenY = screenY;

    // Convert to normalized device coordinates (-1 to 1)
    pointerState.ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    pointerState.ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

    // Raycast to ground plane
    const camera = getCamera();
    if (!camera) return;

    raycaster.setFromCamera(
        new THREE.Vector2(pointerState.ndcX, pointerState.ndcY),
        camera
    );

    // Find intersection with ground plane
    const intersection = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(groundPlane, intersection);

    if (hit) {
        pointerState.worldX = intersection.x;
        pointerState.worldY = intersection.y;  // Should be ~0
        pointerState.worldZ = intersection.z;
    }

    // Also raycast to bodies
    pointerState.bodyHit = raycastToBodies(pointerState.ndcX, pointerState.ndcY);
}

// =============================================================================
// MOUSE HANDLERS
// =============================================================================

function onMouseMove(e) {
    pointerState.shiftKey = e.shiftKey;
    updateWorldPosition(e.clientX, e.clientY);
    notifyListeners('move', pointerState);
}

function onMouseDown(e) {
    // Only left-click triggers tool events (middle=orbit, right=context menu)
    if (e.button !== 0) return;

    pointerState.shiftKey = e.shiftKey;
    updateWorldPosition(e.clientX, e.clientY);
    pointerState.isDown = true;
    pointerState.button = e.button;
    notifyListeners('down', pointerState);
}

function onMouseUp(e) {
    if (e.button !== 0) return;

    pointerState.shiftKey = e.shiftKey;
    updateWorldPosition(e.clientX, e.clientY);
    pointerState.isDown = false;
    notifyListeners('up', pointerState);
}

// =============================================================================
// TOUCH HANDLERS
// =============================================================================

function onTouchStart(e) {
    // Only handle single touch for drawing (multi-touch is for camera)
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    updateWorldPosition(touch.clientX, touch.clientY);
    pointerState.isDown = true;
    pointerState.button = 0;
    notifyListeners('down', pointerState);
}

function onTouchMove(e) {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    updateWorldPosition(touch.clientX, touch.clientY);
    notifyListeners('move', pointerState);
}

function onTouchEnd(e) {
    if (e.touches.length > 0) return;

    pointerState.isDown = false;
    notifyListeners('up', pointerState);
}

// =============================================================================
// LISTENER SYSTEM
// =============================================================================

/**
 * Subscribe to pointer events
 * @param {string} event - 'move', 'down', or 'up'
 * @param {Function} callback - Called with pointerState
 * @returns {Function} Unsubscribe function
 */
export function onPointer(event, callback) {
    if (listeners[event]) {
        listeners[event].push(callback);

        // Return unsubscribe function
        return () => {
            const idx = listeners[event].indexOf(callback);
            if (idx !== -1) listeners[event].splice(idx, 1);
        };
    }
}

/**
 * Notify all listeners of an event
 */
function notifyListeners(event, state) {
    for (const callback of listeners[event]) {
        callback(state);
    }
}

// =============================================================================
// GETTERS
// =============================================================================

/**
 * Get current pointer state
 * @returns {Object} Current pointer state
 */
export function getPointerState() {
    return { ...pointerState };
}

/**
 * Get world position as THREE.Vector3
 * @returns {THREE.Vector3}
 */
export function getWorldPosition() {
    return new THREE.Vector3(
        pointerState.worldX,
        pointerState.worldY,
        pointerState.worldZ
    );
}

export default {
    initPointer,
    onPointer,
    getPointerState,
    getWorldPosition
};
