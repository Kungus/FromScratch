/**
 * FromScratch - OCCT Initialization
 * Loads OpenCascade.js WASM asynchronously at startup.
 * Singleton — call initOCCT() once, then getOC() everywhere else.
 */

import ocFactory from '../../lib/occt/opencascade.js';

let oc = null;
let loading = false;
let ready = false;

// WASM modules we need for CAD operations:
// Core is loaded automatically. These are the dynamic libs:
const LIBS_BASE_PATH = '../../lib/occt/';
const REQUIRED_LIBS = [
    'module.TKMath.wasm',
    'module.TKG2d.wasm',
    'module.TKG3d.wasm',
    'module.TKGeomBase.wasm',
    'module.TKBRep.wasm',
    'module.TKGeomAlgo.wasm',
    'module.TKTopAlgo.wasm',
    'module.TKShHealing.wasm',
    'module.TKMesh.wasm',
    'module.TKPrim.wasm',
    'module.TKBO.wasm',
    'module.TKBool.wasm',
    'module.TKFillet.wasm',
    'module.TKOffset.wasm',
];

/**
 * Initialize OpenCascade.js
 * Loads the WASM core + required dynamic libraries.
 * @returns {Promise<Object>} The OpenCascade instance
 */
export async function initOCCT() {
    if (ready) return oc;
    if (loading) {
        // Wait for existing load to complete
        return new Promise((resolve) => {
            const check = () => {
                if (ready) resolve(oc);
                else setTimeout(check, 50);
            };
            check();
        });
    }

    loading = true;
    console.log('OCCT: Loading geometry engine...');
    const startTime = performance.now();

    try {
        // Resolve the base URL for WASM files relative to the document
        const baseUrl = new URL('lib/occt/', window.location.href).href;

        oc = await ocFactory({
            locateFile(path) {
                if (path.endsWith('.wasm')) {
                    return baseUrl + 'opencascade.wasm';
                }
                return path;
            }
        });

        // Load required dynamic libraries
        for (const lib of REQUIRED_LIBS) {
            const libUrl = baseUrl + lib;
            await oc.loadDynamicLibrary(libUrl, {
                loadAsync: true,
                global: true,
                nodelete: true,
                allowUndefined: false
            });
        }

        ready = true;
        loading = false;

        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        console.log(`OCCT: Geometry engine ready (${elapsed}s)`);

        // Dispatch event for listeners
        window.dispatchEvent(new CustomEvent('fromscratch:occtready'));

        return oc;
    } catch (err) {
        loading = false;
        console.error('OCCT: Failed to load geometry engine', err);
        throw err;
    }
}

/**
 * Get the OpenCascade instance (must call initOCCT first)
 * @returns {Object|null} The OC instance or null if not loaded
 */
export function getOC() {
    return oc;
}

/**
 * Check if OCCT is loaded and ready
 * @returns {boolean}
 */
export function isOCCTReady() {
    return ready;
}
