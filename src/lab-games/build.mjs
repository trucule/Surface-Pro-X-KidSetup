import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as esbuild from 'esbuild';

// 1. Models as base64 (Kenney CC0 + WebXR generic hand, MIT).
// Textures packed inside a GLB are normally decoded through blob: URLs, which some
// viewers and locked-down browsers refuse. Rewrite each embedded image as a data: URI.
function inlineTextures(buf) {
  // Kenney models share one palette texture. Strip it from the model and leave a marker
  // on each material that used it; the page builds the texture from raw pixels instead,
  // so the browser never fetches or decodes an image (some viewers forbid both).
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  if (!json.images || !json.images.length) return buf;
  const binStart = 20 + jsonLen + 8;
  for (const img of json.images) {
    const bv = json.bufferViews[img.bufferView];
    const bytes = buf.slice(binStart + (bv.byteOffset || 0), binStart + (bv.byteOffset || 0) + bv.byteLength);
    const h = crypto.createHash('md5').update(bytes).digest('hex');
    if (h !== COLORMAP_HASH) throw new Error('unexpected texture in model: ' + h);
  }
  for (const m of json.materials || []) {
    const pbr = m.pbrMetallicRoughness;
    if (pbr && pbr.baseColorTexture) { delete pbr.baseColorTexture; m.extras = Object.assign({}, m.extras, { klColormap: true }); }
  }
  delete json.images; delete json.textures; delete json.samplers;
  if (json.extensionsUsed) json.extensionsUsed = json.extensionsUsed.filter(x => x !== 'KHR_texture_transform');
  if (json.extensionsRequired) json.extensionsRequired = json.extensionsRequired.filter(x => x !== 'KHR_texture_transform');
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const rest = buf.slice(20 + jsonLen);
  const head = Buffer.alloc(20);
  head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + js.length + rest.length, 8);
  head.writeUInt32LE(js.length, 12); head.write('JSON', 16);
  return Buffer.concat([head, js, rest]);
}
const COLORMAP_HASH = JSON.parse(fs.readFileSync('src/colormap.js','utf8').replace(/^const COLORMAP = /,'').replace(/;\s*$/,'')).hash;
const models = {};
for (const f of fs.readdirSync('models').filter(f => f.endsWith('.glb'))) models[f.replace('.glb', '')] = inlineTextures(fs.readFileSync(path.join('models', f))).toString('base64');
const handDir = 'node_modules/@webxr-input-profiles/assets/dist/profiles/generic-hand';
models['hand-left'] = inlineTextures(fs.readFileSync(path.join(handDir, 'left.glb'))).toString('base64');
models['hand-right'] = inlineTextures(fs.readFileSync(path.join(handDir, 'right.glb'))).toString('base64');
fs.writeFileSync('src/models.js', 'export const MODELS = ' + JSON.stringify(models) + ';\n');

// 2. One module: imports, simulation, view.
const APP = process.argv.includes('chem') ? 'chem' : 'kitchen';
const OUT = APP === 'chem' ? 'chemistry-lab.html' : 'kitchen-lab.html';
const entry = `const APP = '${APP}';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MODELS } from './models.js';
${fs.readFileSync('src/colormap.js', 'utf8')}
${fs.readFileSync('src/sim.js', 'utf8')}
${fs.readFileSync('src/view.js', 'utf8')}
`;
const expose = `
;globalThis.__KL = { get pot(){return pot}, get bodies(){return bodies}, get particles(){return particles}, get stove(){return stove},
  get freezer(){return freezer}, get pourers(){return pourers}, holds, hands, scene, camera, view3, LOADED, OBJ, potLayers, cam, X3, Y3, S,
  screenToSim, toScreen, THREE, frame: (t) => frame(t), setHeat, get heat(){return heat}, heatToFrac, goSection, get section(){return section}, INV, STORAGE, toggleBasket, addToBasket, inBasket, grabFromBasket, dropFromBasket, env, BOARD, RECIPES, recipe, startRecipe, events, logEvent, chop, onBoard, thumbnail, nameOf, NAMES, dangers, distress, get lastDistress(){return lastDistress}, heldLabels, hints, CUPS, serveKey, fracToHeat, MAT, isMud, get dropCount(){return dropMesh ? dropMesh.count : 0} };`;
fs.writeFileSync('src/main.js', process.argv[2] === 'node' ? entry + expose : entry);
const target = process.argv[2] === 'node' ? 'node' : 'browser';
await esbuild.build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: target === 'browser', target: 'es2019',
  outfile: target === 'node' ? 'dist/game.node.js' : 'dist/game.js', platform: 'browser', legalComments: 'none' });

if (target === 'browser') {
  let tpl = fs.readFileSync('page.html', 'utf8');
  if (APP === 'chem') tpl = tpl.replace(/Kitchen Lab/g, 'Chemistry Lab').replace('<span>Recipes</span>', '<span>Experiments</span>')
    .replace(/Recipe book/g, 'Experiment book').replace('Drag bottles and objects from the shelves into the pot', 'Drag supplies into the beaker');
  if (APP === 'chem') {
    // Chemicals: a flask. Glassware: test tubes in a rack.
    const flask = '<svg viewBox="0 0 64 64" stroke="#2B2140" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"><path d="M24 8H40M27 8V26L12 52Q10 57 16 57H48Q54 57 52 52L37 26V8" fill="#EAF6FF"/><path d="M17 46H47L51 53Q52 55 48 55H16Q12 55 13 53Z" fill="#7CE07A" stroke-width="0"/></svg>';
    const tubes = '<svg viewBox="0 0 64 64" stroke="#2B2140" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"><path d="M8 26H56M8 40H56" fill="none"/><path d="M16 12V46Q16 52 21 52Q26 52 26 46V12" fill="#FFB3B0"/><path d="M38 12V46Q38 52 43 52Q48 52 48 46V12" fill="#BFE6FF"/></svg>';
    tpl = tpl.replace(/(data-section="pantry"[^>]*>\s*)<svg[\s\S]*?<\/svg>/, (m, a) => a + flask)
             .replace(/(data-section="cabinets"[^>]*>\s*)<svg[\s\S]*?<\/svg>/, (m, a) => a + tubes)
             .replace('aria-label="Pantry"', 'aria-label="Chemicals"').replace('aria-label="Cabinets"', 'aria-label="Glassware"').replace('aria-label="Fridge"', 'aria-label="Lab fridge"');
  }
  const js = fs.readFileSync('dist/game.js', 'utf8').replace(/<\/script/gi, '<\\/script');
  fs.writeFileSync('dist/' + OUT, tpl.replace('/*GAME*/', () => js));
  console.log(OUT, Math.round(fs.statSync('dist/' + OUT).size / 1024), 'KB');
}
