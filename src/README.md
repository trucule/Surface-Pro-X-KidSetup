# Playground Lab source
`playground-lab-3d.src.html` is the readable source of `apps/playground-lab.html`. The built file is the same text
with two libraries pasted in place of markers:
- `/*THREE_JS*/`   -> three.js r149, `node_modules/three/build/three.min.js` (npm install three@0.149.0)
- `/*CANNON_ES*/`  -> cannon-es 0.20, `node_modules/cannon-es/dist/cannon-es.cjs.js` (npm install cannon-es@0.20.0),
                      with its one Node line `const performance = require('perf_hooks')...` replaced by
                      `const performance = window.performance;`
`playground-lab-2d.src.html` is the earlier 2D (Matter.js) version, kept for reference; it is not installed.
