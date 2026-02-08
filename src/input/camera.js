/**
 * FromScratch - Camera Module
 * Handles camera creation and controls.
 * Touch-first design: single pointer orbit, two-finger pan, pinch zoom.
 * Mouse: middle-drag orbit, shift+middle-drag pan, scroll zoom.
 */

import * as THREE from 'three';
import { isInteracting } from '../core/state.js';

let camera;
let container;

// Camera control state
const controls = {
    // Spherical coordinates for orbit
    theta: Math.PI / 4,      // Horizontal angle
    phi: Math.PI / 3,        // Vertical angle (from top)
    radius: 10,              // Distance from target
    
    // Target point (what we orbit around)
    target: new THREE.Vector3(0, 0, 0),
    
    // Limits
    minRadius: 1,
    maxRadius: 100,
    minPhi: 0.1,             // Don't go exactly vertical
    maxPhi: Math.PI - 0.1,
    
    // Damping (smoothness)
    dampingFactor: 0.05,
    
    // Current velocities for smooth motion
    thetaVelocity: 0,
    phiVelocity: 0,
    
    // Interaction state
    isOrbiting: false,
    isPanning: false,
    lastPointerX: 0,
    lastPointerY: 0,
    
    // Touch tracking
    touches: new Map(),
    lastPinchDistance: 0
};

/**
 * Initialize the camera
 * @param {HTMLElement} containerElement - The container element
 * @param {number} aspect - Aspect ratio
 * @returns {THREE.PerspectiveCamera}
 */
export function initCamera(containerElement, aspect) {
    container = containerElement;
    
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    updateCameraPosition();
    
    // Setup event listeners
    setupEventListeners();
    
    // Listen for resize events from scene
    window.addEventListener('fromscratch:resize', handleResize);
    
    return camera;
}

/**
 * Update camera position based on spherical coordinates
 */
function updateCameraPosition() {
    const x = controls.radius * Math.sin(controls.phi) * Math.cos(controls.theta);
    const y = controls.radius * Math.cos(controls.phi);
    const z = controls.radius * Math.sin(controls.phi) * Math.sin(controls.theta);
    
    camera.position.set(
        controls.target.x + x,
        controls.target.y + y,
        controls.target.z + z
    );
    
    camera.lookAt(controls.target);
}

/**
 * Setup all event listeners for camera control
 */
function setupEventListeners() {
    const canvas = container;
    
    // Mouse events
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    
    // Touch events
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
    
    // Context menu is handled by main.js (right-click shows context-sensitive menu)
}

// =============================================================================
// MOUSE HANDLERS
// =============================================================================

function onMouseDown(e) {
    if (e.button === 1 && e.shiftKey) {
        // Shift + Middle button - pan
        controls.isPanning = true;
    } else if (e.button === 1) {
        // Middle button - orbit
        controls.isOrbiting = true;
    }

    controls.lastPointerX = e.clientX;
    controls.lastPointerY = e.clientY;
}

function onMouseMove(e) {
    if (!controls.isOrbiting && !controls.isPanning) return;
    
    const deltaX = e.clientX - controls.lastPointerX;
    const deltaY = e.clientY - controls.lastPointerY;
    
    if (controls.isOrbiting) {
        handleOrbit(deltaX, deltaY);
    } else if (controls.isPanning) {
        handlePan(deltaX, deltaY);
    }
    
    controls.lastPointerX = e.clientX;
    controls.lastPointerY = e.clientY;
}

function onMouseUp(e) {
    controls.isOrbiting = false;
    controls.isPanning = false;
}

function onWheel(e) {
    e.preventDefault();
    
    const zoomSpeed = 0.001;
    const delta = e.deltaY * zoomSpeed * controls.radius;
    
    controls.radius = Math.max(
        controls.minRadius,
        Math.min(controls.maxRadius, controls.radius + delta)
    );
    
    updateCameraPosition();
}

// =============================================================================
// TOUCH HANDLERS
// =============================================================================

function onTouchStart(e) {
    e.preventDefault();

    // If a tool is actively interacting with single touch, don't track for orbit
    if (isInteracting() && e.touches.length === 1) {
        return;
    }

    // Track all touches
    for (const touch of e.changedTouches) {
        controls.touches.set(touch.identifier, {
            x: touch.clientX,
            y: touch.clientY
        });
    }

    if (controls.touches.size === 2) {
        // Two fingers - start tracking pinch distance
        const touchArray = Array.from(controls.touches.values());
        controls.lastPinchDistance = getDistance(touchArray[0], touchArray[1]);
    }
}

function onTouchMove(e) {
    e.preventDefault();
    
    // Update touch positions
    for (const touch of e.changedTouches) {
        if (controls.touches.has(touch.identifier)) {
            const prevTouch = controls.touches.get(touch.identifier);
            const deltaX = touch.clientX - prevTouch.x;
            const deltaY = touch.clientY - prevTouch.y;
            
            if (controls.touches.size === 1) {
                // One finger - orbit
                handleOrbit(deltaX, deltaY);
            }
            
            controls.touches.set(touch.identifier, {
                x: touch.clientX,
                y: touch.clientY
            });
        }
    }
    
    if (controls.touches.size === 2) {
        const touchArray = Array.from(controls.touches.values());
        
        // Pinch zoom
        const currentDistance = getDistance(touchArray[0], touchArray[1]);
        const pinchDelta = controls.lastPinchDistance - currentDistance;
        
        const zoomSpeed = 0.01;
        controls.radius = Math.max(
            controls.minRadius,
            Math.min(controls.maxRadius, controls.radius + pinchDelta * zoomSpeed * controls.radius)
        );
        
        controls.lastPinchDistance = currentDistance;
        
        // Two-finger pan
        const centerX = (touchArray[0].x + touchArray[1].x) / 2;
        const centerY = (touchArray[0].y + touchArray[1].y) / 2;
        
        // Calculate previous center from the touch move deltas
        // (Simplified - could be more accurate)
        
        updateCameraPosition();
    }
}

function onTouchEnd(e) {
    for (const touch of e.changedTouches) {
        controls.touches.delete(touch.identifier);
    }
}

/**
 * Get distance between two touch points
 */
function getDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// =============================================================================
// MOVEMENT HANDLERS
// =============================================================================

function handleOrbit(deltaX, deltaY) {
    const orbitSpeed = 0.005;
    
    controls.theta -= deltaX * orbitSpeed;
    controls.phi -= deltaY * orbitSpeed;
    
    // Clamp phi to prevent flipping
    controls.phi = Math.max(controls.minPhi, Math.min(controls.maxPhi, controls.phi));
    
    updateCameraPosition();
}

function handlePan(deltaX, deltaY) {
    const panSpeed = 0.002 * controls.radius;
    
    // Get camera's right and up vectors
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    
    camera.getWorldDirection(up);
    right.crossVectors(up, camera.up).normalize();
    up.crossVectors(right, camera.getWorldDirection(new THREE.Vector3())).normalize();
    
    // Move target
    controls.target.addScaledVector(right, -deltaX * panSpeed);
    controls.target.addScaledVector(up, deltaY * panSpeed);
    
    updateCameraPosition();
}

// =============================================================================
// VIEW PRESETS
// =============================================================================

/**
 * Set camera to front view
 */
export function setFrontView() {
    controls.theta = 0;
    controls.phi = Math.PI / 2;
    updateCameraPosition();
    dispatchViewChange('Front');
}

/**
 * Set camera to right view
 */
export function setRightView() {
    controls.theta = Math.PI / 2;
    controls.phi = Math.PI / 2;
    updateCameraPosition();
    dispatchViewChange('Right');
}

/**
 * Set camera to top view
 */
export function setTopView() {
    controls.theta = 0;
    controls.phi = 0.01;  // Almost straight down
    updateCameraPosition();
    dispatchViewChange('Top');
}

/**
 * Set camera to isometric-ish 3D view
 */
export function set3DView() {
    controls.theta = Math.PI / 4;
    controls.phi = Math.PI / 3;
    updateCameraPosition();
    dispatchViewChange('3D');
}

/**
 * Set camera view from theta/phi values (used by view cube)
 */
export function setView(theta, phi, viewName) {
    controls.theta = theta;
    controls.phi = phi;
    updateCameraPosition();
    if (viewName) {
        dispatchViewChange(viewName);
    }
}

/**
 * Dispatch view change event for UI updates
 */
function dispatchViewChange(viewName) {
    window.dispatchEvent(new CustomEvent('fromscratch:viewchange', {
        detail: { viewName }
    }));
}

/**
 * Fit all content in view
 * @param {THREE.Box3} boundingBox - Bounding box of content to fit
 */
export function fitToView(boundingBox) {
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    
    boundingBox.getCenter(center);
    boundingBox.getSize(size);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const distance = maxDim / (2 * Math.tan(fov / 2));
    
    controls.target.copy(center);
    controls.radius = distance * 1.5;  // Add some padding
    
    updateCameraPosition();
}

// =============================================================================
// RESIZE HANDLER
// =============================================================================

function handleResize(e) {
    const { width, height } = e.detail;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

/**
 * Get the camera
 * @returns {THREE.PerspectiveCamera}
 */
export function getCamera() {
    return camera;
}

/**
 * Get the current target point
 * @returns {THREE.Vector3}
 */
export function getTarget() {
    return controls.target.clone();
}

/**
 * Orient camera to look at a face head-on.
 * Computes theta/phi from the face normal so the camera faces the surface directly.
 * @param {{x,y,z}} normal - Outward face normal (unit vector)
 * @param {{x,y,z}} centroid - Center point of the face
 */
/**
 * Orient camera to look at a face head-on, zoomed to fit.
 * @param {{x,y,z}} normal - Outward face normal (unit vector)
 * @param {{x,y,z}} centroid - Center point of the face
 * @param {Array<{x,y,z}>} [faceVertices] - Face vertices for zoom-to-fit
 */
export function orientToFace(normal, centroid, faceVertices) {
    // Move orbit target to the face centroid
    controls.target.set(centroid.x, centroid.y, centroid.z);

    // Camera sits on the normal side of the face, looking back at it.
    // Camera position direction = +normal, so:
    //   cos(phi) = normal.y  →  phi = acos(normal.y)
    //   theta = atan2(normal.z, normal.x)
    controls.phi = Math.acos(Math.max(-1, Math.min(1, normal.y)));

    // Only compute theta if the normal has an XZ component
    const xzLen = Math.sqrt(normal.x * normal.x + normal.z * normal.z);
    if (xzLen > 0.001) {
        controls.theta = Math.atan2(normal.z, normal.x);
    }
    // If normal is straight up/down, keep current theta (avoids jump)

    // Clamp phi to valid range
    controls.phi = Math.max(controls.minPhi, Math.min(controls.maxPhi, controls.phi));

    // Zoom to fit the face with padding
    if (faceVertices && faceVertices.length > 0) {
        // Find the max distance from centroid to any vertex
        let maxDist = 0;
        for (const v of faceVertices) {
            const dx = v.x - centroid.x;
            const dy = v.y - centroid.y;
            const dz = v.z - centroid.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist > maxDist) maxDist = dist;
        }

        // Set radius so the face fills ~60% of the viewport
        const fov = camera.fov * (Math.PI / 180);
        const fitRadius = maxDist / Math.tan(fov / 2);
        controls.radius = Math.max(controls.minRadius, fitRadius * 1.4);
    }

    updateCameraPosition();
    dispatchViewChange('Face');
}

// Listen for view changes from the view cube
window.addEventListener('fromscratch:setview', (e) => {
    const { theta, phi, name } = e.detail;
    setView(theta, phi, name);
});

// Listen for orbit from dragging the view cube
window.addEventListener('fromscratch:cubeorbit', (e) => {
    const { deltaX, deltaY } = e.detail;
    handleOrbit(deltaX, deltaY);
});

export default {
    initCamera,
    getCamera,
    getTarget,
    setFrontView,
    setRightView,
    setTopView,
    set3DView,
    setView,
    fitToView
};
