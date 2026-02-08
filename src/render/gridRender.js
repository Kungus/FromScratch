/**
 * FromScratch - Grid Renderer Module
 * Renders the ground plane grid.
 * Subscribes to state changes to update grid appearance.
 */

import * as THREE from 'three';
import { subscribe, getGridSize } from '../core/state.js';

let gridHelper;
let groundPlane;
let scene;

// Grid appearance settings
const GRID_COLOR_CENTER = 0x444466;
const GRID_COLOR_LINES = 0x333355;
const GROUND_COLOR = 0x1a1a2e;
const GRID_SIZE = 20;  // Total size of grid (units)

/**
 * Initialize the grid
 * @param {THREE.Scene} sceneRef - The scene to add grid to
 */
export function initGrid(sceneRef) {
    scene = sceneRef;
    
    createGroundPlane();
    createGrid();
    
    // Subscribe to state changes
    subscribe((state, changedPath) => {
        if (changedPath === 'viewport.gridSize') {
            updateGrid();
        }
    });
}

/**
 * Create the ground plane (for shadows and visual reference)
 */
function createGroundPlane() {
    const geometry = new THREE.PlaneGeometry(GRID_SIZE * 2, GRID_SIZE * 2);
    const material = new THREE.MeshStandardMaterial({
        color: GROUND_COLOR,
        roughness: 0.9,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    
    groundPlane = new THREE.Mesh(geometry, material);
    groundPlane.rotation.x = -Math.PI / 2;  // Lay flat
    groundPlane.position.y = -0.001;  // Slightly below grid to prevent z-fighting
    groundPlane.receiveShadow = true;
    groundPlane.name = 'groundPlane';
    
    scene.add(groundPlane);
}

/**
 * Create the grid helper
 */
function createGrid() {
    const gridSize = getGridSize();
    const divisions = Math.floor(GRID_SIZE / gridSize);
    
    // Remove existing grid if any
    if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper.geometry.dispose();
        gridHelper.material.dispose();
    }
    
    // Create new grid
    gridHelper = new THREE.GridHelper(
        GRID_SIZE,
        divisions,
        GRID_COLOR_CENTER,
        GRID_COLOR_LINES
    );
    gridHelper.name = 'gridHelper';
    
    scene.add(gridHelper);
    
    // Add axis indicator lines (subtle)
    addAxisIndicators();
}

/**
 * Add subtle colored lines for X and Z axes
 */
let axisLines = [];

function addAxisIndicators() {
    // Remove existing axis lines
    axisLines.forEach(line => {
        scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
    });
    axisLines = [];
    
    const halfSize = GRID_SIZE / 2;
    
    // X axis (red) - along ground
    const xGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-halfSize, 0.001, 0),
        new THREE.Vector3(halfSize, 0.001, 0)
    ]);
    const xMaterial = new THREE.LineBasicMaterial({ 
        color: 0xff4444, 
        transparent: true, 
        opacity: 0.5 
    });
    const xLine = new THREE.Line(xGeometry, xMaterial);
    xLine.name = 'xAxis';
    scene.add(xLine);
    axisLines.push(xLine);
    
    // Z axis (blue) - along ground
    const zGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.001, -halfSize),
        new THREE.Vector3(0, 0.001, halfSize)
    ]);
    const zMaterial = new THREE.LineBasicMaterial({ 
        color: 0x4444ff, 
        transparent: true, 
        opacity: 0.5 
    });
    const zLine = new THREE.Line(zGeometry, zMaterial);
    zLine.name = 'zAxis';
    scene.add(zLine);
    axisLines.push(zLine);
    
    // Y axis (green) - vertical, shorter
    const yGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 3, 0)
    ]);
    const yMaterial = new THREE.LineBasicMaterial({ 
        color: 0x44ff44, 
        transparent: true, 
        opacity: 0.5 
    });
    const yLine = new THREE.Line(yGeometry, yMaterial);
    yLine.name = 'yAxis';
    scene.add(yLine);
    axisLines.push(yLine);
}

/**
 * Update grid when grid size changes
 */
function updateGrid() {
    createGrid();
}

/**
 * Show or hide the grid
 * @param {boolean} visible 
 */
export function setGridVisible(visible) {
    if (gridHelper) gridHelper.visible = visible;
    if (groundPlane) groundPlane.visible = visible;
    axisLines.forEach(line => line.visible = visible);
}

/**
 * Get the ground plane for raycasting
 * @returns {THREE.Mesh}
 */
export function getGroundPlane() {
    return groundPlane;
}

export default { initGrid, setGridVisible, getGroundPlane };
