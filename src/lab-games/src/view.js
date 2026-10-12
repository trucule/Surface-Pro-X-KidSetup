// ===========================================================================
// 3D view: real models, first-person hands, camera, input.
// ===========================================================================
THREE.ColorManagement.legacyMode = false;
const S = 0.01;
const X3 = x => (x - 800) * S;
const Y3 = y => (500 - y) * S;
const WALL_Z = -2.6, FRONT_Z = 2.6;
const HAND_LEN = 1.45;        // wrist to fingertip, in scene units

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#BFE7F2');
const camera = new THREE.PerspectiveCamera(55, 1.6, 0.5, 100);   // a near plane well clear of zero keeps depth precise (no z-fighting)
const cam = { dist: 10.6, lean: 0 };

function resize3d() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  cam.dist = Math.max(4.6 / t, 6.9 / camera.aspect / t);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize3d);

// ---------------------------------------------------------------------------
// Procedural textures (counter, tiles, steel, and the pot's contents)
// ---------------------------------------------------------------------------
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct) { let v = 0, a = 0.5, f = 1; for (let i = 0; i < (oct || 4); i++) { v += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; } return v; }
function makeTex(size, paint, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}
function pixels(g, n, fn) {
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = fn(x, y), i = (y * n + x) * 4;
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
const TEX = {};
function buildTextures() {
  const wood = (base, dark) => (g, n) => pixels(g, n, (x, y) => {
    const strip = Math.floor(x / (n / 6));
    const w = fbm(x * 0.01 + strip * 3, y * 0.002, 3);
    const grain = 0.5 + 0.5 * Math.sin((x + w * 60 + strip * 17) * 0.35);
    const t = 0.25 * grain + 0.35 * fbm(x * 0.05, y * 0.01, 3) + (strip % 2) * 0.12 + ((x % (n / 6)) < 2 ? 0.5 : 0);
    return lerp3(base, dark, Math.min(1, t));
  });
  TEX.counter = makeTex(512, wood([233, 168, 92], [165, 98, 40]), [3, 1]);
  TEX.shelf = makeTex(256, wood([226, 160, 88], [150, 90, 38]), [6, 0.4]);
  TEX.tile = makeTex(512, (g, n) => {
    const T = n / 4;
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      const base = LAB === 'chem' ? lerp3([236, 240, 244], [222, 228, 234], hash(tx, ty)) : lerp3([142, 209, 230], [118, 196, 222], hash(tx, ty));
      const grd = g.createLinearGradient(tx * T, ty * T, tx * T + T, ty * T + T);
      grd.addColorStop(0, `rgb(${lerp3(base, [255, 255, 255], 0.25).map(Math.round)})`);
      grd.addColorStop(0.5, `rgb(${base.map(Math.round)})`);
      grd.addColorStop(1, `rgb(${lerp3(base, [40, 90, 120], 0.15).map(Math.round)})`);
      g.fillStyle = grd; g.fillRect(tx * T, ty * T, T, T);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(tx * T + T * 0.12, ty * T + T * 0.1, T * 0.5, T * 0.06);
    }
    g.strokeStyle = '#E3F6F8'; g.lineWidth = 10;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * T, 0); g.lineTo(i * T, n); g.stroke(); g.beginPath(); g.moveTo(0, i * T); g.lineTo(n, i * T); g.stroke(); }
  }, [10, 6]);
  TEX.steel = makeTex(256, (g, n) => pixels(g, n, (x, y) => { const v = 0.75 + 0.15 * fbm(x * 0.6, y * 0.02, 2) + 0.1 * hash(x, y * 0.01); return [190 * v, 198 * v, 210 * v]; }), [2, 1]);
  TEX.rock = makeTex(256, (g, n) => pixels(g, n, (x, y) => lerp3([170, 165, 180], [95, 90, 108], fbm(x * 0.04, y * 0.04, 5) + (hash(x, y) > 0.97 ? 0.25 : 0))));
  TEX.sponge = makeTex(256, (g, n) => {
    g.fillStyle = '#FFD650'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(150,100,10,${0.25 + hash(i, 5) * 0.35})`; g.beginPath(); g.ellipse(hash(i, 3) * n, hash(3, i) * n, 2 + hash(i, 7) * 5, 2 + hash(7, i) * 4, hash(i, 9) * 3, 0, 7); g.fill(); }
  });
  // Sand: individual grains in several mineral colors, with tiny shadows between them.
  TEX.sand = makeTex(512, (g, n) => {
    pixels(g, n, (x, y) => lerp3([226, 190, 122], [196, 150, 84], fbm(x * 0.03, y * 0.03, 3)));
    const grains = [[245, 222, 170], [214, 170, 100], [180, 130, 70], [150, 140, 130], [250, 240, 220], [120, 90, 60]];
    for (let i = 0; i < 9000; i++) {
      const x = hash(i, 41) * n, y = hash(41, i) * n, r = 0.8 + hash(i, 43) * 2.2, c = grains[Math.floor(hash(i, 47) * grains.length)];
      g.fillStyle = 'rgba(80,55,25,0.25)'; g.beginPath(); g.arc(x + 0.8, y + 0.8, r, 0, 7); g.fill();
      g.fillStyle = `rgb(${c})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }, [4, 1.5]);
  // Wet mud: dark, glossy, streaky, with sand grains showing through.
  TEX.mud = makeTex(512, (g, n) => {
    pixels(g, n, (x, y) => {
      const swirl = fbm(x * 0.012 + fbm(x * 0.02, y * 0.02, 2) * 2, y * 0.03, 4);
      return lerp3([128, 84, 48], [62, 38, 20], swirl);
    });
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${200 + hash(i, 3) * 40 | 0},${160 + hash(3, i) * 40 | 0},100,${0.25 + hash(i, 9) * 0.3})`; g.fillRect(hash(i, 51) * n, hash(51, i) * n, 1.5, 1.5); }
    for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(255,240,220,0.18)'; g.lineWidth = 2; g.beginPath(); const x = hash(i, 61) * n, y = hash(61, i) * n; g.moveTo(x, y); g.quadraticCurveTo(x + 30, y + 10, x + 60, y - 4); g.stroke(); }
  }, [3, 1]);
  // Fine silt for cloudy water.
  TEX.silt = makeTex(256, (g, n) => {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(110,75,40,${0.15 + hash(i, 71) * 0.35})`; g.fillRect(hash(i, 73) * n, hash(73, i) * n, 1 + hash(i, 79) * 1.5, 1 + hash(79, i) * 1.5); }
  }, [3, 1.5]);
  TEX.cake = makeTex(256, (g, n) => {
    pixels(g, n, (x, y) => lerp3([242, 196, 122], [214, 150, 70], fbm(x * 0.06, y * 0.06, 3)));
    for (let i = 0; i < 200; i++) { g.fillStyle = 'rgba(150,90,30,0.35)'; g.beginPath(); g.arc(hash(i, 11) * n, hash(11, i) * n, 1 + hash(i, 13) * 3, 0, 7); g.fill(); }
  }, [3, 1]);
  TEX.foam = makeTex(256, (g, n) => {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 140; i++) { g.strokeStyle = `rgba(150,180,210,${0.25 + hash(i, 17) * 0.3})`; g.lineWidth = 2; g.beginPath(); g.arc(hash(i, 15) * n, hash(15, i) * n, 3 + hash(i, 19) * 12, 0, 7); g.stroke(); }
  }, [4, 1]);
  TEX.crystal = makeTex(256, (g, n) => {
    g.fillStyle = '#F4F8FF'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(150,180,225,${0.3 + hash(i, 21) * 0.4})`; g.fillRect(hash(i, 23) * n, hash(23, i) * n, 5 + hash(i, 25) * 7, 5 + hash(25, i) * 7); }
  }, [4, 1]);
  TEX.batter = makeTex(256, (g, n) => pixels(g, n, (x, y) => lerp3([255, 238, 205], [240, 215, 170], fbm(x * 0.03, y * 0.03, 3))), [3, 1]);
  TEX.flour = makeTex(256, (g, n) => pixels(g, n, (x, y) => lerp3([255, 250, 240], [228, 214, 190], fbm(x * 0.08, y * 0.08, 3) * 0.7 + hash(x, y) * 0.3)), [3, 1]);
  TEX.sleeve = makeTex(128, (g, n) => {
    g.fillStyle = '#FF6B6B'; g.fillRect(0, 0, n, n);
    g.fillStyle = '#FFE066'; for (let y = 0; y < n; y += 32) g.fillRect(0, y, n, 12);
  }, [1, 3]);
  TEX.label = (col) => makeTex(128, (g, n) => { g.fillStyle = col; g.fillRect(0, 0, n, n); g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(n / 2, n / 2, n * 0.28, 0, 7); g.fill(); });
}

const MAT = {};
function std(o) { return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.6, metalness: 0 }, o)); }
function buildMaterials() {
  const plain = (color, r) => std({ color, roughness: r == null ? 0.5 : r });
  Object.assign(MAT, {
    counter: LAB === 'chem' ? std({ color: '#2B2F38', roughness: 0.35, metalness: 0.05 }) : std({ map: TEX.counter, bumpMap: TEX.counter, bumpScale: 0.02, roughness: 0.55 }),
    shelf: LAB === 'chem' ? std({ color: '#C9CFD8', metalness: 0.45, roughness: 0.35 }) : std({ map: TEX.shelf, bumpMap: TEX.shelf, bumpScale: 0.02 }),
    tile: std({ map: TEX.tile, roughness: 0.25 }),
    steel: std({ map: TEX.steel, color: '#D6DEE8', metalness: 0.85, roughness: 0.32 }),
    steelDark: std({ map: TEX.steel, color: '#7C899B', metalness: 0.8, roughness: 0.4 }),
    grate: plain('#3D3550', 0.5),
    glass: std({ color: '#DDF3FF', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }),
    ink: plain('#2B2140', 0.4), white: plain('#FFFFFF'),
    yellow: plain('#FFC93C', 0.45), orange: plain('#FF8A3D', 0.45), red: plain('#FF5A4E', 0.4), green: plain('#5CC46B'),
    gold: std({ color: '#FFC93C', metalness: 0.9, roughness: 0.28 }),
    rock: std({ map: TEX.rock, bumpMap: TEX.rock, bumpScale: 0.05, roughness: 0.9 }),
    sponge: std({ map: TEX.sponge, bumpMap: TEX.sponge, bumpScale: 0.04, roughness: 0.95 }),
    butter: plain('#FFE58A', 0.35), ice: std({ color: '#CDEFFF', transparent: true, opacity: 0.7, roughness: 0.05 }),
    mallow: plain('#FFF6FA', 0.8), kernel: plain('#F5A623', 0.35), popcorn: plain('#FFFDF2', 0.85), yolk: plain('#FFB52E', 0.3),
    eggWhite: std({ color: '#FFFFFF', transparent: true, opacity: 0.85, roughness: 0.15 }),
    crys: std({ map: TEX.crystal, roughness: 0.3 }), caramel: plain('#C77B2A', 0.25),
    sand: std({ map: TEX.sand, bumpMap: TEX.sand, bumpScale: 0.06, roughness: 0.95 }),
    mud: std({ map: TEX.mud, bumpMap: TEX.mud, bumpScale: 0.05, roughness: 0.32 }),
    murky: std({ map: TEX.silt, color: '#B08A5E', transparent: true, opacity: 0.82, roughness: 0.15, depthWrite: false }),
    cake: std({ map: TEX.cake, bumpMap: TEX.cake, bumpScale: 0.05, roughness: 0.85 }),
    batter: std({ map: TEX.batter, roughness: 0.35 }), flourTop: std({ map: TEX.flour, roughness: 1 }),
    honey: std({ color: '#E8A317', transparent: true, opacity: 0.88, roughness: 0.05 }),
    water: std({ color: '#5BB8F5', transparent: true, opacity: 0.55, roughness: 0.08, depthWrite: false }),
    frozen: std({ color: '#D2F0FF', transparent: true, opacity: 0.85, roughness: 0.15 }),
    oil: std({ color: '#F5C542', transparent: true, opacity: 0.7, roughness: 0.05, depthWrite: false }),
    foam: std({ map: TEX.foam, roughness: 0.9 }),
    drop: std({ roughness: 0.25 }),
    cloud: std({ transparent: true, opacity: 0.35, depthWrite: false, roughness: 0.6 }),
    steam: std({ color: '#FFFFFF', transparent: true, opacity: 0.35, depthWrite: false, roughness: 1 }),
    puddle: std({ roughness: 0.2, transparent: true, opacity: 0.85 }),
    spot: std({ roughness: 0.3 }),
    flame: new THREE.MeshBasicMaterial({ color: '#FF7A3D' }), flameCore: new THREE.MeshBasicMaterial({ color: '#FFD45E' }),
    frost: plain('#EAF7FF', 0.9),
    skin: std({ color: '#F2B48E', roughness: 0.55 }),
    sleeve: std({ map: TEX.sleeve, roughness: 0.85 }), cuff: plain('#FFFFFF', 0.8)
  });
}
function mesh(geo, mat, shadow) {
  const m = new THREE.Mesh(geo, mat);
  if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
  return m;
}

// ---------------------------------------------------------------------------
// Loaded models (Kenney, CC0). Each is fitted to a size and centered.
// ---------------------------------------------------------------------------
const LOADED = {};
function b64ToBuffer(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
async function loadModels() {
  // The models' shared palette texture, built from raw pixels (no image fetch or decode).
  const pal = b64ToBuffer(COLORMAP.palette), ix = new Uint8Array(b64ToBuffer(COLORMAP.index));
  const palette = new Uint8Array(pal), rgba = new Uint8Array(COLORMAP.w * COLORMAP.h * 4);
  for (let i = 0; i < ix.length; i++) { const p = ix[i] * 4; rgba[i * 4] = palette[p]; rgba[i * 4 + 1] = palette[p + 1]; rgba[i * 4 + 2] = palette[p + 2]; rgba[i * 4 + 3] = palette[p + 3]; }
  const colormap = new THREE.DataTexture(rgba, COLORMAP.w, COLORMAP.h, THREE.RGBAFormat);
  colormap.magFilter = THREE.NearestFilter; colormap.minFilter = THREE.NearestMipmapNearestFilter;
  colormap.generateMipmaps = true; colormap.flipY = false; colormap.encoding = THREE.sRGBEncoding;
  colormap.needsUpdate = true;
  view3.colormap = colormap;
  const applyColormap = (root) => root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.userData && m.userData.klColormap) { m.map = colormap; m.needsUpdate = true; }
  });
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(MODELS).map(([key, b64]) => new Promise((resolve) => {
    loader.parse(b64ToBuffer(b64), '', (gltf) => { applyColormap(gltf.scene); LOADED[key] = gltf; resolve(); }, (err) => { console.warn('model', key, err); resolve(); });
  })));
}
// A copy of a loaded model whose largest dimension is `size`, centered on its origin.
function fitted(key, size, tint) {
  const src = LOADED[key];
  if (!src) return null;
  const inner = src.scene.clone(true);
  inner.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      if (tint) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(tint)); }
    }
  });
  const box = new THREE.Box3().setFromObject(inner), dim = new THREE.Vector3(), mid = new THREE.Vector3();
  box.getSize(dim); box.getCenter(mid);
  const k = size / Math.max(dim.x, dim.y, dim.z);
  inner.scale.setScalar(k);
  inner.position.copy(mid).multiplyScalar(-k);
  const g = new THREE.Group(); g.add(inner);
  return g;
}

const KIT_OBJECTS = {
  apple: 'food-apple', banana: 'food-banana', orange: 'food-orange', lemon: 'food-lemon', tomato: 'food-tomato',
  grapes: 'food-grapes', carrot: 'food-carrot', mushroom: 'food-mushroom', cabbage: 'food-cabbage', egg: 'food-egg',
  cheese: 'food-cheese', cookie: 'food-cookie', choc: 'food-chocolate', icecream: 'food-ice-cream-scoop-chocolate',
  mint: 'food-ice-cream-scoop-mint', candy: 'food-candy-bar', whisk: 'food-whisk', spoon: 'food-cooking-spoon', shell: 'food-egg-half',
  knife: 'food-utensil-knife', bread: 'food-bread',
  fork: 'food-utensil-fork', teaspoon: 'food-utensil-spoon', plate: 'food-plate-dinner', bowl: 'food-bowl', cup: 'food-cup', mug: 'food-mug', glass: 'food-glass', croissant: 'food-croissant', donut: 'food-donut', cupcake: 'food-cupcake', strawberry: 'food-strawberry',
  broccoli: 'food-broccoli', corn: 'food-corn', pear: 'food-pear', pineapple: 'food-pineapple', avocado: 'food-avocado', cherries: 'food-cherries'
};
// Things whose color changes as they cook: toasted, browned, or bright green.
const COOK_COLORS = { banana: [140, 90, 40], bread: [190, 120, 50], croissant: [180, 110, 40], donut: [170, 100, 40], cupcake: [190, 120, 60], broccoli: [70, 210, 60] };
const TINTS = { cabbage: '#B05BD0' };   // the kit's cabbage is green; ours is red cabbage

// Mashed food: a soft, lumpy, flattened heap in the color of whatever was mashed.
function makeMashModel(src) {
  const r = OBJ.mash.r * S;
  const col = (BLEND[src] && BLEND[src].col) || [210, 200, 150];
  const geo = new THREE.SphereGeometry(r, 24, 14), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 + 0.12 * Math.sin(p.getX(i) * 31 + p.getZ(i) * 17) * Math.cos(p.getY(i) * 23); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const m = mesh(geo, std({ color: rgbColor(col), roughness: 0.75 }));
  m.scale.set(1.15, 0.45, 1.15);
  const g = new THREE.Group(); g.add(m); return g;
}

// ---------------------------------------------------------------------------
// Chemistry Lab pieces
// ---------------------------------------------------------------------------
const FORMULA = { water: 'H₂O', peroxide: 'H₂O₂', soda: 'NaHCO₃', salt: 'NaCl', sugar: 'C₁₂H₂₂O₁₁', vinegar: 'CH₃COOH',
  lemon: 'C₆H₈O₇', fizzwater: 'H₂O + CO₂', starch: '(C₆H₁₀O₅)ₙ', glue: 'PVA', activator: 'Borate', cabbagejuice: 'pH',
  red: 'Dye', yellow: 'Dye', blue: 'Dye', soap: 'Soap', milk: 'Milk', cola: 'Cola', oil: 'Oil', honey: 'Honey', yeast: 'Yeast' };
const labelBandTex = new Map();
function labelBand(text, stripe) {
  const key = text + stripe;
  if (labelBandTex.has(key)) return labelBandTex.get(key);
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = stripe; g.fillRect(0, 0, 256, 16); g.fillRect(0, 80, 256, 16);
  g.fillStyle = '#1F2430'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 ${text.length > 8 ? 30 : 40}px system-ui, sans-serif`;
  g.fillText(text, 64, 48); g.fillText(text, 192, 48);   // seen from either side of the bottle
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  labelBandTex.set(key, t);
  return t;
}
const glassMat = () => std({ color: '#BFDDF2', transparent: true, opacity: 0.55, roughness: 0.05, depthWrite: false });
// A glass container from a profile turned on a lathe, with liquid (or powder) inside.
function lathe(points, mat) { return mesh(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), 36), mat, false); }

// Lab containers for substances: wash bottle, dropper bottles, amber and reagent bottles, powder jars.
function makeLabContainer(type) {
  const g = new THREE.Group(), add = (m, x, y, z) => { m.position.set(x || 0, y || 0, z || 0); g.add(m); return m; };
  const col = (SUB[type] && SUB[type].col) || '#CCCCCC';
  const liquidMat = std({ color: col, transparent: true, opacity: 0.9, roughness: 0.1 });
  const label = (r, y, h, stripe) => add(mesh(new THREE.CylinderGeometry(r, r, h, 28, 1, true), std({ map: labelBand(FORMULA[type] || nameOf('sub', type), stripe), roughness: 0.6 })), 0, y);
  const powders = ['soda', 'salt', 'sugar', 'starch', 'yeast', 'honey'];
  if (type === 'water') {
    // squeezable wash bottle with a bent spout
    add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.5, 28), std({ color: '#F2F7FA', transparent: true, opacity: 0.75, roughness: 0.4 })), 0, -0.08);
    add(mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.32, 28), std({ color: '#7FC4F0', transparent: true, opacity: 0.7, roughness: 0.1 })), 0, -0.16);
    add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20), std({ color: '#2F6FD0', roughness: 0.4 })), 0, 0.21);
    const tube = add(mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 20, Math.PI * 0.7), std({ color: '#F2F7FA', roughness: 0.4 })), -0.16, 0.25);
    tube.rotation.z = 0.2;
    label(0.222, -0.04, 0.16, '#2F6FD0');
  } else if (['red', 'yellow', 'blue', 'cabbagejuice'].includes(type)) {
    // small dropper bottle with a rubber bulb
    add(lathe([[0, -0.25], [0.15, -0.25], [0.15, 0.05], [0.08, 0.12], [0.06, 0.14], [0, 0.14]], glassMat()));
    add(mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.26, 24), liquidMat), 0, -0.11);
    add(mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.07, 16), std({ color: '#222831', roughness: 0.5 })), 0, 0.17);
    add(mesh(new THREE.SphereGeometry(0.065, 16, 12), std({ color: '#222831', roughness: 0.6 })), 0, 0.25).scale.set(1, 1.4, 1);
    label(0.152, -0.1, 0.12, col);
  } else if (powders.includes(type)) {
    // wide-mouth jar with powder inside
    add(lathe([[0, -0.28], [0.2, -0.28], [0.21, 0.12], [0.17, 0.16], [0, 0.16]], glassMat()));
    add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.28, 24), std({ color: col, roughness: type === 'honey' ? 0.15 : 0.9, transparent: type === 'honey', opacity: 0.92 })), 0, -0.13);
    add(mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.09, 24), std({ color: type === 'yeast' ? '#C0392B' : '#2F3B52', roughness: 0.5 })), 0, 0.2);
    label(0.212, -0.08, 0.14, '#5B6B84');
  } else {
    // reagent bottle (amber for peroxide, which is stored away from light)
    const amber = type === 'peroxide';
    add(lathe([[0, -0.3], [0.17, -0.3], [0.17, 0.06], [0.1, 0.16], [0.065, 0.2], [0.065, 0.26], [0, 0.26]],
      amber ? std({ color: '#7A4A1E', transparent: true, opacity: 0.8, roughness: 0.15 }) : glassMat()));
    if (!amber) add(mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.3, 24), liquidMat), 0, -0.14);
    add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 16), std({ color: amber ? '#1E2430' : '#3A7BD5', roughness: 0.4 })), 0, 0.3);
    label(0.172, -0.1, 0.16, amber ? '#7A4A1E' : '#3A7BD5');
  }
  return g;
}

// Lab equipment, in place of kitchenware (same handling underneath).
function makeLabEquipment(type) {
  const r = OBJ[type].r * S, g = new THREE.Group(), add = (m, x, y, z) => { m.position.set(x || 0, y || 0, z || 0); g.add(m); return m; };
  const fillMesh = (rad, bottom, full) => {
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.95, 1, 24), std({ color: '#5BB8F5', transparent: true, opacity: 0.88, roughness: 0.15 }));
    liq.geometry.translate(0, 0.5, 0); liq.position.y = bottom; liq.userData.full = full; liq.visible = false; liq.name = 'fill'; g.add(liq);
  };
  switch (type) {
    case 'cup': {   // test tube
      const h = r * 2.6, rad = r * 0.42;
      add(lathe([[0, -h / 2], [rad * 0.6, -h / 2 + rad * 0.2], [rad, -h / 2 + rad], [rad, h / 2], [rad * 1.15, h / 2 + 0.01], [rad * 1.15, h / 2 + 0.03]], glassMat()));
      fillMesh(rad * 0.85, -h / 2 + rad * 0.3, h * 0.85);
      return g;
    }
    case 'glass': {   // Erlenmeyer flask
      const h = r * 2.3, b = r * 0.95, n = r * 0.3;
      add(lathe([[0, -h / 2], [b, -h / 2], [b * 1.02, -h / 2 + 0.03], [n, h * 0.15], [n, h / 2], [n * 1.2, h / 2 + 0.02]], glassMat()));
      fillMesh(b * 0.75, -h / 2 + 0.02, h * 0.45);
      return g;
    }
    case 'mug': {   // graduated cylinder
      const h = r * 2.8, rad = r * 0.38;
      add(lathe([[0, -h / 2 + 0.04], [rad, -h / 2 + 0.04], [rad, h / 2], [rad * 1.25, h / 2 + 0.02]], glassMat()));
      add(mesh(new THREE.CylinderGeometry(rad * 2.1, rad * 2.1, 0.04, 6), std({ color: '#3A7BD5', roughness: 0.4 })), 0, -h / 2 + 0.02);
      for (let i = 1; i < 8; i++) add(mesh(new THREE.BoxGeometry(i % 2 ? rad * 0.5 : rad * 0.9, 0.008, 0.01), MAT.white, false), -rad * 0.4, -h / 2 + 0.04 + i * h / 9, rad * 0.98);
      fillMesh(rad * 0.88, -h / 2 + 0.05, h * 0.9);
      return g;
    }
    case 'bowl': {   // small beaker with a spout
      const h = r * 1.5, rad = r * 0.82;
      add(lathe([[0, -h / 2], [rad, -h / 2], [rad, h / 2], [rad * 1.08, h / 2 + 0.02]], glassMat()));
      for (let i = 1; i < 4; i++) add(mesh(new THREE.BoxGeometry(rad * 0.35, 0.008, 0.01), MAT.white, false), -rad * 0.3, -h / 2 + i * h / 4, rad * 0.98);
      fillMesh(rad * 0.9, -h / 2 + 0.02, h * 0.85);
      return g;
    }
    case 'plate': {   // petri dish: lies flat, bottom on the bench
      const rad = r * 0.95, h = OBJ.plate.flat * S * 2;
      add(mesh(new THREE.CylinderGeometry(rad, rad, h, 40, 1, true), glassMat()), 0, 0);
      add(mesh(new THREE.CylinderGeometry(rad, rad, 0.01, 40), std({ color: '#F2FAFF', transparent: true, opacity: 0.45, roughness: 0.05, depthWrite: false }), false), 0, -h / 2 + 0.006);
      return g;
    }
    case 'fork': {   // tongs: long along x, the gripping tips at -x (like the kit's fork)
      const steel = MAT.steel;
      [-1, 1].forEach(s => { const arm = add(mesh(new THREE.BoxGeometry(r * 2.2, r * 0.06, r * 0.12), steel), 0, 0, s * r * 0.1); arm.rotation.y = s * 0.06; });
      add(mesh(new THREE.TorusGeometry(r * 0.12, r * 0.03, 8, 16, Math.PI), steel), r * 1.1, 0, 0).rotation.set(Math.PI / 2, 0, Math.PI / 2);
      return g;
    }
    case 'spoon': {   // glass stirring rod
      const rod = add(mesh(new THREE.CylinderGeometry(r * 0.05, r * 0.05, r * 2.6, 12), std({ color: '#EAF6FF', transparent: true, opacity: 0.6, roughness: 0.05 })));
      rod.rotation.z = Math.PI / 2;
      return g;
    }
    case 'teaspoon': {   // lab spatula: flat blade at -x
      const steel = MAT.steel;
      const h = add(mesh(new THREE.BoxGeometry(r * 1.4, r * 0.05, r * 0.12), steel), r * 0.4, 0);
      add(mesh(new THREE.BoxGeometry(r * 0.7, r * 0.03, r * 0.32), steel), -r * 0.65, 0);
      return g;
    }
  }
  return null;
}

// Measuring marks on the big beaker: white ticks and numbers across the front.
function addBeakerMarks(rOut, yTop, yBot) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 512); g.fillStyle = '#2F5FA8'; g.strokeStyle = '#2F5FA8';   // blue printed marks (white would vanish against the tile)
  g.font = 'bold 30px system-ui, sans-serif'; g.textBaseline = 'middle';
  for (let i = 1; i <= 10; i++) {
    const y = 512 - i * 46;
    g.lineWidth = i % 2 ? 4 : 6; g.beginPath(); g.moveTo(40, y); g.lineTo(i % 2 ? 110 : 150, y); g.stroke();
    if (i % 2 === 0) g.fillText(String(i * 100), 160, y);
  }
  g.fillText('mL', 160, 512 - 11 * 46 + 10);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  const marks = mesh(new THREE.CylinderGeometry(rOut + 0.012, rOut + 0.012, yTop - yBot, 32, 1, true, -1.3, 0.7),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }), false);
  marks.position.set(0, (yTop + yBot) / 2, 0); marks.renderOrder = 6; scene.add(marks);
  // pour spout at the front-left of the rim
  const spout = mesh(new THREE.TorusGeometry(0.16, 0.05, 10, 20, Math.PI), std({ color: '#EAF6FF', transparent: true, opacity: 0.6, roughness: 0.05 }), false);
  spout.position.set(-rOut * 0.72, yTop + 0.02, rOut * 0.7); spout.rotation.set(Math.PI / 2, 0, -Math.PI * 0.25); scene.add(spout);
}

// The lab bench: hot plate, flasks and a test-tube rack.
function buildLabBench(ctop) {
  const hp = new THREE.Group(); hp.position.set(0, ctop, -0.2); env.counter.add(hp);
  const body = mesh(new THREE.BoxGeometry(5.0, 0.2, 3.8), std({ color: '#E9EDF2', roughness: 0.4 })); body.position.y = 0.1; hp.add(body);
  const top = mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.03, 48), std({ color: '#2A2E36', roughness: 0.3, emissive: '#FF4A1F', emissiveIntensity: 0 })); top.position.y = 0.215; hp.add(top);
  const knob = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 20), MAT.steelDark); knob.rotation.x = Math.PI / 2; knob.position.set(1.9, 0.1, 1.92); hp.add(knob);
  const lamp = mesh(new THREE.SphereGeometry(0.06, 12, 10), std({ color: '#5A1010', emissive: '#FF2A1A', emissiveIntensity: 0.1 })); lamp.position.set(1.45, 0.12, 1.91); hp.add(lamp);
  view3.hotplate = { top, lamp };
  const flask = (x, y, z, s, col) => {
    const f = new THREE.Group(); f.position.set(x, y, z); env.counter.add(f);
    f.add(lathe([[0, 0], [0.35 * s, 0], [0.36 * s, 0.03], [0.1 * s, 0.6 * s], [0.1 * s, 0.85 * s], [0.12 * s, 0.87 * s]], glassMat()));
    const liq = lathe([[0, 0.02], [0.32 * s, 0.02], [0.2 * s, 0.32 * s], [0, 0.32 * s]], std({ color: col, transparent: true, opacity: 0.85, roughness: 0.1 }));
    f.add(liq);
  };
  // on the shelf above
  const shelfY = SHELF_ROWS[0].top;
  flask(-6.6, shelfY, -0.3, 1.1, '#FF5A8A'); flask(-5.6, shelfY, -0.3, 0.8, '#4AC8FF'); flask(6.4, shelfY, -0.3, 1.0, '#7CE07A');
  // a test-tube rack on the bench, far right
  const rack = new THREE.Group(); rack.position.set(7.6, ctop, -1.6); env.counter.add(rack);
  const wood = std({ color: '#D6DCE4', roughness: 0.5 });
  [0.15, 0.55].forEach(y => { const p = mesh(new THREE.BoxGeometry(1.6, 0.05, 0.4), wood); p.position.y = y; rack.add(p); });
  [-0.78, 0.78].forEach(x => { const p = mesh(new THREE.BoxGeometry(0.05, 0.6, 0.4), wood); p.position.set(x, 0.3, 0); rack.add(p); });
  ['#FF5A4E', '#FFC93C', '#3BB273', '#5BB8F5', '#B05BD0'].forEach((col, i) => {
    const x = -0.6 + i * 0.3;
    const tube = lathe([[0, 0.05], [0.07, 0.07], [0.08, 0.15], [0.08, 0.9], [0.09, 0.92]], glassMat());
    tube.position.set(x, 0, 0); rack.add(tube);
    const liq = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.35, 12), std({ color: col, transparent: true, opacity: 0.9, roughness: 0.1 }), false);
    liq.position.set(x, 0.3, 0); rack.add(liq);
  });
}

// A soft, lumpy blob in a given color (slime is glossy; milk plastic is matte).
function makeBlobModel(col, rough, r0) {
  const r = r0 * S;
  const geo = new THREE.SphereGeometry(r, 24, 16), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 + 0.1 * Math.sin(p.getX(i) * 23 + p.getZ(i) * 11) * Math.cos(p.getY(i) * 19); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const m = mesh(geo, std({ color: rgbColor(col), roughness: rough, metalness: 0.0 }));
  m.scale.set(1.1, 0.75, 1.1);
  const g = new THREE.Group(); g.add(m); return g;
}
// Notebook paper: cream with blue lines and a red margin.
function drawPaper(g, reveal) {
  g.fillStyle = '#FFFBEA'; g.fillRect(0, 0, 256, 170);
  g.strokeStyle = '#8DB8E8'; g.lineWidth = 3;
  for (let y = 30; y < 170; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.strokeStyle = '#E88D8D'; g.beginPath(); g.moveTo(36, 0); g.lineTo(36, 170); g.stroke();
}
// What chemistry does to how things look.
function syncChemLooks(b, m) {
  if (b.type === 'coin' && b.tarnish != null) {
    // dull brown penny -> bright copper
    m.traverse(o => { if (o.isMesh) {
      if (!o.userData.chemBase) { o.material = o.material.clone(); o.userData.chemBase = o.material.color.clone(); }
      o.material.color.copy(o.userData.chemBase).lerp(new THREE.Color('#E08A4E'), 0.7).lerp(new THREE.Color('#4A3326'), b.tarnish * 0.85);
      o.material.metalness = 0.3 + 0.6 * (1 - b.tarnish); o.material.roughness = 0.25 + 0.6 * b.tarnish;
    } });
  }
  if (b.type === 'egg' && (b.shell != null || b.naked)) {
    const k = b.naked ? 1 : 1 - Math.max(0, b.shell);
    m.traverse(o => { if (o.isMesh) {
      if (!o.userData.chemBase) { o.material = o.material.clone(); o.userData.chemBase = o.material.color.clone(); }
      o.material.color.copy(o.userData.chemBase).lerp(new THREE.Color('#FFF3C8'), k);
      o.material.transparent = k > 0.3; o.material.opacity = 1 - 0.3 * k; o.material.roughness = 0.6 - 0.4 * k;
    } });
  }
  if (b.type === 'stick') { const cg = m.getObjectByName('crystals'); if (cg) cg.scale.setScalar(Math.max(0.001, b.crystal || 0)); }
  if (b.type === 'paper') {
    const card = m.getObjectByName('card'), pd = card && card.userData.paper;
    const shown = Math.round((b.reveal || 0) * 20) / 20;
    if (pd && pd.shown !== shown) {
      pd.shown = shown;
      const g = pd.c.getContext('2d');
      drawPaper(g, shown);
      if (shown > 0) {
        g.globalAlpha = shown; g.fillStyle = '#8A5A2B'; g.strokeStyle = '#8A5A2B'; g.lineWidth = 8;
        g.font = 'bold 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('HI!', 128, 70);
        g.beginPath(); g.arc(128, 128, 30, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
        g.globalAlpha = 1;
      }
      pd.tex.needsUpdate = true;
    }
  }
}
function makeObjectModel(type) {
  const r = OBJ[type].r * S;
  if (LAB === 'chem') { const lab = makeLabEquipment(type); if (lab) return lab; }
  if (LAB === 'chem' && type === 'candy') {
    const g = new THREE.Group();
    const mint = mesh(new THREE.SphereGeometry(r * 0.9, 24, 16), std({ color: '#FBFBF8', roughness: 0.35 })); mint.scale.set(1, 0.55, 1); g.add(mint);
    return g;
  }
  if (KIT_OBJECTS[type]) {
    const m = fitted(KIT_OBJECTS[type], r * 2.15, TINTS[type]);
    if (m && type === 'plate') {
      // A plate lies flat: its underside sits on the counter, not its middle.
      const h = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).y;
      m.children[0].position.y += h / 2 - OBJ.plate.flat * S;
    }
    if (m && (type === 'glass' || type === 'cup')) {
      // See-through, so you can watch what's inside.
      m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.38; o.material.depthWrite = false; o.renderOrder = 3; } });
    }
    if (m && CUPS.has(type)) {
      // Liquid inside the cup, shown when it's filled.
      const bb = new THREE.Box3().setFromObject(m), d = bb.getSize(new THREE.Vector3());
      const rad = Math.min(d.x, d.z) * 0.4, ht = d.y * (type === 'bowl' ? 0.82 : 0.9);
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.92, 1, 24), std({ color: '#5BB8F5', transparent: true, opacity: 0.88, roughness: 0.15 }));
      liq.geometry.translate(0, 0.5, 0);
      liq.position.y = bb.min.y + d.y * 0.08; liq.userData.full = ht; liq.visible = false; liq.name = 'fill';
      m.add(liq);
    }
    if (m) {
      if (COOK_COLORS[type] || type === 'mint' || type === 'icecream') m.children[0].traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.userData.base = o.material.color.clone(); } });
      return m;
    }
  }
  const g = new THREE.Group();
  const add = (m, x, y, z) => { m.position.set(x || 0, y || 0, z || 0); g.add(m); return m; };
  switch (type) {
    case 'raisin': {
      const geo = new THREE.SphereGeometry(r, 14, 10), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 1 + 0.18 * Math.sin(p.getX(i) * 90) * Math.cos(p.getZ(i) * 70 + p.getY(i) * 40); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); }
      geo.computeVertexNormals();
      add(mesh(geo, std({ color: '#4A2338', roughness: 0.6 })));
      return g;
    }
    case 'tablet': add(mesh(new THREE.CylinderGeometry(r, r, r * 0.45, 28), std({ color: '#F7F8FA', roughness: 0.9 }))); return g;
    case 'stick': {
      const st = add(mesh(new THREE.CylinderGeometry(r * 0.09, r * 0.09, r * 2.2, 10), std({ color: '#D9B27C', roughness: 0.8 })));
      st.rotation.z = Math.PI / 2;
      // Crystals that grow along it (shown as it grows)
      const cg = new THREE.Group(); cg.name = 'crystals';
      for (let i = 0; i < 26; i++) {
        const c = mesh(new THREE.OctahedronGeometry(r * (0.16 + 0.12 * hash(i, 3)), 0), std({ color: '#F4FBFF', transparent: true, opacity: 0.85, roughness: 0.05, metalness: 0.1 }));
        c.position.set((hash(i, 1) - 0.5) * r * 1.9, (hash(i, 2) - 0.5) * r * 0.45, (hash(i, 4) - 0.5) * r * 0.45);
        c.rotation.set(hash(i, 5) * 3, hash(i, 6) * 3, 0); cg.add(c);
      }
      cg.scale.setScalar(0.001); g.add(cg);
      return g;
    }
    case 'paper': {
      // A card with a hidden picture that browns in when it's warmed.
      const c = document.createElement('canvas'); c.width = 256; c.height = 170;
      const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
      const card = add(mesh(new THREE.BoxGeometry(r * 2.2, r * 1.5, r * 0.06), [0, 1, 2, 3].map(() => std({ color: '#FFFFFF', roughness: 0.9 })).concat([std({ map: tex, roughness: 0.9 }), std({ color: '#FFFFFF', roughness: 0.9 })])));
      drawPaper(c.getContext('2d'), 0); tex.needsUpdate = true;
      card.userData.paper = { c, tex, shown: -1 };
      card.name = 'card';
      return g;
    }
    case 'masher': {
      const steel = MAT.steel;
      const handle = add(mesh(new THREE.CylinderGeometry(r * 0.09, r * 0.09, r * 1.5, 12), std({ color: '#E4572E', roughness: 0.5 })), -r * 0.35, 0);
      handle.rotation.z = Math.PI / 2;
      const neck = add(mesh(new THREE.CylinderGeometry(r * 0.05, r * 0.05, r * 0.5, 8), steel), r * 0.6, 0); neck.rotation.z = Math.PI / 2;
      // the zigzag masher head
      const pts = []; for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(0, (i % 2 ? 1 : -1) * r * 0.22, (i / 8 - 0.5) * r * 0.9));
      const head = add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, r * 0.045, 8), steel), r * 0.88, 0);
      return g;
    }
    case 'duck': {
      add(mesh(new THREE.SphereGeometry(r * 0.85, 24, 16), MAT.yellow), -r * 0.1, -r * 0.15).scale.set(1.15, 0.8, 0.9);
      add(mesh(new THREE.SphereGeometry(r * 0.48, 20, 14), MAT.yellow), r * 0.42, r * 0.45);
      const beak = add(mesh(new THREE.ConeGeometry(r * 0.2, r * 0.45, 12), MAT.orange), r * 0.95, r * 0.38);
      beak.rotation.z = -Math.PI / 2; beak.scale.set(1, 1, 0.6);
      [-1, 1].forEach(s => add(mesh(new THREE.SphereGeometry(r * 0.07, 10, 8), MAT.ink), r * 0.62, r * 0.6, s * r * 0.3));
      add(mesh(new THREE.SphereGeometry(r * 0.4, 16, 12), std({ color: '#FFB52E' })), -r * 0.15, -r * 0.05, r * 0.55).scale.set(1.1, 0.6, 0.35);
      add(mesh(new THREE.ConeGeometry(r * 0.22, r * 0.4, 10), MAT.yellow), -r * 1.05, r * 0.1).rotation.z = Math.PI / 2.6;
      break;
    }
    case 'rock': {
      const geo = new THREE.IcosahedronGeometry(r, 2), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        v.multiplyScalar(0.82 + 0.3 * fbm(v.x * 6 + 3, v.y * 6 + v.z * 4, 3));
        p.setXYZ(i, v.x, v.y * 0.85, v.z);
      }
      geo.computeVertexNormals();
      add(mesh(geo, MAT.rock));
      break;
    }
    case 'coin':
      add(mesh(new THREE.CylinderGeometry(r, r, r * 0.25, 32), MAT.gold)).rotation.x = Math.PI / 2;
      add(mesh(new THREE.TorusGeometry(r * 0.7, r * 0.06, 8, 32), MAT.gold), 0, 0, r * 0.13);
      break;
    case 'ice': add(mesh(new THREE.BoxGeometry(r * 1.6, r * 1.6, r * 1.6), MAT.ice)).rotation.set(0.15, 0.4, 0.1); break;
    case 'sponge':
      add(mesh(new THREE.BoxGeometry(r * 2, r * 1.0, r * 1.3), MAT.sponge.clone()), 0, -r * 0.15);
      add(mesh(new THREE.BoxGeometry(r * 2, r * 0.32, r * 1.3), std({ color: '#3E9C4B', roughness: 0.95 })), 0, r * 0.5);
      break;
    case 'magnet':
      add(mesh(new THREE.TorusGeometry(r * 0.62, r * 0.28, 14, 28, Math.PI), MAT.red), 0, -r * 0.1);
      [-1, 1].forEach(sx => {
        add(mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.28, r * 0.5, 16), MAT.red), sx * r * 0.62, -r * 0.35);
        add(mesh(new THREE.CylinderGeometry(r * 0.29, r * 0.29, r * 0.35, 16), MAT.steel), sx * r * 0.62, -r * 0.75);
      });
      break;
    case 'butter': add(mesh(new THREE.BoxGeometry(r * 2, r * 1.1, r * 1.1), MAT.butter)); break;
    case 'mallow': add(mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, r * 1.8, 24), MAT.mallow.clone())); break;
    case 'kernel': add(mesh(new THREE.SphereGeometry(r, 14, 10), MAT.kernel)).scale.set(0.8, 1.1, 0.7); break;
    case 'popcorn':
      [[-0.4, -0.2, 0.2, 0.5], [0.4, -0.3, -0.1, 0.48], [0, 0.35, 0, 0.52], [-0.3, 0.3, -0.3, 0.4], [0.3, 0.25, 0.3, 0.42], [0, -0.1, 0.4, 0.45]]
        .forEach(([x, y, z, s]) => add(mesh(new THREE.SphereGeometry(r * s, 12, 10), MAT.popcorn), x * r, y * r, z * r));
      break;
    case 'friedegg': case 'rawegg': {
      const geo = new THREE.CylinderGeometry(r, r, r * 0.15, 28, 1), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 0.82 + 0.18 * Math.sin(a * 3) * Math.cos(a * 2); p.setX(i, x * k); p.setZ(i, z * k); }
      geo.computeVertexNormals();
      add(mesh(geo, type === 'rawegg' ? MAT.eggWhite : MAT.white)).rotation.x = 0.35;
      add(mesh(new THREE.SphereGeometry(r * 0.35, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.yolk), r * 0.05, r * 0.08, r * 0.1).rotation.x = 0.35;
      break;
    }
    default: add(mesh(new THREE.SphereGeometry(r, 16, 12), MAT.white));
  }
  return g;
}

const KIT_CONTAINERS = { oil: 'food-bottle-oil', honey: 'food-honey', milk: 'food-carton', salt: 'food-shaker-salt', pepper: 'food-shaker-pepper', cola: 'food-soda-can' };
function makeContainerModel(type) {
  if (LAB === 'chem') return makeLabContainer(type);
  if (KIT_CONTAINERS[type]) { const m = fitted(KIT_CONTAINERS[type], type === 'cola' ? 0.62 : 0.74); if (m) return m; }
  const g = new THREE.Group();
  const add = (m, x, y, z) => { m.position.set(x || 0, y || 0, z || 0); g.add(m); return m; };
  const clear = (col, op) => std({ color: col, transparent: true, opacity: op || 0.5, roughness: 0.08 });
  switch (type) {
    case 'peroxide':   // the familiar brown bottle
      add(mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.5, 24), std({ color: '#5A3A22', roughness: 0.35 })), 0, -0.05);
      add(mesh(new THREE.CylinderGeometry(0.08, 0.15, 0.12, 20), std({ color: '#5A3A22', roughness: 0.35 })), 0, 0.26);
      add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 16), MAT.white), 0, 0.36);
      add(mesh(new THREE.CylinderGeometry(0.182, 0.182, 0.2, 24, 1, true), std({ map: TEX.label('#FFFFFF') })), 0, -0.04);
      break;
    case 'glue':       // white glue bottle with an orange tip
      add(mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.48, 24), std({ color: '#FBFBF7', roughness: 0.5 })), 0, -0.06);
      add(mesh(new THREE.ConeGeometry(0.12, 0.2, 20), std({ color: '#F28C28', roughness: 0.4 })), 0, 0.28);
      add(mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.18, 24, 1, true), std({ map: TEX.label('#F28C28') })), 0, -0.06);
      break;
    case 'activator':  // contact-lens solution: tall white bottle, teal cap
      add(mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.56, 24), std({ color: '#F2F8FA', roughness: 0.4 })), 0, -0.04);
      add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 18), std({ color: '#2BB3A3', roughness: 0.4 })), 0, 0.3);
      add(mesh(new THREE.CylinderGeometry(0.162, 0.162, 0.2, 24, 1, true), std({ map: TEX.label('#2BB3A3') })), 0, -0.04);
      break;
    case 'cabbagejuice':   // a jar of purple juice
      add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.46, 24), clear('#F4FAFF', 0.35)), 0, -0.08);
      add(mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.38, 24), std({ color: '#6A3FA0', transparent: true, opacity: 0.9, roughness: 0.1 })), 0, -0.11);
      add(mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.07, 24), MAT.red), 0, 0.18);
      break;
    case 'fizzwater':  // green seltzer bottle
      add(mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.46, 24), std({ color: '#7FD3A8', transparent: true, opacity: 0.7, roughness: 0.08 })), 0, -0.08);
      add(mesh(new THREE.CylinderGeometry(0.07, 0.15, 0.18, 20), std({ color: '#7FD3A8', transparent: true, opacity: 0.7, roughness: 0.08 })), 0, 0.24);
      add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 16), std({ color: '#2F6FD0', roughness: 0.4 })), 0, 0.36);
      break;
    case 'starch':     // cornstarch box
      add(mesh(new THREE.BoxGeometry(0.34, 0.5, 0.18), std({ color: '#F2D16B', roughness: 0.7 })), 0, -0.04);
      add(mesh(new THREE.BoxGeometry(0.22, 0.2, 0.185), MAT.white), 0, -0.02);
      break;
    case 'yeast':      // a yeast packet
      add(mesh(new THREE.BoxGeometry(0.3, 0.36, 0.05), std({ color: '#D63B2F', roughness: 0.6 })), 0, -0.1);
      add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.055), std({ color: '#F6E7B8', roughness: 0.6 })), 0, -0.08);
      break;
    case 'lemon':      // lemon-shaped squeeze bottle
      add(mesh(new THREE.SphereGeometry(0.2, 24, 16), std({ color: '#F7D531', roughness: 0.5 })), 0, -0.1).scale.set(1, 1.25, 1);
      add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 14), std({ color: '#3FAE49', roughness: 0.5 })), 0, 0.2);
      break;
    case 'water': {
      add(mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.62, 24), clear('#CDEBFF', 0.45)), 0, -0.02);
      add(mesh(new THREE.CylinderGeometry(0.235, 0.255, 0.4, 24), std({ color: '#5BB8F5', transparent: true, opacity: 0.8, roughness: 0.1 })), 0, -0.12);
      add(mesh(new THREE.TorusGeometry(0.15, 0.04, 10, 20, Math.PI), clear('#CDEBFF', 0.8)), 0.25, 0.02).rotation.z = -Math.PI / 2;
      add(mesh(new THREE.ConeGeometry(0.08, 0.2, 14, 1, true), clear('#CDEBFF', 0.7)), -0.27, 0.3).rotation.z = Math.PI / 3;
      break;
    }
    case 'vinegar':
      add(mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.5, 24), clear('#F0F6FA', 0.55)), 0, -0.05);
      add(mesh(new THREE.CylinderGeometry(0.07, 0.15, 0.16, 20), clear('#F0F6FA', 0.55)), 0, 0.28);
      add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 16), MAT.red), 0, 0.4);
      add(mesh(new THREE.CylinderGeometry(0.182, 0.182, 0.18, 24, 1, true), std({ map: TEX.label('#B44CC9') })), 0, -0.06);
      break;
    case 'soap':
      add(mesh(new THREE.CapsuleGeometry(0.17, 0.32, 8, 20), std({ color: '#7DDB8A', transparent: true, opacity: 0.85, roughness: 0.1 })), 0, -0.05);
      add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 12), MAT.white), 0, 0.33);
      add(mesh(new THREE.BoxGeometry(0.18, 0.05, 0.08), MAT.white), -0.06, 0.42);
      break;
    case 'sugar':
      add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 24), clear('#F4FAFF', 0.35)), 0, -0.06);
      for (let i = 0; i < 6; i++) add(mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), MAT.white), (i % 3 - 1) * 0.11, -0.24 + Math.floor(i / 3) * 0.11, (i % 2) * 0.06).rotation.y = i;
      add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 24), MAT.red), 0, 0.24);
      break;
    case 'soda': add(mesh(new THREE.BoxGeometry(0.42, 0.56, 0.22), std({ map: TEX.label('#8FC9FF'), roughness: 0.7 }))); break;
    case 'sand':
      add(mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.46, 24), MAT.red), 0, -0.08);
      add(mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.06, 24), MAT.sand), 0, 0.13);
      add(mesh(new THREE.TorusGeometry(0.27, 0.02, 8, 24, Math.PI), MAT.steelDark), 0, 0.14);
      break;
    case 'flour': {
      const pts = [[0, -0.32], [0.24, -0.3], [0.28, -0.1], [0.26, 0.1], [0.18, 0.24], [0.08, 0.3], [0.12, 0.38], [0, 0.4]].map(([x, y]) => new THREE.Vector2(x, y));
      add(mesh(new THREE.LatheGeometry(pts, 24), std({ map: TEX.flour, color: '#EAD3AE', roughness: 0.95 })));
      break;
    }
    case 'red': case 'yellow': case 'blue': {
      const col = { red: '#E63946', yellow: '#FFD100', blue: '#1E78FF' }[type];
      add(mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.34, 20), std({ color: col, transparent: true, opacity: 0.9, roughness: 0.1 })), 0, -0.14);
      add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 14), MAT.white), 0, 0.12);
      add(mesh(new THREE.ConeGeometry(0.05, 0.16, 12), MAT.white), 0, 0.28);
      break;
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// First-person hands (rigged WebXR generic hand, MIT)
// ---------------------------------------------------------------------------
const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

class Hand {
  constructor(gltf, side) {
    this.side = side;                     // -1 left, +1 right
    this.root = new THREE.Group();
    this.model = gltf.scene;
    this.root.add(this.model);
    this.bones = {};
    this.model.traverse(o => {
      if (o.isBone || o.type === 'Bone' || (o.name && o.name.includes('-'))) this.bones[o.name] = o;
      if (o.isSkinnedMesh || o.isMesh) { this.skin = o; o.material = MAT.skin.clone(); o.castShadow = true; o.frustumCulled = false; }
    });
    this.model.updateMatrixWorld(true);
    const P = n => this.bones[n].getWorldPosition(new THREE.Vector3());
    const wrist = P('wrist'), midTip = P('middle-finger-tip');
    const iProx = P('index-finger-phalanx-proximal'), pProx = P('pinky-finger-phalanx-proximal'), mProx = P('middle-finger-phalanx-proximal');
    const F = midTip.clone().sub(wrist).normalize();
    let N = new THREE.Vector3().crossVectors(F, pProx.clone().sub(iProx)).normalize();
    // Palm side is the side the thumb sits toward.
    if (N.dot(P('thumb-tip').sub(mProx)) < 0) N.negate();
    N.sub(F.clone().multiplyScalar(N.dot(F))).normalize();
    this.F = F; this.N = N;
    this.modelBasis = new THREE.Matrix4().makeBasis(F, N, new THREE.Vector3().crossVectors(F, N));
    this.palm = wrist.clone().add(mProx).add(iProx).add(pProx).multiplyScalar(0.25).add(N.clone().multiplyScalar(0.012));
    this.tipOffset = midTip.clone();
    this.scale = HAND_LEN / midTip.distanceTo(wrist);
    this.root.scale.setScalar(this.scale);

    // This rig's joints are all direct children of the armature (WebXR reports each
    // joint independently), so curling is done here: each knuckle rotates the rest of
    // its finger about its own pivot, all in armature space.
    const Lp = n => this.bones[n].position.clone();
    const Fl = Lp('middle-finger-tip').sub(Lp('wrist')).normalize();
    let Nl = new THREE.Vector3().crossVectors(Fl, Lp('pinky-finger-phalanx-proximal').sub(Lp('index-finger-phalanx-proximal'))).normalize();
    if (Nl.dot(Lp('thumb-tip').sub(Lp('middle-finger-phalanx-proximal'))) < 0) Nl.negate();
    Nl.sub(Fl.clone().multiplyScalar(Nl.dot(Fl))).normalize();
    this.chains = [];
    const chain = (names, weights, thumb) => {
      const bones = names.map(n => this.bones[n]);
      if (bones.some(b => !b)) return;
      const restPos = bones.map(b => b.position.clone()), restQuat = bones.map(b => b.quaternion.clone());
      const axes = restPos.slice(0, -1).map((p, i) => new THREE.Vector3().crossVectors(restPos[i + 1].clone().sub(p).normalize(), Nl).normalize());
      this.chains.push({ bones, restPos, restQuat, axes, weights, thumb });
    };
    for (const f of FINGERS) chain([`${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`], [0.85, 1.1, 0.75]);
    chain(['thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'], [0.6, 0.8], true);
    this.Nl = Nl;

    this.curl = 0.15; this.curlTarget = 0.15; this.thumbCurl = 0.1;
    this.pos = new THREE.Vector3(side * 6, -8, 4); this.quat = new THREE.Quaternion();
    this.visible = 0; this.flinch = 0; this.coat = [242, 180, 142]; this.coatAmt = 0;
    this.holdId = null; this.mode = 'idle';

    // Forearm in a striped sleeve, reaching in from below the screen.
    this.arm = mesh(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true), MAT.sleeve);
    this.cuff = mesh(new THREE.TorusGeometry(1, 0.22, 10, 24), MAT.cuff);
    this.forearm = mesh(new THREE.CylinderGeometry(1, 1, 1, 16), this.skin.material);
    this.root.visible = this.arm.visible = this.cuff.visible = this.forearm.visible = false;   // hidden until first placed
    scene.add(this.root, this.arm, this.cuff, this.forearm);
  }

  setCurl(c, thumb) {
    const R = new THREE.Quaternion(), acc = new THREE.Quaternion(), ax = new THREE.Vector3(), d = new THREE.Vector3();
    for (const ch of this.chains) {
      const pos = ch.restPos.map(p => p.clone()), quat = ch.restQuat.map(q => q.clone());
      acc.identity();
      for (let i = 0; i < ch.axes.length; i++) {
        const angle = (ch.thumb ? thumb : c) * ch.weights[i];
        R.setFromAxisAngle(ax.copy(ch.axes[i]).applyQuaternion(acc), angle);
        const pivot = pos[i].clone();
        for (let j = i; j < pos.length; j++) {
          if (j > i) { d.copy(pos[j]).sub(pivot).applyQuaternion(R); pos[j].copy(pivot).add(d); }
          quat[j].premultiply(R);
        }
        acc.premultiply(R);
      }
      ch.bones.forEach((b, j) => { b.position.copy(pos[j]); b.quaternion.copy(quat[j]); });
    }
  }

  // World orientation from a finger direction and a palm-facing direction.
  orient(fingerDir, palmDir) {
    const F = fingerDir.clone().normalize();
    const N = palmDir.clone().sub(F.clone().multiplyScalar(palmDir.dot(F))).normalize();
    const target = new THREE.Matrix4().makeBasis(F, N, new THREE.Vector3().crossVectors(F, N));
    const R = target.multiply(_m.copy(this.modelBasis).transpose());
    return new THREE.Quaternion().setFromRotationMatrix(R);
  }

  update(dt, goal) {
    // goal: { mode, point (world), tilt, itemR }
    let targetPos, targetQuat;
    if (goal && goal.mode !== 'idle') {
      if (goal.mode === 'grip') {
        // Hold from in front: back of the hand toward the viewer, fingers wrapped over.
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), goal.tilt || 0);
        const f = new THREE.Vector3(0.12 * this.side, 1, -0.3).applyQuaternion(tilt);
        const n = new THREE.Vector3(0, -0.15, -1).applyQuaternion(tilt);
        targetQuat = this.orient(f, n);
        const palmW = this.palm.clone().multiplyScalar(this.scale).applyQuaternion(targetQuat);
        targetPos = goal.point.clone().add(new THREE.Vector3(0, -goal.itemR * 0.35, goal.itemR + 0.12)).sub(palmW);
        this.curlTarget = 1.05; this.thumbCurl = 0.55;
      } else {
        // Stirring: palm down, fingers reaching into the pot.
        targetQuat = this.orient(new THREE.Vector3(0.1 * this.side, -0.75, -1), new THREE.Vector3(0, -1, 0.4));
        const tipW = this.tipOffset.clone().multiplyScalar(this.scale).applyQuaternion(targetQuat);
        targetPos = goal.point.clone().add(new THREE.Vector3(0, 0, 0.35)).sub(tipW);
        const wiggle = goal.moving ? 0.1 * Math.sin(time * 14) : 0;
        this.curlTarget = 0.28 + wiggle; this.thumbCurl = 0.15;
      }
      this.visible = Math.min(1, this.visible + dt * 6);
    } else {
      targetQuat = this.orient(new THREE.Vector3(0.2 * this.side, 1, -0.4), new THREE.Vector3(0, 0, -1));
      targetPos = camera.position.clone().add(new THREE.Vector3(this.side * 2.6, -5.5, -4));
      this.curlTarget = 0.2; this.thumbCurl = 0.1;
      this.visible = Math.max(0, this.visible - dt * 3);
    }
    if (this.flinch > 0) {
      this.flinch -= dt;
      targetPos = targetPos.clone().add(new THREE.Vector3(Math.sin(time * 60) * 0.12, 1.4 * this.flinch, 1.5 * this.flinch));
    }
    const k = Math.min(1, dt * (goal && goal.mode !== 'idle' ? 18 : 5));
    this.pos.lerp(targetPos, k);
    this.quat.slerp(targetQuat, k);
    this.root.position.copy(this.pos);
    this.root.quaternion.copy(this.quat);
    this.curl = lerp(this.curl, this.curlTarget, Math.min(1, dt * 12));
    this.setCurl(this.curl, this.thumbCurl);

    // Coated in whatever the hand touched; it wears off.
    this.coatAmt = Math.max(0, this.coatAmt - dt * 0.05);
    const c = lerp3([242, 180, 142], this.coat, this.coatAmt * 0.75);
    this.skin.material.color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255).convertSRGBToLinear();

    // Arm from the wrist to a shoulder below and to the side of the camera.
    this.root.updateMatrixWorld(true);
    const wrist = this.bones['wrist'].getWorldPosition(_v);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const fwd = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).negate();
    const shoulder = camera.position.clone().add(right.multiplyScalar(this.side * 1.9)).add(up.multiplyScalar(-2.4)).add(fwd.multiplyScalar(0.6));
    const dir = _v2.copy(shoulder).sub(wrist), len = dir.length();
    const placeLimb = (m, from, along, length, radius) => {
      m.position.copy(from).add(along.clone().multiplyScalar(length / 2));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
      m.scale.set(radius, length, radius);
    };
    const along = dir.normalize();
    const wristR = 0.17 * HAND_LEN / 1.45;
    placeLimb(this.forearm, wrist, along, 0.5, wristR);
    const sleeveStart = wrist.clone().add(along.clone().multiplyScalar(0.45));
    placeLimb(this.arm, sleeveStart, along, Math.max(0.1, len - 0.45), wristR * 1.55);
    this.cuff.position.copy(sleeveStart); this.cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along); this.cuff.scale.setScalar(wristR * 1.55);
    const show = this.visible > 0.01;
    this.root.visible = this.arm.visible = this.cuff.visible = this.forearm.visible = show;
  }
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const view3 = { bodyMeshes: new Map(), pourerMeshes: new Map(), spawners: [], storage: [], layers: {}, trayVersion: 0 };
const env = {};
let flames, flameLight, coldLight, frostCloud, thermoFill;
let dropMesh, steamMesh, puddleMesh, cloudMesh, spotMesh;
const MAX_DROPS = 2200;
const hands = [];



// ---------------------------------------------------------------------------
// Name labels
// ---------------------------------------------------------------------------
const labelTex = new Map();
function labelSprite(text, h, sub) {
  if (sub) return labelSprite2(text, sub, h);
  let entry = labelTex.get(text);
  if (!entry) {
    const c = document.createElement('canvas'), fs = 44, pad = 18;
    const g = c.getContext('2d');
    g.font = `800 ${fs}px system-ui, sans-serif`;
    const m = g.measureText ? g.measureText(text) : null;
    const w = Math.ceil((m && m.width) || text.length * fs * 0.55) + pad * 2;
    c.width = w; c.height = fs + pad;
    g.font = `800 ${fs}px system-ui, sans-serif`;
    g.fillStyle = 'rgba(255,252,245,0.95)'; g.strokeStyle = '#2B2140'; g.lineWidth = 4;
    const r = c.height / 2;
    g.beginPath(); g.moveTo(r, 2); g.lineTo(w - r, 2); g.arc(w - r, r, r - 2, -Math.PI / 2, Math.PI / 2); g.lineTo(r, c.height - 2); g.arc(r, r, r - 2, Math.PI / 2, Math.PI * 1.5); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = '#2B2140'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    entry = { tex, aspect: w / c.height };
    labelTex.set(text, entry);
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: entry.tex, depthTest: false, transparent: true }));
  sp.scale.set((h || 0.32) * entry.aspect, h || 0.32, 1);
  sp.renderOrder = 11;
  return sp;
}
// A two-line tag: the name, and its formula underneath in smaller type.
function labelSprite2(text, sub, h) {
  const key = text + '|' + sub;
  let entry = labelTex.get(key);
  if (!entry) {
    const c = document.createElement('canvas'), fs = 44, fs2 = 30, pad = 18;
    const g = c.getContext('2d');
    const mw = (f, t) => { g.font = f; const m = g.measureText ? g.measureText(t) : null; return (m && m.width) || t.length * 24; };
    const w = Math.ceil(Math.max(mw(`800 ${fs}px system-ui, sans-serif`, text), mw(`600 ${fs2}px system-ui, sans-serif`, sub))) + pad * 2;
    c.width = w; c.height = fs + fs2 + pad + 8;
    const r = 22;
    g.fillStyle = 'rgba(255,252,245,0.95)'; g.strokeStyle = '#2B2140'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(r, 2); g.lineTo(w - r, 2); g.arcTo(w - 2, 2, w - 2, r, r - 2); g.lineTo(w - 2, c.height - r); g.arcTo(w - 2, c.height - 2, w - r, c.height - 2, r - 2);
    g.lineTo(r, c.height - 2); g.arcTo(2, c.height - 2, 2, c.height - r, r - 2); g.lineTo(2, r); g.arcTo(2, 2, r, 2, r - 2); g.closePath(); g.fill(); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#2B2140'; g.font = `800 ${fs}px system-ui, sans-serif`; g.fillText(text, w / 2, pad / 2 + fs / 2 + 4);
    g.fillStyle = '#5B6B84'; g.font = `600 ${fs2}px system-ui, sans-serif`; g.fillText(sub, w / 2, pad / 2 + fs + fs2 / 2 + 6);
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    entry = { tex, aspect: w / c.height, tall: c.height / (fs + pad) };
    labelTex.set(key, entry);
  }
  const hh = (h || 0.32) * entry.tall;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: entry.tex, depthTest: false, transparent: true }));
  sp.scale.set(hh * entry.aspect, hh, 1); sp.renderOrder = 11;
  return sp;
}
// A name tag floats above whatever she's holding, and lingers a moment after she lets go.
const heldLabels = new Map();
function syncLabels() {
  const want = new Map();
  for (const b of bodies) {
    const recent = b.held || (b.releasedAt != null && time - b.releasedAt < 1.6);
    if (!recent) continue;
    const m = view3.bodyMeshes.get(b.id);
    if (m && !m.visible) continue;
    want.set('b' + b.id, { text: bodyName(b), x: X3(b.x), y: Y3(b.y - b.r) + 0.32, z: 0.9 });
  }
  for (const p of pourers) if (!p.returning) want.set('p' + p.type, { text: nameOf('sub', p.type), x: X3(p.x), y: Y3(p.y - 70) + 0.25, z: 0.9 });
  for (const [k, sp] of heldLabels) if (!want.has(k)) { scene.remove(sp); heldLabels.delete(k); }
  for (const [k, w] of want) {
    let sp = heldLabels.get(k);
    if (!sp || sp.userData.text !== w.text) { if (sp) scene.remove(sp); sp = labelSprite(w.text, 0.3); sp.userData.text = w.text; scene.add(sp); heldLabels.set(k, sp); }
    sp.position.set(w.x, w.y, w.z);
  }
}

// A green check mark shown on storage items that are already on the counter.
let checkTex = null;
function checkSprite() {
  if (!checkTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#3BB273'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#FFFFFF'; g.stroke();
    g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(18, 33); g.lineTo(28, 43); g.lineTo(46, 22); g.stroke();
    checkTex = new THREE.CanvasTexture(c);
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: checkTex, depthTest: false }));
  sp.scale.set(0.34, 0.34, 1); sp.renderOrder = 10; sp.visible = false;
  return sp;
}

// ---------------------------------------------------------------------------
// Storage areas, each in its own spot in the world with its own camera.
// ---------------------------------------------------------------------------
const AREA_X = { fridge: 60, pantry: 120, cabinets: 180 };
const AREA_CAM_Y = 0.5;
const SHOW = 1.5;            // things on display in storage are shown larger, for small eyes and fingers
const SHELF_FRONT_Z = 0.5;   // and at the front of the shelf, so a shelf's edge never hides them
function placeItem(group, area, kind, type, x, shelfTop, z, drop) {
  z = SHELF_FRONT_Z;
  const m = kind === 'sub' ? makeContainerModel(type) : makeObjectModel(type);
  m.scale.multiplyScalar(SHOW * (kind === 'obj' && OBJ[type].r < 16 ? 1.7 : 1));
  const y = kind === 'sub' ? shelfTop + 0.43 * SHOW : shelfTop + OBJ[type].r * S * SHOW;
  m.position.set(x, y, z);
  if (kind === 'obj') m.rotation.y = hash(x, shelfTop) * 1.2 - 0.6;
  // Long flat tools lie flat and look like thin lines from the front: stand them up on a slant.
  // (The kit's tools are long along x and lie flat: turn the broad side to face her, then slant.)
  if (['knife', 'spoon', 'whisk', 'masher', 'fork', 'teaspoon'].includes(type)) {
    m.rotation.set(['whisk', 'masher'].includes(type) ? 0 : Math.PI / 2, 0, 0.5, 'ZXY');
    m.scale.multiplyScalar(1.35);
    m.position.y += 0.4;
  }
  group.add(m);
  const check = checkSprite(); check.position.set(x + 0.45, y + 0.6, z + 0.4); group.add(check);
  const pos = new THREE.Vector3(x + group.position.x, y, z);
  const formula = LAB === 'chem' && kind === 'sub' && FORMULA[type] && !['Dye', 'Soap', 'Milk', 'Cola', 'Oil', 'Honey', 'Yeast'].includes(FORMULA[type]) ? FORMULA[type] : null;
  const label = labelSprite(nameOf(kind, type), 0.34, formula);
  label.position.set(x, shelfTop - 0.24 - (drop || 0), z + 0.8); group.add(label);
  view3.storage.push({ slot: { kind, type, area }, model: m, pos, check, label, bounce: 0, baseScale: m.scale.clone() });
}
function row(group, area, kind, list, y, z, width) {
  const sp = Math.min(2.15, width / Math.max(1, list.length));
  // Stagger the name tags up and down when neighbours' names would bump into each other.
  const widest = Math.max(...list.map(t => nameOf(kind, t).length)) * 0.115 + 0.25;
  const stagger = widest > sp - 0.08;
  list.forEach((t, i) => placeItem(group, area, kind, t, (i - (list.length - 1) / 2) * sp, y, z, stagger && i % 2 ? 0.38 : 0));
}
function box(group, w, h, d, mat, x, y, z) { const m = mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); group.add(m); return m; }

function fillFromBelow(g) { const f = new THREE.PointLight('#FFFFFF', 0.55, 18); f.position.set(0, -3.5, 4.5); g.add(f); }
function buildStorage() {
  // Fridge: freezer on top, glass shelves, a crisper drawer at the bottom, cool light.
  {
    const g = new THREE.Group(); g.position.x = AREA_X.fridge; scene.add(g); env.fridge = g;
    fillFromBelow(g);
    const white = std({ color: '#F3F6FA', roughness: 0.35 }), glassShelf = std({ color: '#CFEFFF', transparent: true, opacity: 0.45, roughness: 0.05 });
    box(g, 13.2, 9.1, 0.3, white, 0, 0.6, -2.2);                    // back (walls fit between top and bottom panels: no shared faces)
    box(g, 0.4, 9.2, 4.6, white, -6.7, 0.6, -0.1); box(g, 0.4, 9.2, 4.6, white, 6.7, 0.6, -0.1);
    box(g, 13.4, 0.4, 4.6, white, 0, 5.4, -0.1); box(g, 13.4, 0.4, 4.6, white, 0, -4.2, -0.1);
    box(g, 13.0, 1.9, 0.25, std({ color: '#DDF4FF', roughness: 0.9 }), 0, 4.15, -2.0);   // frosty freezer back
    box(g, 13.0, 0.12, 3.2, white, 0, 2.95, -0.6);                  // freezer floor
    box(g, 13.0, 0.08, 3.2, glassShelf, 0, 1.0, -0.6);
    box(g, 13.0, 0.08, 3.2, glassShelf, 0, -1.0, -0.6);
    box(g, 12.6, 1.5, 0.08, std({ color: '#E8F8FF', transparent: true, opacity: 0.35, roughness: 0.1 }), 0, -3.2, 1.6);   // crisper front
    const light = new THREE.PointLight('#DDF2FF', 0.9, 14); light.position.set(0, 4.5, 2); g.add(light);
    const F = STORAGE.fridge;
    if (LAB === 'chem') {
      row(g, 'fridge', 'obj', F.freezer, 3.01, -0.4, 6);
      row(g, 'fridge', 'sub', F.subs, 1.04, -0.6, 11);
      row(g, 'fridge', 'obj', F.objs, -0.96, -0.4, 8);
    } else {
    row(g, 'fridge', 'obj', F.freezer, 3.01, -0.4, 6);
    row(g, 'fridge', 'sub', F.subs, 1.04, -0.6, 3); 
    // the bottles take the left of the top shelf; dairy on the right
    view3.storage.filter(s => s.slot.area === 'fridge' && s.slot.kind === 'sub').forEach((s, i) => { const x = -5 + i * 1.8; s.model.position.x = x; s.check.position.x = x + 0.45; s.label.position.x = x; s.label.position.y = 1.04 - 0.24; s.pos.x = AREA_X.fridge + x; });
    ['egg', 'butter', 'cheese'].forEach((t, i) => placeItem(g, 'fridge', 'obj', t, -0.6 + i * 2.0, 1.04, -0.4));
    row(g, 'fridge', 'obj', F.objs.filter(t => !['egg', 'butter', 'cheese', 'carrot', 'cabbage', 'mushroom', 'broccoli'].includes(t)), -0.96, -0.4, 12);
    row(g, 'fridge', 'obj', ['carrot', 'cabbage', 'mushroom', 'broccoli'], -4.0, -0.4, 8);
    }
  }
  // Pantry: wooden shelves, jars up top, bakery and snacks below, warm light.
  {
    const g = new THREE.Group(); g.position.x = AREA_X.pantry; scene.add(g); env.pantry = g;
    fillFromBelow(g);
    const back = LAB === 'chem' ? std({ color: '#DDE3EA', roughness: 0.7 }) : std({ map: TEX.shelf, color: '#E8C9A0', roughness: 0.8 });
    box(g, 13.8, 10, 0.3, back, 0, 0.6, -2.2);
    box(g, 0.4, 10.1, 4.4, MAT.shelf, -7, 0.6, -0.1); box(g, 0.4, 10.1, 4.4, MAT.shelf, 7, 0.6, -0.1);
    const ys = [2.4, 0.3, -1.8, -3.9];
    ys.forEach(y => box(g, 13.6, 0.22, 3.2, MAT.shelf, 0, y - 0.11, -0.6));
    const light = new THREE.PointLight('#FFE2B8', 0.8, 14); light.position.set(0, 4.5, 2.5); g.add(light);
    const P = STORAGE.pantry;
    row(g, 'pantry', 'sub', P.subs.slice(0, 4), ys[0], -0.6, 8);
    row(g, 'pantry', 'sub', P.subs.slice(4), ys[1], -0.6, 8);
    row(g, 'pantry', 'obj', P.objs.slice(0, 6), ys[2], -0.4, 12.8);
    row(g, 'pantry', 'obj', P.objs.slice(6), ys[3], -0.4, 12.8);
  }
  // Cabinets: white cupboard with its doors swung open.
  {
    const g = new THREE.Group(); g.position.x = AREA_X.cabinets; scene.add(g); env.cabinets = g;
    fillFromBelow(g);
    const paint = std({ color: '#F7F2E8', roughness: 0.5 }), inside = std({ color: '#EADFCB', roughness: 0.7 });
    box(g, 11.8, 7.5, 0.3, inside, 0, 0.4, -2.2);
    box(g, 0.4, 7.6, 4.4, paint, -6, 0.4, -0.1); box(g, 0.4, 7.6, 4.4, paint, 6, 0.4, -0.1);
    box(g, 12.4, 0.4, 4.4, paint, 0, 4.4, -0.1); box(g, 12.4, 0.4, 4.4, paint, 0, -3.6, -0.1);
    [2.35, 0.3, -1.65].forEach(y => box(g, 11.6, 0.2, 3.2, paint, 0, y - 0.1, -0.6));
    [-1, 1].forEach(sx => {
      const pivot = new THREE.Group(); pivot.position.set(sx * 6.1, 0.4, 2.1); pivot.rotation.y = sx * 1.25; g.add(pivot);
      const door = box(pivot, 6, 7.8, 0.2, paint, -sx * 3, 0, 0);
      const knob = mesh(new THREE.SphereGeometry(0.16, 12, 10), MAT.steel); knob.position.set(-sx * 5.4, 0, 0.18); pivot.add(knob);
    });
    const light = new THREE.PointLight('#FFF4E0', 0.7, 14); light.position.set(0, 3.6, 2.5); g.add(light);
    const C = STORAGE.cabinets;
    const dishes = ['plate', 'bowl', 'cup', 'glass', 'mug'].filter(t => C.objs.includes(t)), tools = ['knife', 'fork', 'teaspoon', 'spoon', 'whisk', 'masher'].filter(t => C.objs.includes(t));
    row(g, 'cabinets', 'obj', dishes, 2.35, -0.4, 10);
    row(g, 'cabinets', 'sub', C.subs, 0.3, -0.6, 10);
    row(g, 'cabinets', 'obj', tools, -1.65, -0.4, 10.6);
    row(g, 'cabinets', 'obj', C.objs.filter(t => !dishes.includes(t) && !tools.includes(t)), -3.4, -0.4, 10);
  }
}

// Oven: a dark cavity built around the pot, a wire rack under it, heating coils
// that glow with the heat, and a warm light inside.
function buildOven(ctop) {
  const g = new THREE.Group(); g.visible = false; scene.add(g); env.oven = g;
  const enamel = std({ color: '#2E2A3A', roughness: 0.35, metalness: 0.2 }), body = std({ color: '#ECEFF3', roughness: 0.4 });
  const floor = ctop - 0.9, ceil = 3.0;
  box(g, 11, ceil - floor, 0.3, enamel, 0, (ceil + floor) / 2, -3.1);
  box(g, 0.3, ceil - floor, 6.4, enamel, -5.5, (ceil + floor) / 2, 0);
  box(g, 0.3, ceil - floor, 6.4, enamel, 5.5, (ceil + floor) / 2, 0);
  box(g, 11, 0.3, 6.4, enamel, 0, ceil, 0); box(g, 11, 0.3, 6.4, enamel, 0, floor, 0);
  // front frame around the opening, and the control strip on top
  box(g, 14, 1.4, 0.4, body, 0, ceil + 0.85, 3.3); box(g, 14, 1.0, 0.4, body, 0, floor - 0.4, 3.3);
  box(g, 1.6, ceil - floor + 2.4, 0.44, body, -6.3, (ceil + floor) / 2 + 0.2, 3.33); box(g, 1.6, ceil - floor + 2.4, 0.44, body, 6.3, (ceil + floor) / 2 + 0.2, 3.33);
  [-3.5, 3.5].forEach(x => { const k = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 20), MAT.steelDark); k.rotation.x = Math.PI / 2; k.position.set(x, ceil + 0.85, 3.55); g.add(k); });
  // wire rack
  for (let i = -10; i <= 10; i++) { const w = mesh(new THREE.CylinderGeometry(0.03, 0.03, 6, 6), MAT.steel); w.rotation.x = Math.PI / 2; w.position.set(i * 0.5, ctop - 0.05, 0); g.add(w); }
  [-2.8, 2.8].forEach(z => { const w = mesh(new THREE.CylinderGeometry(0.04, 0.04, 10.6, 6), MAT.steel); w.rotation.z = Math.PI / 2; w.position.set(0, ctop - 0.05, z); g.add(w); });
  // heating coils, top and bottom
  const coilMat = std({ color: '#3A3A44', emissive: '#FF5A1F', emissiveIntensity: 0, roughness: 0.5, metalness: 0.4 });
  [ceil - 0.35, floor + 0.3].forEach(y => {
    for (let i = 0; i < 4; i++) { const t = mesh(new THREE.CylinderGeometry(0.07, 0.07, 9, 10), coilMat); t.rotation.z = Math.PI / 2; t.position.set(0, y, -2.2 + i * 1.4); g.add(t); }
  });
  const glow = new THREE.PointLight('#FF9A4D', 0, 12); glow.position.set(0, 0.5, 1); g.add(glow);
  const bulb = new THREE.PointLight('#FFF0D0', 0.5, 10); bulb.position.set(-4, ceil - 0.5, -2); g.add(bulb);
  view3.oven = { coilMat, glow };
}

function buildScene() {
  scene.add(new THREE.HemisphereLight('#E6F6FF', LAB === 'chem' ? '#A9B2BE' : '#C98243', 0.75));
  const key = new THREE.DirectionalLight('#FFF1DC', 1.35);
  key.position.set(-6, 9, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 7, bottom: -6, near: 1, far: 30 });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.03;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#BFE4FF', 0.35); rim.position.set(6, 4, -3); scene.add(rim);

  env.counter = new THREE.Group(); scene.add(env.counter);
  const wall = mesh(new THREE.PlaneGeometry(44, 22), MAT.tile, false);
  wall.position.set(0, 2, WALL_Z); wall.receiveShadow = true; env.counter.add(wall);
  const ctop = Y3(COUNTER);
  const counter = mesh(new THREE.BoxGeometry(44, 3, FRONT_Z - WALL_Z + 0.44), MAT.counter);
  counter.position.set(0, ctop - 1.5, (FRONT_Z + WALL_Z) / 2 + 0.18); env.counter.add(counter);   // back sinks a little into the wall
  const lip = mesh(new THREE.BoxGeometry(43.9, 0.12, 0.12), MAT.shelf); lip.position.set(0, ctop - 0.075, FRONT_Z + 0.38); env.counter.add(lip);   // top just under the counter's

  for (const row of SHELF_ROWS) {
    const top = Y3(row.y + 43);
    const shelf = mesh(new THREE.BoxGeometry(15.4, 0.24, 1.04 - WALL_Z), MAT.shelf);
    shelf.position.set(0, top - 0.12, (1.0 + WALL_Z) / 2 - 0.02); env.counter.add(shelf);   // back sinks a little into the wall

    row.top = top;
  }
  // Kitchen pieces at the edges of the view.
  const decor = (key, size, x, y, z, ry) => { const m = fitted(key, size); if (m) { m.position.set(x, y, z); m.rotation.y = ry || 0; env.counter.add(m); } return m; };
  // Toaster station beside the pot: sized to its spot on the counter, with a glowing slot when it's on.
  {
    const w = (TOASTER.x1 - TOASTER.x0) * S, h = (COUNTER - TOASTER.top) * S, cx = X3((TOASTER.x0 + TOASTER.x1) / 2);
    const t = fitted('furn-toaster', 1);
    const grp = new THREE.Group(); grp.position.set(cx, ctop, 0); env.counter.add(grp);
    if (t) {
      const bb = new THREE.Box3().setFromObject(t), d = bb.getSize(new THREE.Vector3());
      t.scale.set(w / d.x, h / d.y, Math.min(1.1, w * 0.7) / d.z); t.position.y = h / 2; grp.add(t);
    } else { const bx = mesh(new THREE.BoxGeometry(w, h, 0.8), std({ color: '#D8DDE6', metalness: 0.5, roughness: 0.3 })); bx.position.y = h / 2; grp.add(bx); }
    const slotGlow = mesh(new THREE.BoxGeometry(0.5, 0.04, 0.16), std({ color: '#3A2A20', emissive: '#FF6A1F', emissiveIntensity: 0 }), false);
    slotGlow.position.set(X3(TOASTER.slot) - cx, h + 0.01, 0); grp.add(slotGlow);
    const glowLight = new THREE.PointLight('#FF8A3D', 0, 3); glowLight.position.set(X3(TOASTER.slot) - cx, h + 0.3, 0.3); grp.add(glowLight);
    view3.toaster = { grp, slotGlow, glowLight };
    grp.visible = LAB !== 'chem';
  }
  if (LAB === 'chem') {
    buildLabBench(ctop);
  } else {
  const coffee = decor('furn-kitchencoffeemachine', 2.4, 7.9, 0, -1.7, -0.3); if (coffee) coffee.position.y = ctop + 1.1;
  const p1 = decor('furn-plantsmall1', 0.9, -6.6, 0, -0.3); if (p1) p1.position.y = SHELF_ROWS[0].top + 0.45;
  const p2 = decor('furn-plantsmall2', 0.9, 6.6, 0, -0.3); if (p2) p2.position.y = SHELF_ROWS[0].top + 0.45;

  const stoveTop = mesh(new THREE.BoxGeometry(5.6, 0.14, 4.2), MAT.grate); stoveTop.position.set(0, ctop + 0.02, -0.2); env.counter.add(stoveTop);
  [1.0, 1.7].forEach(rr => { const ring = mesh(new THREE.TorusGeometry(rr, 0.05, 8, 40), MAT.steelDark); ring.rotation.x = Math.PI / 2; ring.position.set(0, ctop + 0.12, 0); env.counter.add(ring); });
  }

  // Glass pot.
  const r0 = (POT.x1 - POT.x0) / 2 * S, rOut = r0 + POT.wall * S;
  const yTop = Y3(POT.rim), yBot = Y3(POT.bottom + POT.wall);
  const glass = mesh(new THREE.CylinderGeometry(rOut, rOut, yTop - yBot, 56, 1, true), MAT.glass, false);
  glass.position.set(0, (yTop + yBot) / 2, 0); glass.renderOrder = 4; scene.add(glass);
  const glassIn = mesh(new THREE.CylinderGeometry(r0, r0, yTop - Y3(POT.bottom), 56, 1, true), MAT.glass, false);
  glassIn.position.set(0, (yTop + Y3(POT.bottom)) / 2, 0); glassIn.renderOrder = 3; scene.add(glassIn);
  const base = mesh(new THREE.CylinderGeometry(rOut - 0.015, rOut - 0.015, POT.wall * S, 56), std({ color: '#DDF3FF', transparent: true, opacity: 0.5, roughness: 0.05, depthWrite: false }), false);
  base.position.set(0, yBot + POT.wall * S / 2, 0); base.renderOrder = 1; scene.add(base);   // just inside the outer glass, never level with it
  const rimRing = LAB === 'chem'
    ? mesh(new THREE.TorusGeometry(rOut + 0.01, 0.05, 12, 64), std({ color: '#EAF6FF', transparent: true, opacity: 0.6, roughness: 0.05 }), false)
    : mesh(new THREE.TorusGeometry(rOut + 0.03, 0.09, 14, 64), MAT.steel);
  rimRing.rotation.x = Math.PI / 2; rimRing.position.set(0, yTop, 0); scene.add(rimRing);
  if (LAB === 'chem') addBeakerMarks(rOut, yTop, yBot);
  [-1, 1].forEach(sx => {
    const h = mesh(new THREE.TorusGeometry(0.28, 0.08, 12, 24, Math.PI), MAT.steelDark);
    h.visible = LAB !== 'chem';   // a beaker has no handles
    h.position.set(sx * (rOut + 0.05), yTop - 0.35, 0); h.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(h);
  });
  const kinds = { crys: MAT.crys, sand: MAT.sand, cake: MAT.cake, honey: MAT.honey, batter: MAT.batter, aq: MAT.water, mud: MAT.mud, oil: MAT.oil, flourTop: MAT.flourTop, foam: MAT.foam };
  for (const [k, m] of Object.entries(kinds)) {
    const c = mesh(new THREE.CylinderGeometry(r0 - 0.02, r0 - 0.02, 1, 48), m, k !== 'aq' && k !== 'oil');
    c.visible = false; c.renderOrder = (k === 'aq' || k === 'oil') ? 2 : 0;
    scene.add(c); view3.layers[k] = c;
  }
  view3.r0 = r0;

  // Blender: a steel collar in the pot floor; blades on a shaft rise out of it and spin.
  const collar = mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.12, 32), MAT.steelDark);
  collar.position.set(0, Y3(POT.bottom) + 0.066, 0); scene.add(collar);
  const bladeGroup = new THREE.Group();
  const shaft = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 12), MAT.steel); shaft.position.y = -0.3; bladeGroup.add(shaft);
  const hub = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 16), MAT.steel); bladeGroup.add(hub);
  const nut = mesh(new THREE.ConeGeometry(0.1, 0.14, 12), MAT.steel); nut.position.y = 0.12; bladeGroup.add(nut);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.y = i * Math.PI / 2;
    const bl = mesh(new THREE.BoxGeometry(0.62, 0.025, 0.13), MAT.steel);
    bl.position.x = 0.36; bl.rotation.x = 0.35; bl.rotation.z = i % 2 ? 0.28 : -0.22;   // alternate blades angle up and down
    arm.add(bl); bladeGroup.add(arm);
  }
  bladeGroup.visible = false; scene.add(bladeGroup);
  view3.blades = bladeGroup;
  const dip = mesh(new THREE.ConeGeometry(r0 * 0.55, 1, 40, 1, true), MAT.water, false);
  dip.rotation.x = Math.PI; dip.visible = false; dip.renderOrder = 2; scene.add(dip);
  view3.dip = dip;

  flames = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, f = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 10), MAT.flame);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), MAT.flameCore); core.position.y = -0.06;
    f.add(outer, core); f.position.set(Math.cos(a) * 1.35, Y3(POT.bottom + POT.wall) - 0.12, Math.sin(a) * 1.35);
    flames.add(f);
  }
  flames.visible = false; scene.add(flames); view3.flames = flames;
  flameLight = new THREE.PointLight('#FF8A3D', 0, 7); flameLight.position.set(0, ctop + 0.5, 1.2); scene.add(flameLight);
  coldLight = new THREE.PointLight('#9FDCFF', 0, 8); coldLight.position.set(0, 1.5, 1.5); scene.add(coldLight);

  const tx = X3(POT.x0 - POT.wall - 70), t0 = Y3(POT.bottom - 30), t1 = Y3(POT.rim + 80);
  const tube = mesh(new THREE.CylinderGeometry(0.11, 0.11, t1 - t0, 16), std({ color: '#FFFFFF', transparent: true, opacity: 0.55, roughness: 0.05 }), false);
  tube.position.set(tx, (t0 + t1) / 2, 0.6); tube.renderOrder = 3; scene.add(tube);
  thermoFill = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 12), std({ color: '#FFB52E' }), false);
  thermoFill.position.set(tx, t0, 0.6); scene.add(thermoFill);
  const bulb = mesh(new THREE.SphereGeometry(0.17, 18, 14), thermoFill.material, false); bulb.position.set(tx, t0 - 0.12, 0.6); scene.add(bulb);
  thermoFill.userData = { t0, t1 };

  frostCloud = new THREE.Group();
  [[-0.9, 0.06, 0.42], [-0.4, -0.16, 0.52], [0.2, -0.22, 0.58], [0.8, 0, 0.44], [0, 0.14, 0.5]]
    .forEach(([x, y, r]) => { const m = mesh(new THREE.SphereGeometry(r, 20, 14), MAT.frost); m.position.set(x, -y, 0); frostCloud.add(m); });
  [-0.24, 0.24].forEach(x => { const e = mesh(new THREE.SphereGeometry(0.06, 10, 8), MAT.ink); e.position.set(x, 0.05, 0.55); frostCloud.add(e); });
  const smile = mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 16, Math.PI), MAT.ink); smile.rotation.z = Math.PI; smile.position.set(0, -0.08, 0.56); frostCloud.add(smile);
  frostCloud.visible = false; scene.add(frostCloud);

  // Cutting board on the counter, left of the pot.
  const board = fitted('food-cutting-board', (BOARD.x1 - BOARD.x0) * S);
  if (board) { board.position.set(X3((BOARD.x0 + BOARD.x1) / 2), ctop, 0); env.counter.add(board); view3.board = board; board.visible = LAB !== 'chem'; }
  else { const bd = mesh(new THREE.BoxGeometry((BOARD.x1 - BOARD.x0) * S, (COUNTER - BOARD.top) * S, 2.2), MAT.shelf); bd.position.set(X3((BOARD.x0 + BOARD.x1) / 2), ctop + (COUNTER - BOARD.top) * S / 2, 0); env.counter.add(bd); view3.board = bd; }
  // A soft glow over the cutting board while she holds a knife or masher: "cut here".
  {
    const gl = new THREE.Mesh(new THREE.PlaneGeometry((BOARD.x1 - BOARD.x0) * S * 1.05, 2.0), new THREE.MeshBasicMaterial({ color: '#FFE36E', transparent: true, opacity: 0, depthWrite: false }));
    gl.rotation.x = -Math.PI / 2; gl.position.set(X3((BOARD.x0 + BOARD.x1) / 2), Y3(BOARD.top) + 0.02, 0); gl.renderOrder = 4;
    env.counter.add(gl); view3.boardGlow = gl;
  }
  buildStorage();
  buildOven(ctop);

  const sphere = new THREE.SphereGeometry(1, 10, 8);
  dropMesh = new THREE.InstancedMesh(sphere, MAT.drop, MAX_DROPS);
  dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cloudMesh = new THREE.InstancedMesh(sphere, MAT.cloud, 200);
  steamMesh = new THREE.InstancedMesh(sphere, MAT.steam, 400);
  puddleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.02, 20), MAT.puddle, 300);
  spotMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.015, 20), MAT.spot, 60);
  const white = new THREE.Color('#FFFFFF');
  for (const [m, n] of [[dropMesh, MAX_DROPS], [cloudMesh, 200], [puddleMesh, 300], [spotMesh, 60]]) { for (let i = 0; i < n; i++) m.setColorAt(i, white); m.count = 0; }
  steamMesh.count = 0;
  dropMesh.castShadow = true; puddleMesh.receiveShadow = true;
  scene.add(dropMesh, cloudMesh, steamMesh, puddleMesh, spotMesh);

  // Hands.
  if (LOADED['hand-left'] && LOADED['hand-right']) {
    hands.push(new Hand(LOADED['hand-left'], -1), new Hand(LOADED['hand-right'], 1));
  }
}

// ---------------------------------------------------------------------------
// Per-frame sync
// ---------------------------------------------------------------------------
const colorCache = new Map();
function cssColor(str) {
  let c = colorCache.get(str);
  if (c) return c;
  const m = /rgba?\(([^)]+)\)/.exec(str);
  if (m) { const p = m[1].split(',').map(Number); c = new THREE.Color(p[0] / 255, p[1] / 255, p[2] / 255).convertSRGBToLinear(); }
  else c = new THREE.Color(str);
  if (colorCache.size > 600) colorCache.clear();
  colorCache.set(str, c);
  return c;
}
const rgbColor = (a) => new THREE.Color(a[0] / 255, a[1] / 255, a[2] / 255).convertSRGBToLinear();

function syncBodies(dt) {
  const seen = new Set();
  for (const b of bodies) {
    seen.add(b.id);
    let m = view3.bodyMeshes.get(b.id);
    if (!m) {
      m = b.type === 'mash' ? makeMashModel(b.src)
        : b.type === 'slime' ? makeBlobModel(b.col || [150, 220, 255], 0.15, OBJ.slime.r)
        : b.type === 'curd' ? makeBlobModel([246, 242, 228], 0.8, OBJ.curd.r)
        : makeObjectModel(b.type);
      scene.add(m); view3.bodyMeshes.set(b.id, m);
    }
    syncChemLooks(b, m);
    const k = b.r / OBJ[b.type].r;
    m.visible = b.inPot || b.held || b.place === (section === 'oven' ? 'oven' : 'counter');
    // While the blades spin, things in the pot circle around it.
    const inPot = !b.held && inPotX(b.x) && b.y > POT.rim;
    b.phi = b.phi || 0;
    if (inPot && blade.spin > 0.05) b.phi += blade.spin * dt * 5;
    else b.phi = lerp(b.phi, Math.round(b.phi / (Math.PI * 2)) * Math.PI * 2, Math.min(1, dt * 3));
    const off = (b.x - 800) * S;
    m.position.set(off * Math.cos(b.phi), Y3(b.y), b.held ? 0.45 : off * Math.sin(b.phi));
    m.rotation.set(0, b.type === 'coin' ? 0 : 0.35, -b.rot);
    // Held silverware points its working end down, flat side toward her: blade, tines, spoon bowl, masher head.
    if (b.held && ['knife', 'fork', 'teaspoon'].includes(b.type)) m.rotation.set(Math.PI / 2, 0, Math.PI / 2, 'ZXY');
    else if (b.held && b.type === 'masher') m.rotation.set(0, 0, -Math.PI / 2);
    else m.rotation.order = 'XYZ';
    if (CUPS.has(b.type)) {
      const liq = m.getObjectByName('fill');
      if (liq) {
        const f = Math.min(1, (b.fill || 0) / OBJ[b.type].cup);
        liq.visible = f > 0.02; liq.scale.y = Math.max(0.001, f * liq.userData.full);
        if (b.col) liq.material.color.copy(rgbColor(b.col));
      }
    }
    const flat = Math.pow(0.82, b.cut || 0) * Math.pow(0.72, b.mashed || 0);   // cut pieces are flatter slices; mashing squashes
    m.scale.set(k * (1 + b.squash), k * (1 - b.squash) * flat, k);
    if (b.held && ['knife', 'fork', 'teaspoon', 'masher'].includes(b.type)) m.scale.multiplyScalar(1.3);   // a bit bigger in hand, easy to see
    if (b.type === 'slime') {
      const sp = Math.hypot(b.vx, b.vy), st = 1 + Math.min(1.2, sp / 900);
      m.scale.set(k * st, k / Math.sqrt(st), k / Math.sqrt(st));
      m.rotation.z = Math.atan2(b.vy, b.vx) * (sp > 60 ? 1 : 0) * -1;
    }
    if (['butter', 'choc', 'cheese', 'icecream', 'mint'].includes(b.type)) m.scale.y *= Math.max(0.3, b.melt);
    if (b.type === 'sponge') m.children[0].material.color.setRGB(1, lerp(1, 0.7, Math.min(1, b.water / 70)), lerp(1, 0.55, Math.min(1, b.water / 70))).convertSRGBToLinear();
    if (b.type === 'mallow') m.children[0].material.color.setRGB(1, lerp(0.97, 0.62, b.toast), lerp(0.98, 0.36, b.toast)).convertSRGBToLinear();
    if (COOK_COLORS[b.type] && b.toast > 0) {
      const tint = rgbColor(COOK_COLORS[b.type]);
      m.children[0].traverse(o => { if (o.isMesh && o.userData.base) o.material.color.copy(o.userData.base).lerp(tint.clone().multiply(o.userData.base).multiplyScalar(2.2), b.toast * 0.8); });
      if (b.buttered) m.children[0].traverse(o => { if (o.isMesh && o.userData.base) o.material.color.lerp(new THREE.Color('#FFD65A'), 0.35); });
    }
  }
  for (const [id, m] of view3.bodyMeshes) if (!seen.has(id)) { scene.remove(m); view3.bodyMeshes.delete(id); }
}

function syncPourers() {
  const seen = new Set();
  for (const p of pourers) {
    seen.add(p);
    let m = view3.pourerMeshes.get(p);
    if (!m) { m = makeContainerModel(p.type); scene.add(m); view3.pourerMeshes.set(p, m); }
    m.position.set(X3(p.x), Y3(p.y), p.returning ? 0 : 0.45);
    m.rotation.set(0, 0, -p.tilt);
    m.scale.setScalar(1.25 * Math.max(0.01, p.alpha));
  }
  for (const [p, m] of view3.pourerMeshes) if (!seen.has(p)) { scene.remove(m); view3.pourerMeshes.delete(p); }
  for (const e of view3.spawners) e.model.visible = !(e.slot.kind === 'sub' && pourers.some(p => p.type === e.slot.type && !p.returning));
}

function syncPot() {
  const lay = potLayers();
  for (const c of Object.values(view3.layers)) c.visible = false;
  const frozen = pot.T < 0;
  for (const l of lay.L) {
    const c = view3.layers[l.kind];
    if (!c) continue;
    const h = Math.max(0.005, (l.bottom - l.top) * S);
    c.visible = true; c.scale.y = h; c.position.set(0, Y3(l.bottom) + h / 2 + (l.bottom >= POT.bottom - 0.5 ? 0.008 : 0), 0);
    if (l.kind === 'aq') {
      // Cloudy water shows fine silt; clear water stays glassy.
      const silty = Math.min(1, pot.turb / (aqueous() * 0.15 + 5));
      c.material = frozen ? MAT.frozen : silty > 0.12 ? MAT.murky : MAT.water;
      if (!frozen) {
        const m = c.material;
        m.color.copy(rgbColor(pot.disp));
        m.opacity = 0.55 + Math.min(0.4, (pot.pulp + pot.milk * 0.4 + pot.turb * 0.3) / (aqueous() * 0.5 + 8));
      }
    }
    if (l.kind === 'mud') c.material = frozen ? MAT.frozen : MAT.mud;
    if (l.kind === 'sand') c.material = aqueous() > 0.5 ? MAT.mud : MAT.sand;
    if (l.kind === 'crys') c.material = pot.caramel ? MAT.caramel : MAT.crys;
    if (l.kind === 'batter') {
      const d = dyeColor();
      MAT.batter.color.setRGB(1, 1, 1);
      if (d) MAT.batter.color.lerp(rgbColor(d.rgb), d.strength * 0.6);
      if (pot.bakeT > 0) MAT.batter.color.lerp(new THREE.Color('#E9A84E'), Math.min(0.8, pot.bakeT / 3));
    }
    if (l.kind === 'foam') MAT.foam.color.copy(pot.dr + pot.dy + pot.db + pot.cola > 0 ? rgbColor(pot.disp) : new THREE.Color('#FFFFFF'));
  }
  const bl = view3.blades;
  bl.visible = blade.h > 0.01;
  const ease = 1 - Math.pow(1 - blade.h, 3);
  bl.position.set(0, lerp(Y3(POT.bottom) - 0.5, Y3(BLADE.y), ease), 0);
  bl.rotation.y = blade.angle;
  const aqL = lay.L.find(l => l.kind === 'aq');
  const dipOn = blade.spin > 0.1 && aqL && !frozen;
  view3.dip.visible = !!dipOn;
  if (dipOn) {
    const depth = Math.min(0.6, (aqL.bottom - aqL.top) * S * 0.45) * blade.spin;
    view3.dip.scale.set(1, depth, 1);
    view3.dip.position.set(0, Y3(aqL.top) - depth / 2 + 0.005, 0);
  }
  flames.visible = stove > 0 && section === 'counter' && LAB !== 'chem';
  if (view3.hotplate) {
    const glow = section === 'counter' ? clamp((heat - HEAT_OFF) / (HEAT_MAX - HEAT_OFF), 0, 1) : 0;
    view3.hotplate.top.material.emissiveIntensity = lerp(view3.hotplate.top.material.emissiveIntensity, glow * 1.6, 0.08);
    view3.hotplate.lamp.material.emissiveIntensity = heat > HEAT_OFF + 4 ? 1.5 : 0.1;
  }
  if (view3.boardGlow) {
    const cutting = bodies.some(b => b.held && (b.type === 'knife' || b.type === 'masher'));
    view3.boardGlow.material.opacity = lerp(view3.boardGlow.material.opacity, cutting ? 0.35 + 0.15 * Math.sin(time * 5) : 0, 0.15);
  }
  if (view3.toaster) {
    const on = TOASTER.busy ? 1 : 0;
    view3.toaster.slotGlow.material.emissiveIntensity = lerp(view3.toaster.slotGlow.material.emissiveIntensity, on * 2, 0.1);
    view3.toaster.glowLight.intensity = lerp(view3.toaster.glowLight.intensity, on * 1.2, 0.1);
  }
  if (view3.oven) {
    const glow = section === 'oven' ? clamp((heat - HEAT_OFF) / (HEAT_MAX - HEAT_OFF), 0, 1) : 0;
    view3.oven.coilMat.emissiveIntensity = lerp(view3.oven.coilMat.emissiveIntensity, glow * 2.2, 0.08);
    view3.oven.glow.intensity = lerp(view3.oven.glow.intensity, glow * 2.0, 0.08);
  }
  if (flames.visible) flames.children.forEach((f, i) => f.scale.set(1, (stove === 1 ? 0.6 : 1.1) * (0.8 + 0.3 * Math.sin(time * 18 + i * 1.7)), 1));
  const onStove = section === 'counter';
  flameLight.intensity = lerp(flameLight.intensity, onStove ? stove * 1.2 : 0, 0.1);
  coldLight.intensity = lerp(coldLight.intensity, freezer && onStove ? 0.9 : 0, 0.1);
  frostCloud.visible = freezer && onStove;
  frostCloud.position.set(0, Y3(380) + Math.sin(time * 2) * 0.06, 0.4);
  const { t0, t1 } = thermoFill.userData, f = clamp((pot.T + 25) / 155, 0.03, 1);
  thermoFill.scale.y = (t1 - t0) * f; thermoFill.position.y = t0 + (t1 - t0) * f / 2;
  thermoFill.material.color.set(pot.T < 5 ? '#3DA5FF' : pot.T < 60 ? '#FFB52E' : '#FF5A4E');
}

function syncStorage(dt) {
  const wanted = new Set(recipe.active && !recipe.complete ? recipe.active.need.map(([k, t]) => k + ':' + t) : []);
  const beat = Math.floor(time / 2) !== Math.floor((time - dt) / 2);
  for (const sp of view3.storage) {
    const key = sp.slot.kind + ':' + sp.slot.type;
    sp.check.visible = inBasket(sp.slot.kind, sp.slot.type);
    if (beat && wanted.has(key) && !sp.check.visible && sp.bounce <= 0) sp.bounce = 0.7;
    if (sp.bounce > 0) {
      sp.bounce = Math.max(0, sp.bounce - dt * 2.5);
      const k = 1 + 0.3 * Math.sin((1 - sp.bounce) * Math.PI * 3) * sp.bounce;
      sp.model.scale.copy(sp.baseScale).multiplyScalar(k);
    }
  }
}
const dummy = new THREE.Object3D();
function syncParticles() {
  let nd = 0, ns = 0, np = 0, nc = 0, nsp = 0;
  const lay = potLayers(), surfY = Y3(lay.surface) + 0.01, R = view3.r0 - 0.06;
  const put = (meshI, i, x, y, z, sx, sy, sz, col) => {
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    meshI.setMatrixAt(i, dummy.matrix); if (col) meshI.setColorAt(i, col);
  };
  for (const p of particles) {
    if ((p.k === 'steam' || p.k === 'puff') && ns < 400) { const s = p.s * S * Math.max(0.2, p.life / p.max); put(steamMesh, ns++, X3(p.x), Y3(p.y), 0.2, s, s, s); }
    else if (p.k === 'puddle' && np < 300) put(puddleMesh, np++, X3(p.x), Y3(COUNTER) + 0.012, 0.3, p.s * 1.6 * S, 1, p.s * 1.2 * S * Math.min(1, p.life / 2), cssColor(p.col));
    else if (p.k === 'cloud' && nc < 200) { const s = p.s * S * Math.min(1, p.life / 2); put(cloudMesh, nc++, X3(p.x), Y3(p.y), 0.3 * Math.sin(p.x), s, s, s, cssColor(p.col)); }
    else if (p.k === 'vortex' && nd < MAX_DROPS) { const s = p.s * S * Math.min(1, p.life * 2); put(dropMesh, nd++, Math.cos(p.a) * p.r * R, Y3(p.y), Math.sin(p.a) * p.r * R, s, s, s, cssColor(p.col)); }
    else if (p.k === 'swirl' && nd < MAX_DROPS) { const s = p.s * S * Math.min(1, p.life); put(dropMesh, nd++, Math.cos(p.a) * p.r * R, surfY, Math.sin(p.a) * p.r * R, s, s * 0.3, s, cssColor(p.col)); }
    else if (nd < MAX_DROPS) {
      const col = p.k === 'pour' ? SUB[p.sub].col : (p.k === 'bubble' || p.k === 'snow') ? '#FFFFFF' : p.col;
      const size = (p.k === 'bubble' ? (p.s || 5) : p.k === 'foam' ? p.s * Math.min(1, p.life) : p.s) * S * (p.k === 'pour' && !SUB[p.sub].liquid ? 0.7 : 1);
      put(dropMesh, nd++, X3(p.x), Y3(p.y), p.k === 'bubble' ? 0.6 * Math.sin(p.x * 3) : 0.05, size, size, size, cssColor(col));
    }
  }
  // Pepper flecks floating on the surface; magic-milk color spots.
  const pepperCol = cssColor('#2E2A26');
  for (const s of pot.specks) {
    if (nd >= MAX_DROPS) break;
    const r = lerp(s.r, 0.97, s.f) * R;
    put(dropMesh, nd++, Math.cos(s.a) * r, surfY - s.f * s.f * 0.3, Math.sin(s.a) * r, 0.03, 0.012, 0.03, pepperCol);
  }
  for (const s of pot.spots) { if (nsp >= 60) break; put(spotMesh, nsp++, Math.cos(s.a) * s.r * R, surfY, Math.sin(s.a) * s.r * R, s.s * 2, 1, s.s * 2, cssColor(s.col)); }
  // Spills and puddles are on the counter; the oven has its own floor.
  if (section === 'oven') { np = 0; nsp = 0; }
  dropMesh.count = nd; steamMesh.count = ns; puddleMesh.count = np; cloudMesh.count = nc; spotMesh.count = nsp;
  for (const m of [dropMesh, steamMesh, puddleMesh, cloudMesh, spotMesh]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}

// Hands follow whatever each finger is doing.
function syncHands(dt) {
  if (!hands.length) return;
  for (const h of hands) {
    let goal = { mode: 'idle' };
    const hold = h.holdId != null ? holds.get(h.holdId) : null;
    if (h.holdId != null && !hold) h.holdId = null;
    if (hold) {
      if (hold.body) goal = { mode: 'grip', point: new THREE.Vector3(X3(hold.body.x), Y3(hold.body.y), 0.45), itemR: hold.body.r * S, tilt: 0 };
      else if (hold.pourer) goal = { mode: 'grip', point: new THREE.Vector3(X3(hold.pourer.x), Y3(hold.pourer.y), 0.45), itemR: 0.32, tilt: -hold.pourer.tilt };
      else if (hold.stir) {
        goal = { mode: 'stir', point: new THREE.Vector3(X3(hold.stir.x), Y3(hold.stir.y), 0), moving: Math.hypot(hold.stir.vx, hold.stir.vy) > 120 };
        if (hold.stir.inFluid && hold.stir.coat) { h.coat = hold.stir.coat; h.coatAmt = Math.min(1, h.coatAmt + dt * 2); }
      }
    }
    h.update(dt, goal);
  }
}

function updateCamera(dt) {
  if (AREA_X[section] != null) {
    const X = AREA_X[section];
    // Far enough back to show every shelf and its name tags above the basket strip.
    camera.position.set(X, AREA_CAM_Y + 0.2, 12.4);
    camera.lookAt(X, AREA_CAM_Y - 0.3, 0);
    camera.updateMatrixWorld();
    return;
  }
  let want = 0;
  for (const h of holds.values()) {
    const it = h.body || h.pourer || h.stir;
    if (it && it.y > 330 && Math.abs(it.x - 800) < 420) want = 1;
  }
  cam.lean = lerp(cam.lean, want, Math.min(1, dt * (want ? 2.2 : 1.4)));
  // Rest: the whole pot, the cutting board and the counter's front edge in view, above the basket.
  // Lean in a little while she works over the pot.
  const d = cam.dist * lerp(1, 0.8, cam.lean);
  const ty = lerp(-0.75, -1.25, cam.lean);
  camera.position.set(0, ty + 2.3 - 0.4 * cam.lean, d);
  camera.lookAt(0, ty, 0);
  camera.updateMatrixWorld();
}


// ---------------------------------------------------------------------------
// Pictures of things, drawn from their 3D models straight into canvases
// (no image files or URLs, so nothing for a strict page to block).
// ---------------------------------------------------------------------------
const thumbCache = new Map();
let thumbRT = null, thumbScene = null, thumbCam = null;
const THUMB = 96;
function thumbnail(kind, type) {
  const key = kind + ':' + type;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = THUMB;
  try {
    if (!thumbRT) {
      thumbRT = new THREE.WebGLRenderTarget(THUMB, THUMB); thumbRT.texture.encoding = THREE.sRGBEncoding;
      thumbScene = new THREE.Scene();
      thumbScene.add(new THREE.HemisphereLight('#FFFFFF', '#B08A6A', 1.1));
      const d = new THREE.DirectionalLight('#FFFFFF', 0.9); d.position.set(2, 3, 4); thumbScene.add(d);
      thumbCam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    }
    const m = kind === 'sub' ? makeContainerModel(type) : makeObjectModel(type);
    thumbScene.add(m); m.updateMatrixWorld(true);
    // Turn it so its longest side runs across the picture (a banana seen end-on is a dot).
    let dims = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    if (dims.z > dims.x) { m.rotation.y += Math.PI / 2; m.updateMatrixWorld(true); }
    if (['knife', 'spoon', 'fork', 'teaspoon'].includes(type)) { m.rotation.set(Math.PI / 2, 0, 0.6, 'ZXY'); m.updateMatrixWorld(true); }   // broad side out, on a slant
    if (type === 'whisk' || type === 'masher') { m.rotation.set(0, 0, 0.6); m.updateMatrixWorld(true); }
    const box = new THREE.Box3().setFromObject(m), ctr = box.getCenter(new THREE.Vector3());
    dims = box.getSize(new THREE.Vector3());
    // Fit what the camera actually sees (width and height), seen a little from above.
    const size = Math.max(dims.x, dims.y, dims.z * 0.6) || 1;
    const dist = size / (2 * Math.tan(THREE.MathUtils.degToRad(thumbCam.fov / 2))) * 1.12;
    const dir = new THREE.Vector3(0.28, 0.42, 1).normalize();
    thumbCam.position.copy(ctr).addScaledVector(dir, dist + size / 2); thumbCam.lookAt(ctr); thumbCam.updateMatrixWorld();
    const prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(thumbRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(thumbScene, thumbCam);
    const px = new Uint8Array(THUMB * THUMB * 4); renderer.readRenderTargetPixels(thumbRT, 0, 0, THUMB, THUMB, px);
    renderer.setRenderTarget(null); renderer.setClearColor(prevColor, prevAlpha);
    thumbScene.remove(m);
    const g = c.getContext('2d'), img = g.createImageData(THUMB, THUMB);
    for (let y = 0; y < THUMB; y++) img.data.set(px.subarray((THUMB - 1 - y) * THUMB * 4, (THUMB - y) * THUMB * 4), y * THUMB * 4);
    g.putImageData(img, 0, 0);
  } catch (e) { /* no picture; the slot still works */ }
  thumbCache.set(key, c);
  return c;
}
// A picture with its name underneath.
function labeled(kind, type, px) {
  const w = document.createElement('span'); w.className = 'ing';
  w.appendChild(thumbCopy(kind, type, px));
  const t = document.createElement('span'); t.className = 'lbl'; t.textContent = nameOf(kind, type);
  w.appendChild(t);
  return w;
}
function thumbCopy(kind, type, px) {
  const src = thumbnail(kind, type), c = document.createElement('canvas');
  c.width = c.height = px * 2;                    // sharp on high-density screens
  c.className = 'thumb';
  if (c.style) { c.style.width = px + 'px'; c.style.height = px + 'px'; }
  try { c.getContext('2d').drawImage(src, 0, 0, px * 2, px * 2); } catch (e) {}
  return c;
}
const realEl = (id) => { const el = document.getElementById(id); return el && el !== canvas && el.appendChild ? el : null; };

// ---------------------------------------------------------------------------
// The basket: what she has collected. Drag up out of it to take one; tap to drop
// one onto the counter. In the fridge, pantry or cabinets, tapping puts it back.
// ---------------------------------------------------------------------------
let basketVersion = -1;
function grabFromBasket(kind, type, pointerId, cx, cy) {
  if (AREA_X[section] != null) return false;
  const p = screenToSim(cx, cy);
  if (!p) return false;
  try { canvas.setPointerCapture(pointerId); } catch (e) {}
  const start = (hold) => { hold.cx = cx; hold.cy = cy; holds.set(pointerId, hold); assignHand(pointerId, cx); };
  if (kind === 'sub') {
    if (pourers.some(q => q.type === type && !q.returning)) return false;
    const q = { type, x: p.x, y: p.y, tilt: 0, acc: 0, homeX: p.x, homeY: H + 200, alpha: 1, tx: p.x, ty: p.y };
    pourers.push(q); start({ pourer: q }); sfx('click');
  } else {
    const b = makeBody(type, p.x, p.y);
    b.held = true; b.tx = p.x; b.ty = p.y;
    start({ body: b }); sfx('pop');
  }
  return true;
}
// A tap drops one where she can reach it: on the cutting board if it can be cut, else on the counter.
function dropFromBasket(kind, type) {
  if (kind === 'sub' || AREA_X[section] != null) return false;
  let x;
  if (section === 'oven') x = 800 + rand(-60, 60);
  else if (CHOPPABLE.has(type)) x = rand(BOARD.x0 + 50, BOARD.x1 - 50);
  else x = rand(1060, 1150);    // the open counter between the pot and the toaster
  const b = makeBody(type, x, 380);
  b.vy = 100; sfx('pop');
  return true;
}
function updateBasket() {
  const el = realEl('basket');
  if (!el || basketVersion === INV.version) return;
  basketVersion = INV.version;
  el.querySelectorAll('.slot').forEach(n => n.remove());
  const empty = el.querySelector('.empty');
  if (empty) empty.style.display = INV.subs.length + INV.objs.length ? 'none' : '';
  for (const [kind, list] of [['sub', INV.subs], ['obj', INV.objs]]) for (const type of list) {
    const b = document.createElement('button');
    b.className = 'slot'; b.dataset.kind = kind; b.dataset.type = type; b.setAttribute('aria-label', nameOf(kind, type));
    b.appendChild(labeled(kind, type, 44));
    let down = null;
    b.addEventListener('pointerdown', (e) => { audio(); down = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }; });
    b.addEventListener('pointermove', (e) => {
      if (!down || down.moved) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (dy < -12 && Math.abs(dy) > Math.abs(dx)) { down.moved = true; grabFromBasket(kind, type, e.pointerId, e.clientX, e.clientY); }
    });
    b.addEventListener('pointerup', () => {
      if (down && !down.moved) {
        if (AREA_X[section] != null) { toggleBasket(kind, type); sfx('click'); updateBasket(); }
        else if (!dropFromBasket(kind, type)) flash(b);
      }
      down = null;
    });
    b.addEventListener('pointercancel', () => { down = null; });
    el.appendChild(b);
  }
}

// ---------------------------------------------------------------------------
// Recipes: pick one from the book; its steps tick off as she does them.
// ---------------------------------------------------------------------------
let trackerKey = '';
function buildBook() {
  const grid = realEl('bookgrid');
  if (!grid || grid.childElementCount) return;
  for (const [cat, title] of RECIPE_CATS) {
    const head = document.createElement('div'); head.className = 'cathead'; head.textContent = title;
    grid.appendChild(head);
    for (const r of RECIPES.filter(x => x.cat === cat)) addCard(r);
  }
  function addCard(r) {
    const card = document.createElement('button');
    card.className = 'card';
    const icon = document.createElement('div'); icon.className = 'big'; icon.textContent = r.icon;
    const name = document.createElement('div'); name.className = 'name'; name.textContent = r.name;
    const need = document.createElement('div'); need.className = 'need';
    r.need.forEach(([k, t]) => need.appendChild(labeled(k, t, 40)));
    card.append(icon, name, need);
    card.addEventListener('click', () => { startRecipe(r.id); closeBook(); trackerKey = ''; sfx('swish'); });
    grid.appendChild(card);
  }
}
function openBook() { const b = realEl('book'); if (!b) return; buildBook(); b.hidden = false; }
function closeBook() { const b = realEl('book'); if (b) b.hidden = true; }
function updateTracker() {
  const el = realEl('tracker');
  if (!el) return;
  const r = recipe.active;
  el.hidden = !r;
  if (!r) return;
  const key = r.id + '|' + recipe.done.join() + '|' + INV.version + '|' + recipe.complete;
  if (key === trackerKey) return;
  trackerKey = key;
  el.querySelector('.ticon').textContent = r.icon;
  el.querySelector('.tname').textContent = r.name;
  const need = el.querySelector('.tneed'); need.textContent = '';
  for (const [k, t] of r.need) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (inBasket(k, t) ? ' have' : '');
    chip.appendChild(labeled(k, t, 34));
    const where = whereIs(k, t);
    chip.setAttribute('aria-label', nameOf(k, t) + (where ? ' (in the ' + where + ')' : ''));
    chip.addEventListener('click', () => { if (where && !inBasket(k, t)) goSection(where); });
    need.appendChild(chip);
  }
  const steps = el.querySelector('.tsteps'); steps.textContent = '';
  r.steps.forEach((st, i) => {
    const li = document.createElement('li');
    if (recipe.done[i]) li.className = 'done';
    const act = document.createElement('span'); act.className = 'act'; act.textContent = recipe.done[i] ? '✅' : st.act;
    li.appendChild(act);
    if (st.icon) li.appendChild(thumbCopy(st.icon[0], st.icon[1], 28));
    else { const sp = document.createElement('span'); sp.className = 'pic'; li.appendChild(sp); }
    const tx = document.createElement('span'); tx.textContent = st.text; li.appendChild(tx);
    steps.appendChild(li);
  });
  const next = r.steps.findIndex((_, i) => !recipe.done[i]);
  el.querySelector('.tnow').textContent = recipe.complete ? 'All done!' : r.steps[next].text;
}
function celebrate() {
  sfx('yay');
  const el = realEl('celebrate');
  if (!el) return;
  el.querySelector('.cicon').textContent = recipe.active.icon;
  el.querySelector('.ctext').textContent = 'You made ' + recipe.active.name + '!';
  const conf = el.querySelector('.confetti'); conf.textContent = '';
  const colors = ['#FF5A4E', '#FFC93C', '#3BB273', '#5BB8F5', '#B05BD0', '#FF8FC7'];
  for (let i = 0; i < 60; i++) {
    const d = document.createElement('i');
    d.style.left = (Math.random() * 100) + '%'; d.style.background = colors[i % colors.length];
    d.style.animationDelay = (Math.random() * 0.6) + 's'; d.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
    conf.appendChild(d);
  }
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3600);
}

// ---------------------------------------------------------------------------
// Moving between areas of the kitchen
// ---------------------------------------------------------------------------
const SECTION_NAMES = LAB === 'chem' ? { counter: 'Lab bench', fridge: 'Lab fridge', pantry: 'Chemicals', cabinets: 'Glassware', oven: 'Lab oven' }
                                      : { counter: 'Counter', fridge: 'Fridge', pantry: 'Pantry', cabinets: 'Cabinets', oven: 'Oven' };
let fadeStart = -1e9;      // real clock, so a slow frame rate can't leave the screen washed out
function updateFade() {
  const el = realEl('fade');
  if (!el) return;
  const o = Math.max(0, 0.9 * (1 - (performance.now() - fadeStart) / 300));
  el.style.opacity = String(o);
}
function flash(el) { if (!el || !el.classList) return; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); }
function goSection(name) {
  if (name === section) return;
  // Let go of everything first: hands come back, bottles go home.
  for (const id of [...holds.keys()]) release({ pointerId: id });
  for (const h of hands) h.holdId = null;
  if (!setSection(name)) return;
  env.counter.visible = section === 'counter';
  env.oven.visible = section === 'oven';
  if (document.body && document.body.dataset) document.body.dataset.section = section;
  const toast = document.getElementById('toast');
  if (toast && toast !== canvas) { toast.textContent = SECTION_NAMES[section]; flash(toast); }
  fadeStart = performance.now();
  sfx('swish');
  updateButtons();
}

function fetchFromStorage(sp) {
  const added = toggleBasket(sp.slot.kind, sp.slot.type);
  sp.bounce = 1;
  sfx(added ? 'pop' : 'click');
  updateBasket();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const ndc = new THREE.Vector2(), hit = new THREE.Vector3();
function screenToSim(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(plane, hit)) return null;
  return { x: hit.x / S + 800, y: 500 - hit.y / S };
}
function toScreen(v3) {
  const r = canvas.getBoundingClientRect(), p = v3.clone().project(camera);
  return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
}
function assignHand(pointerId, clientX) {
  if (!hands.length) return;
  const r = canvas.getBoundingClientRect();
  const pref = clientX < r.left + r.width / 2 ? 0 : 1;
  const h = hands[pref].holdId == null ? hands[pref] : hands[1 - pref].holdId == null ? hands[1 - pref] : null;
  if (h) h.holdId = pointerId;
}

canvas.addEventListener('pointerdown', (e) => {
  audio();
  canvas.setPointerCapture(e.pointerId);
  const p = screenToSim(e.clientX, e.clientY);
  if (!p) return;
  const start = (hold) => { hold.cx = e.clientX; hold.cy = e.clientY; holds.set(e.pointerId, hold); assignHand(e.pointerId, e.clientX); };

  // Fridge, pantry, cabinets: tapping something brings it to the counter.
  if (AREA_X[section] != null) {
    let best = null, bestD = 1e9;
    for (const sp of view3.storage) {
      if (sp.slot.area !== section) continue;
      const sc = toScreen(sp.pos), edge = toScreen(sp.pos.clone().add(new THREE.Vector3(0.5, 0, 0)));
      const reach = Math.max(34, Math.abs(edge.x - sc.x) * 1.2), d = Math.hypot(e.clientX - sc.x, e.clientY - sc.y);
      if (d < reach && d < bestD) { best = sp; bestD = d; }
    }
    if (best) fetchFromStorage(best);
    return;
  }
  const inOven = section === 'oven';

  // Things in play (in front) first.
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];
    if (b.held) continue;
    if (!(b.inPot || b.place === (inOven ? 'oven' : 'counter'))) continue;   // only things in this place
    if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 16) {
      if (b.locked) { sfx('knock'); return; }
      if (inPotX(b.x) && b.y + b.r > POT.rim && (pot.T >= HOT_HANDS || blade.spin > 0.2)) { ouch(e.pointerId, e.clientX, b.x, b.y, blade.spin > 0.2 ? 'blades' : 'hot'); return; }
      if (inOven && heat >= 60) { ouch(e.pointerId, e.clientX, b.x, b.y, 'hot'); return; }   // a hot oven is hot everywhere
      b.held = true; b.tx = p.x; b.ty = p.y;
      start({ body: b }); sfx('pop');
      return;
    }
  }
  // Then shelf bottles and counter objects, by where they appear on screen.
  let best = null, bestD = 1e9;
  for (const sp of (inOven ? [] : view3.spawners)) {
    const s = toScreen(sp.pos);
    const edge = toScreen(sp.pos.clone().add(new THREE.Vector3(0.4, 0, 0)));
    const reach = Math.max(30, Math.abs(edge.x - s.x) * 1.1);
    const d = Math.hypot(e.clientX - s.x, e.clientY - s.y);
    if (d < reach && d < bestD) { best = sp; bestD = d; }
  }
  if (best) {
    const s = best.slot;
    if (s.kind === 'sub') {
      if (pourers.some(q => q.type === s.type && !q.returning)) return;
      const q = { type: s.type, x: p.x, y: p.y, tilt: 0, acc: 0, homeX: s.x, homeY: s.y, alpha: 1, tx: p.x, ty: p.y };
      pourers.push(q); start({ pourer: q }); sfx('click');
    } else {
      const b = makeBody(s.type, p.x, p.y);
      b.held = true; b.tx = p.x; b.ty = p.y;
      start({ body: b }); sfx('pop');
    }
    return;
  }
  // Empty space: her hand reaches in, to stir or push things around.
  start({ stir: { x: p.x, y: p.y, vx: 0, vy: 0, r: 42, inFluid: false, coat: null } });
});
canvas.addEventListener('pointermove', (e) => { const h = holds.get(e.pointerId); if (h) { h.cx = e.clientX; h.cy = e.clientY; } });
function release(e) {
  const h = holds.get(e.pointerId);
  if (!h) return;
  holds.delete(e.pointerId);
  if (h.body) { h.body.held = false; h.body.releasedAt = time; h.body.vx = clamp(h.body.vx, -1400, 1400); h.body.vy = clamp(h.body.vy, -1400, 1400); }
  if (h.pourer) h.pourer.returning = true;
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

// Too hot to touch, or blades spinning: the hand jerks back out of the pot.
// Something hurt: a very distressed "Ouch! Ouch! Ouch!", out loud and on screen.
let lastDistress = -1e9, ouchVoice = null;
function pickVoice() {
  const ss = window.speechSynthesis;
  if (!ss || !ss.getVoices) return null;
  const vs = ss.getVoices().filter(v => /^en/i.test(v.lang));
  const local = vs.filter(v => v.localService !== false);   // offline voices only; the tablet has no internet
  return local.find(v => /zira|aria|jenny|eva|female/i.test(v.name)) || local[0] || null;
}
function sayOuch() {
  try {
    const ss = window.speechSynthesis;
    if (!ss || typeof SpeechSynthesisUtterance === 'undefined') return false;
    ss.cancel();
    const u = new SpeechSynthesisUtterance('Ouch! Ouch! Ouch!');
    u.rate = 1.45; u.pitch = 2; u.volume = 1;
    ouchVoice = ouchVoice || pickVoice();
    if (ouchVoice) u.voice = ouchVoice;
    ss.speak(u);
    return true;
  } catch (e) { return false; }
}
function distress() {
  const now = performance.now();
  if (now - lastDistress < 1100) return false;
  lastDistress = now;
  sfx('yelp');
  if (!muted) sayOuch();
  const t = realEl('ouchtext'); if (t) flash(t);
  const f = realEl('ouchflash'); if (f) flash(f);
  if (canvas.classList) flash(canvas);
  return true;
}
function ouch(pointerId, clientX, x, y, kind) {
  let hand = hands.find(h => h.holdId === pointerId);
  if (!hand && clientX != null) { assignHand(pointerId, clientX); hand = hands.find(h => h.holdId === pointerId); }
  if (hand) { hand.holdId = null; hand.pos.set(X3(x), Y3(y) + 0.6, 0.6); hand.visible = 1; hand.flinch = 1; }
  sfx('ouch'); distress();
  view3.ouches = (view3.ouches || 0) + 1;
  if (kind === true || kind === 'blades' || kind === 'knife') return;
  for (let i = 0; i < 6; i++) particles.push({ k: 'steam', x: x + rand(-30, 30), y: y - 20, vx: rand(-30, 30), vy: -rand(80, 140), life: 1.2, max: 1.2, s: rand(14, 22) });
}

function followHeld(dt) {
  for (const [id, h] of holds) {
    const p = screenToSim(h.cx, h.cy);
    if (!p) continue;
    if (h.body) { h.body.tx = p.x; h.body.ty = p.y; }
    if (h.pourer) { h.pourer.tx = p.x; h.pourer.ty = p.y; }
    if (h.stir) {
      const res = updateStir(h.stir, lerp(h.stir.x, p.x, Math.min(1, dt * 20)), lerp(h.stir.y, p.y, Math.min(1, dt * 20)), dt);
      if (res === 'hot' || res === 'blades') { holds.delete(id); ouch(id, null, h.stir.x, h.stir.y, res); }
    }
  }
  for (const b of bodies) {
    if (!b.held) continue;
    const nx = lerp(b.x, b.tx, Math.min(1, dt * 22)), ny = lerp(b.y, b.ty, Math.min(1, dt * 22));
    b.vx = (nx - b.x) / dt; b.vy = (ny - b.y) / dt; b.x = nx; b.y = ny;
  }
  for (const p of pourers) {
    if (p.returning) continue;
    p.x = lerp(p.x, p.tx, Math.min(1, dt * 22)); p.y = lerp(p.y, p.ty, Math.min(1, dt * 22));
  }
}

function updateButtons() {
  document.querySelectorAll('#sections button').forEach(b => {
    if (!b.dataset.section) return;
    b.classList.toggle('on', b.dataset.section === section);
    b.setAttribute && b.setAttribute('aria-pressed', b.dataset.section === section ? 'true' : 'false');
  });
  document.querySelectorAll('#ui button').forEach(b => {
    const id = b.dataset.id;
    b.classList.toggle('on', id === 'blend' && blender);
    if (id === 'sound') b.querySelector('.waves').style.opacity = muted ? 0.15 : 1;
  });
  updateDial();
}

// Heat dial: drag up for hotter, down for colder; the middle is off.
// Top half spans room temperature to high heat, bottom half room temperature to freezing.
const dial = document.getElementById('heat');
const heatToFrac = h => h >= HEAT_OFF ? 0.5 + 0.5 * (h - HEAT_OFF) / (HEAT_MAX - HEAT_OFF) : 0.5 * (h - HEAT_MIN) / (HEAT_OFF - HEAT_MIN);
const fracToHeat = f => f >= 0.5 ? HEAT_OFF + (f - 0.5) / 0.5 * (HEAT_MAX - HEAT_OFF) : HEAT_MIN + f / 0.5 * (HEAT_OFF - HEAT_MIN);
function updateDial() {
  if (!dial) return;
  const f = heatToFrac(heat);
  dial.style.setProperty('--f', f.toFixed(3));
  dial.dataset.mode = heat >= 100 ? 'boil' : heat > HEAT_OFF + 4 ? 'warm' : heat < 5 ? 'cold' : heat < HEAT_OFF - 4 ? 'cool' : 'off';
  dial.setAttribute('aria-valuenow', Math.round(heat));
  dial.setAttribute('aria-valuetext', heat >= 100 ? 'boiling hot' : heat > HEAT_OFF + 4 ? 'warm' : heat < 0 ? 'freezing' : heat < HEAT_OFF - 4 ? 'cool' : 'off');
}
function dialFromPointer(clientY) {
  const r = dial.querySelector('.track').getBoundingClientRect();
  let f = 1 - (clientY - r.top) / r.height;
  f = clamp(f, 0, 1);
  if (Math.abs(f - 0.5) < 0.05) f = 0.5;           // easy to land on "off"
  setHeat(fracToHeat(f));
  updateDial();
}
if (dial) {
  dial.addEventListener('pointerdown', (e) => { e.preventDefault(); audio(); dial.setPointerCapture(e.pointerId); dial.dragging = true; dialFromPointer(e.clientY); });
  dial.addEventListener('pointermove', (e) => { if (dial.dragging) dialFromPointer(e.clientY); });
  const stop = () => { if (dial.dragging) { dial.dragging = false; sfx('click'); } };
  dial.addEventListener('pointerup', stop); dial.addEventListener('pointercancel', stop);
  dial.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5 }[e.key];
    if (step) { e.preventDefault(); setHeat(heat + step); updateDial(); }
    if (e.key === 'Home') { setHeat(HEAT_OFF); updateDial(); }
  });
}
document.querySelectorAll('#ui button').forEach(b => {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); audio(); press(b.dataset.id); updateButtons(); });
});
(() => {
  const bookBtn = realEl('bookbtn'); if (bookBtn) bookBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); audio(); openBook(); });
  const close = realEl('bookclose'); if (close) close.addEventListener('click', closeBook);
  const free = realEl('freeplay'); if (free) free.addEventListener('click', () => { startRecipe(null); closeBook(); });
  const tr = realEl('tracker');
  if (tr) {
    tr.querySelector('.thead').addEventListener('click', () => tr.classList.toggle('open'));
    tr.querySelector('.tclose').addEventListener('click', (e) => { e.stopPropagation(); startRecipe(null); updateTracker(); });
  }
  const cel = realEl('celebrate'); if (cel) cel.addEventListener('click', () => { cel.hidden = true; });
})();
document.querySelectorAll('#sections button').forEach(b => {
  if (!b.dataset.section) return;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); audio(); goSection(b.dataset.section); });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
// Test hook for screenshots: only when the page is opened with ?kldebug (never in her kiosk).
try { if (/kldebug/.test(location.search)) window.__kl = { makeBody, bodies, pot, setHeat, goSection, addToBasket, startRecipe, TOASTER, BOARD, get time() { return time; } }; } catch (e) {}
let last = 0;
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
  last = now;
  time += dt;
  updateCamera(dt);
  followHeld(dt);
  updatePourers(dt);
  updateBlender(dt);
  for (let i = 0; i < 2; i++) stepBodies(dt / 2);
  updateObjects(dt);
  updateParticles(dt);
  updatePot(dt);
  syncBodies(dt);
  syncStorage(dt);
  while (hints.length) {
    const h = hints.shift();
    const toast = realEl('toast');
    if (toast && h === 'board') { toast.textContent = 'Put it on the cutting board!'; flash(toast); }
  }
  while (dangers.length) { const d = dangers.shift(); if (holds.has(d.id)) { holds.delete(d.id); ouch(d.id, null, d.x, d.y, d.why); } }
  syncLabels();
  if (updateRecipe()) celebrate();
  updateBasket(); updateTracker(); updateFade();
  syncPourers();
  syncPot();
  syncParticles();
  syncHands(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

async function start() {
  buildTextures();
  buildMaterials();
  resize3d();
  updateCamera(0);
  await loadModels();
  buildScene();
  updateButtons();
  document.body.classList.add('ready');
  last = performance.now();
  requestAnimationFrame(frame);
}
start();
