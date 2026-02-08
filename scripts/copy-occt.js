/**
 * Copies OpenCascade.js WASM binaries from node_modules to lib/occt/
 * Run automatically after npm install, or manually via: npm run setup
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'node_modules', 'opencascade.js', 'dist');
const DEST = path.join(__dirname, '..', 'lib', 'occt');

// Files needed by FromScratch (core + dynamic libs we load)
const FILES = [
    'opencascade.js',
    'opencascade.wasm',
    'opencascade.core.wasm',
    'opencascade.dataExchangeBase.wasm',
    'opencascade.modelingAlgorithms.wasm',
    'index.js',
    // Dynamic libs loaded at runtime
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
    'module.TKService.wasm',
];

if (!fs.existsSync(SRC)) {
    console.error('Error: opencascade.js not found in node_modules. Run npm install first.');
    process.exit(1);
}

fs.mkdirSync(DEST, { recursive: true });

let copied = 0;
for (const file of FILES) {
    const src = path.join(SRC, file);
    const dest = path.join(DEST, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        copied++;
    } else {
        console.warn(`Warning: ${file} not found in opencascade.js dist`);
    }
}

console.log(`✓ Copied ${copied}/${FILES.length} OpenCascade.js files to lib/occt/`);
