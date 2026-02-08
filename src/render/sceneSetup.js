/**
 * FromScratch - Scene Setup Module
 * Initializes THREE.js scene, renderer, lights.
 * This is pure setup - no state ownership.
 */

import * as THREE from 'three';

let scene, renderer;
let ambientLight, directionalLight;

/**
 * Initialize the THREE.js scene and renderer
 * @param {HTMLElement} container - DOM element to render into
 * @returns {{ scene: THREE.Scene, renderer: THREE.WebGLRenderer }}
 */
export function initScene(container) {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    container.appendChild(renderer.domElement);
    
    // Setup lighting
    setupLights();
    
    // Handle resize
    window.addEventListener('resize', () => handleResize(container));
    
    return { scene, renderer };
}

/**
 * Setup scene lighting
 */
function setupLights() {
    // Ambient light - soft overall illumination
    ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    // Main directional light - casts shadows
    directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    scene.add(directionalLight);
    
    // Secondary fill light - soften shadows
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5, 10, -5);
    scene.add(fillLight);
}

/**
 * Handle window resize
 * @param {HTMLElement} container 
 */
function handleResize(container) {
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    renderer.setSize(width, height);
    
    // Camera resize is handled in camera.js since it owns the camera
    // We dispatch an event that camera.js listens to
    window.dispatchEvent(new CustomEvent('fromscratch:resize', {
        detail: { width, height }
    }));
}

/**
 * Get the scene
 * @returns {THREE.Scene}
 */
export function getScene() {
    return scene;
}

/**
 * Get the renderer
 * @returns {THREE.WebGLRenderer}
 */
export function getRenderer() {
    return renderer;
}

/**
 * Get the canvas element
 * @returns {HTMLCanvasElement}
 */
export function getCanvas() {
    return renderer?.domElement;
}

/**
 * Render a frame
 * @param {THREE.Camera} camera 
 */
export function render(camera) {
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

export default { initScene, getScene, getRenderer, getCanvas, render };
