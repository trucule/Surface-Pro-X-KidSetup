// My Avatar: a 3D character she designs to look like herself, dressed up with stars from her other apps.
// Everything that makes the avatar look like her is free. Decorations (hats, wings, outfits, pets, places, sparkles,
// fun hair colors) cost stars; once bought they are hers to put on and take off. The design, what she owns and what she
// has spent are saved here and sent to the home screen (KidHome), which shows her portrait and star balance.
'use strict';
const T = THREE;
// The realistic avatar (real.js and models/) when its files are here; otherwise the drawn one below.
const REAL = window.REAL_AVATAR && window.REAL_AVATAR.ok ? window.REAL_AVATAR : null;
T.ColorManagement.legacyMode = false;         // colours are written as sRGB and lit in linear light
const $ = id => document.getElementById(id);
const HOME = (window.KID_STARS && window.KID_STARS.base) || 'http://127.0.0.1:47821';
const KEY = 'kid-avatar-v1';

// ---------------------------------------------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------------------------------------------
const SKIN = ['#FBE3D0', '#F6D2B8', '#EDC09B', '#E2AC82', '#D39A6C', '#C08157', '#A86B45', '#8D5535', '#6F4128', '#53301E'];
const HAIR = ['#1E1612', '#3B2416', '#5C3A21', '#8A5A33', '#8E3B1F', '#B4471F', '#D49A5C', '#E3C27A', '#EFE3C2', '#A8A8A8'];
const DYES = { '#FF6FB5': 'Pink hair', '#9B5DE5': 'Purple hair', '#3A86FF': 'Blue hair', '#22C5B8': 'Teal hair' };
const EYES = ['#5B3A1E', '#3A2412', '#7A6A2E', '#4E8B3A', '#3F7CC2', '#7F8C99', '#B07A2A'];
const CLOTH = ['#FF4F8B', '#FF2D55', '#FF9F1C', '#FFD60A', '#38E54D', '#22C5B8', '#3A86FF', '#1E3A8A', '#9B5DE5', '#FFFFFF', '#9A8C98', '#2B2140'];
const SHOECOL = ['#FFFFFF', '#2B2140', '#FF4F8B', '#3A86FF', '#FF2D55', '#9B5DE5', '#7A4A20', '#FFD60A'];
const GLASSCOL = ['#2B2140', '#8E3B1F', '#FF4F8B', '#3A86FF', '#9B5DE5', '#C0C8D8'];

const LOOK_DRAWN = {
  pose: [['stand'], ['wave'], ['hips'], ['cheer'], ['shy']],
};
const LOOK = {
  face: [['round', 'Round'], ['oval', 'Oval'], ['heart', 'Heart'], ['square', 'Square']],
  eyeShape: [['round', 'Round'], ['almond', 'Almond'], ['wide', 'Wide'], ['sleepy', 'Sleepy']],
  brows: [['natural', 'Natural'], ['thin', 'Thin'], ['thick', 'Thick'], ['arched', 'Arched']],
  nose: [['button', 'Button'], ['small', 'Small'], ['wide', 'Wide'], ['long', 'Long']],
  mouth: [['smile', 'Smile'], ['grin', 'Big grin'], ['small', 'Small smile'], ['open', 'Happy']],
  hair: [['short', 'Short'], ['bob', 'Bob'], ['long', 'Long'], ['ponytail', 'Ponytail'], ['pigtails', 'Pigtails'], ['braids', 'Braids'],
         ['bun', 'Bun'], ['curly', 'Curly'], ['afro', 'Puff'], ['pixie', 'Pixie']],
  top: [['tee', 'T-shirt'], ['long', 'Long sleeves'], ['hoodie', 'Hoodie'], ['stripes', 'Stripes'], ['tank', 'Tank top'], ['dress', 'Dress']],
  bottom: [['jeans', 'Jeans'], ['leggings', 'Leggings'], ['shorts', 'Shorts'], ['skirt', 'Skirt']],
  shoes: [['sneakers', 'Sneakers'], ['boots', 'Boots'], ['sandals', 'Sandals'], ['flats', 'Flats']],
  glasses: [['none', 'None'], ['round', 'Round'], ['square', 'Square'], ['cateye', 'Cat-eye']],
  height: [['short', 'Shorter'], ['medium', 'Medium'], ['tall', 'Taller']],
  build: [['slim', 'Slim'], ['medium', 'Medium'], ['sturdy', 'Sturdy']],
  pose: [['stand', 'Stand'], ['wave', 'Wave'], ['hips', 'Hands on hips'], ['cheer', 'Cheer'], ['shy', 'Shy']],
};

if (REAL) {
  Object.assign(LOOK, { hair: REAL.LOOK.hair, brows: REAL.LOOK.brows, top: REAL.LOOK.top, bottom: REAL.LOOK.bottom, shoes: REAL.LOOK.shoes,
    socks: REAL.LOOK.socks, glasses: REAL.LOOK.glasses, earrings: REAL.LOOK.earrings, pose: REAL.LOOK.pose });
  EYES.push('#4F9A94', '#8EC5E8');
}

// Things to buy. slot: where it goes (one per slot). price in stars.
const SHOP = [
  { id: 'cap', slot: 'hat', name: 'Ball cap', e: '🧢', price: 10 },
  { id: 'beanie', slot: 'hat', name: 'Beanie', e: '🧶', price: 10 },
  { id: 'sunhat', slot: 'hat', name: 'Sun hat', e: '👒', price: 12 },
  { id: 'bow', slot: 'hat', name: 'Big bow', e: '🎀', price: 8 },
  { id: 'party', slot: 'hat', name: 'Party hat', e: '🥳', price: 8 },
  { id: 'catears', slot: 'hat', name: 'Cat ears', e: '🐱', price: 12 },
  { id: 'bunnyears', slot: 'hat', name: 'Bunny ears', e: '🐰', price: 12 },
  { id: 'flowers', slot: 'hat', name: 'Flower crown', e: '🌸', price: 15 },
  { id: 'wizard', slot: 'hat', name: 'Wizard hat', e: '🧙', price: 20 },
  { id: 'unicorn', slot: 'hat', name: 'Unicorn horn', e: '🦄', price: 20 },
  { id: 'tiara', slot: 'hat', name: 'Tiara', e: '💎', price: 25 },
  { id: 'crown', slot: 'hat', name: 'Crown', e: '👑', price: 25 },
  { id: 'sunglasses', slot: 'shades', name: 'Sunglasses', e: '🕶️', price: 10 },
  { id: 'heartglasses', slot: 'shades', name: 'Heart glasses', e: '😍', price: 12 },
  { id: 'starglasses', slot: 'shades', name: 'Star glasses', e: '🤩', price: 12 },
  { id: 'necklace', slot: 'neck', name: 'Pearl necklace', e: '📿', price: 12 },
  { id: 'scarf', slot: 'neck', name: 'Cozy scarf', e: '🧣', price: 10 },
  { id: 'bowtie', slot: 'neck', name: 'Bow tie', e: '🎩', price: 8 },
  { id: 'medal', slot: 'neck', name: 'Gold medal', e: '🥇', price: 15 },
  { id: 'backpack', slot: 'back', name: 'Backpack', e: '🎒', price: 12 },
  { id: 'cape', slot: 'back', name: 'Hero cape', e: '🦸', price: 20 },
  { id: 'fairy', slot: 'back', name: 'Fairy wings', e: '🧚', price: 30 },
  { id: 'butterfly', slot: 'back', name: 'Butterfly wings', e: '🦋', price: 30 },
  { id: 'dragonwings', slot: 'back', name: 'Dragon wings', e: '🐲', price: 30 },
  { id: 'angel', slot: 'back', name: 'Angel wings', e: '👼', price: 35 },
  { id: 'soccer', slot: 'outfit', name: 'Soccer kit', e: '⚽', price: 25 },
  { id: 'chef', slot: 'outfit', name: 'Chef', e: '👩‍🍳', price: 25 },
  { id: 'doctor', slot: 'outfit', name: 'Doctor', e: '🩺', price: 25 },
  { id: 'ballerina', slot: 'outfit', name: 'Ballerina', e: '🩰', price: 30 },
  { id: 'superhero', slot: 'outfit', name: 'Superhero', e: '⚡', price: 35 },
  { id: 'princess', slot: 'outfit', name: 'Princess gown', e: '👸', price: 40 },
  { id: 'astronaut', slot: 'outfit', name: 'Astronaut', e: '🧑‍🚀', price: 40 },
  { id: 'cat', slot: 'pet', name: 'Kitten', e: '🐈', price: 40 },
  { id: 'dog', slot: 'pet', name: 'Puppy', e: '🐕', price: 40 },
  { id: 'bunny', slot: 'pet', name: 'Bunny', e: '🐇', price: 40 },
  { id: 'fox', slot: 'pet', name: 'Fox', e: '🦊', price: 45 },
  { id: 'owl', slot: 'pet', name: 'Owl', e: '🦉', price: 45 },
  { id: 'dragon', slot: 'pet', name: 'Baby dragon', e: '🐉', price: 60 },
  { id: 'bedroom', slot: 'place', name: 'My room', e: '🛏️', price: 15 },
  { id: 'park', slot: 'place', name: 'Park', e: '🌳', price: 20 },
  { id: 'beach', slot: 'place', name: 'Beach', e: '🏖️', price: 20 },
  { id: 'castle', slot: 'place', name: 'Castle', e: '🏰', price: 30 },
  { id: 'space', slot: 'place', name: 'Space', e: '🚀', price: 30 },
  { id: 'underwater', slot: 'place', name: 'Under the sea', e: '🐠', price: 30 },
  { id: 'glitter', slot: 'sparkle', name: 'Glitter', e: '✨', price: 15 },
  { id: 'hearts', slot: 'sparkle', name: 'Hearts', e: '💖', price: 15 },
  { id: 'stars', slot: 'sparkle', name: 'Star ring', e: '🌟', price: 15 },
  { id: 'bubbles', slot: 'sparkle', name: 'Bubbles', e: '🫧', price: 15 },
];
if (REAL) {
  // Real hats and glasses from the model files, next to the drawn ones.
  const add = (id, slot, e, price) => { if (REAL.has(id)) SHOP.push({ id, slot, name: window.AVATAR_CATALOG.assets[id].label, e, price }); };
  add('hat-newsboy', 'hat', '🧢', 12); add('hat-santa', 'hat', '🎅', 10);
  add('glasses-3d', 'shades', '🎬', 12); add('glasses-goggles', 'shades', '🥽', 15);
}
Object.entries(DYES).forEach(([c, n]) => SHOP.push({ id: 'dye' + c.slice(1).toLowerCase(), slot: 'dye', name: n, e: '🎨', price: 10, color: c }));
const ITEM = Object.fromEntries(SHOP.map(i => [i.id, i]));
const SLOTS = ['hat', 'shades', 'neck', 'back', 'outfit', 'pet', 'place', 'sparkle'];

const DEFAULT = {
  skin: SKIN[2], face: 'round', eyeShape: 'round', eyeColor: EYES[0], lashes: true, brows: 'natural', nose: 'button', mouth: 'smile',
  freckles: false, blush: true, hair: 'long', hairColor: HAIR[3], top: 'tee', topColor: CLOTH[0], bottom: 'jeans', bottomColor: CLOTH[7],
  shoes: 'sneakers', shoesColor: SHOECOL[0], glasses: 'none', glassesColor: GLASSCOL[0], height: 'medium', build: 'medium', pose: 'stand',
  hat: null, shades: null, neck: null, back: null, outfit: null, pet: null, place: null, sparkle: null,
  socks: 'socks-low', earrings: 'none', tune: {},
};
if (REAL) Object.assign(DEFAULT, { hair: 'hair-long', brows: 'brows-natural', top: 'top-tee', bottom: 'bottom-pants', shoes: 'shoes-sneakers', glasses: 'none' });
// A design saved by the drawn avatar, or with a choice that no longer exists, gets the nearest real choice.
function migrate(d) {
  if (!REAL) return d;
  for (const [k, map] of Object.entries(REAL.MIGRATE)) if (map[d[k]]) d[k] = map[d[k]];
  for (const k of ['hair', 'brows', 'top', 'bottom', 'shoes', 'socks', 'glasses', 'earrings', 'pose'])
    if (LOOK[k] && !LOOK[k].some(([v]) => v === d[k])) d[k] = DEFAULT[k];
  if (!d.tune || typeof d.tune !== 'object') d.tune = {};
  return d;
}
// The drawn avatar's nearest choice for a real one (used only if the model files fail to load).
function drawnDesign(P) {
  if (!REAL) return P;
  const q = Object.assign({}, P), BASE = { hair: 'long', brows: 'natural', top: 'tee', bottom: 'jeans', shoes: 'sneakers', glasses: 'none', pose: 'stand' };
  for (const [k, map] of Object.entries(REAL.MIGRATE)) if (q[k] && !Object.keys(map).includes(q[k])) q[k] = Object.keys(map).find(o => map[o] === q[k]) || BASE[k] || q[k];
  if (REAL.isDress(P.top)) q.top = 'dress';
  if (!LOOK_DRAWN.pose.some(([v]) => v === q.pose)) q.pose = 'stand';
  if (q.glasses && q.glasses.startsWith('glasses-')) q.glasses = 'round';
  return q;
}

// ---------------------------------------------------------------------------------------------------------------
// Saved state
// ---------------------------------------------------------------------------------------------------------------
let S = { design: Object.assign({}, DEFAULT), owned: [], spent: 0, savedAt: 0 };
function loadLocal() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.design) return s; } catch (e) {}
  return null;
}
function clean(s) {
  const d = migrate(Object.assign({}, DEFAULT, s.design || {}));
  const owned = (s.owned || []).filter(id => ITEM[id]);
  for (const k of SLOTS) if (d[k] && !owned.includes(d[k])) d[k] = null;
  if (DYES[d.hairColor] && !owned.includes('dye' + d.hairColor.slice(1).toLowerCase())) d.hairColor = DEFAULT.hairColor;
  return { design: d, owned, spent: Math.max(0, s.spent | 0), savedAt: +s.savedAt || 0 };
}
const local = loadLocal(); if (local) S = clean(local);
const earned = () => (window.KID_STARS ? window.KID_STARS.earned() : 0);
const balance = () => Math.max(0, earned() - S.spent);

let saveT = null, homeOk = null;
function persist(quiet) {
  S.savedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  clearTimeout(saveT); saveT = setTimeout(() => sendHome(quiet), 700);
}
// The home screen keeps a copy of the design (and what she owns and spent) and the portrait it shows.
function sendHome(quiet) {
  const body = JSON.stringify({ design: S.design, owned: S.owned, spent: S.spent, savedAt: S.savedAt, earned: earned() });
  // The portrait waits until the avatar on screen is the whole saved design (the realistic one loads its files first);
  // a picture taken earlier would be empty or out of date. The frame loop sends it as soon as it is ready.
  let png = '';
  if (!showingDesign()) portraitDue = true;
  else { portraitDue = false; try { png = portrait(); } catch (e) { window.MY_AVATAR.errors.push('portrait: ' + e.message); } }
  const post = (path, b) => fetch(HOME + path, { method: 'POST', body: b });
  return Promise.all([post('/avatar', body), png ? post('/portrait', png) : null, window.KID_STARS ? window.KID_STARS.report(true) : null])
    .then(() => { homeOk = true; if (!quiet) flashSaved(); }, () => { homeOk = false; });
}
let portraitDue = false;
function showingDesign() {
  if (!parts.H || trying || lastPreview) return false;
  if (!parts.real) return !REAL || !!REAL.failed;
  return !REAL.need(S.design).length && !!REAL.texturesReady;
}
function flashSaved() { const el = $('saved'); el.classList.add('on'); clearTimeout(flashSaved.t); flashSaved.t = setTimeout(() => el.classList.remove('on'), 1800); }
// If this app's saved copy was lost (cleared browser data), the home screen's copy brings it back.
function restoreFromHome() {
  return fetch(HOME + '/avatar').then(r => r.json()).then(h => {
    if (h && h.design && (+h.savedAt || 0) > S.savedAt) { S = clean(h); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} buildPlace(S.design.place); rebuild(); render(); }
  }).catch(() => {});
}

// ---------------------------------------------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------------------------------------------
const stage = $('stage');
const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.LinearToneMapping; renderer.toneMappingExposure = 0.85;
stage.appendChild(renderer.domElement);
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(30, 1, 0.05, 200);
const hemi = new T.HemisphereLight('#ffffff', '#b9a99a', 0.75); scene.add(hemi);
const key = new T.DirectionalLight('#fff4e6', 1.05); key.position.set(2.2, 4, 3.2); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: 0.5, far: 12 }); key.shadow.bias = -0.0005;
scene.add(key);
const rim = new T.DirectionalLight('#cfe0ff', 0.55); rim.position.set(-3, 2.5, -2.5); scene.add(rim);
const fill = new T.DirectionalLight('#ffe9f2', 0.3); fill.position.set(-2.5, 1.2, 3); scene.add(fill);
// Soft light from a whole room, which skin and cloth need to look real.
if (T.RoomEnvironment) { try { const pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture; hemi.intensity = 0.15; key.intensity = 0.9; rim.intensity = 0.3; fill.intensity = 0.15; } catch (e) {} }

const mats = {};
function mat(color, o) {
  o = o || {}; const k = color + JSON.stringify(o);
  if (!mats[k]) mats[k] = new T.MeshStandardMaterial(Object.assign({ color: new T.Color(color), roughness: 0.62, metalness: 0 }, o));
  return mats[k];
}
function mesh(geo, m, x, y, z, sx, sy, sz) {
  const me = new T.Mesh(geo, m); me.position.set(x || 0, y || 0, z || 0);
  if (sx !== undefined) me.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
  me.castShadow = true; me.receiveShadow = true; return me;
}
const SPH = new T.SphereGeometry(1, 32, 24), SPH_LO = new T.SphereGeometry(1, 14, 10), CYL = new T.CylinderGeometry(1, 1, 1, 24);
// Adds a part and returns the part (Object3D.add returns the parent), so it can be turned in place.
const put = (parent, m) => { parent.add(m); return m; };
const capsule = (r, len) => new T.CapsuleGeometry(r, len, 8, 20);
// A capsule from point a to point b.
function limb(a, b, r, m) {
  const d = new T.Vector3().subVectors(b, a), len = Math.max(0.001, d.length() - 2 * r * 0.2);
  const me = new T.Mesh(capsule(r, len), m); me.castShadow = true;
  me.position.copy(a).add(b).multiplyScalar(0.5);
  me.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); return me;
}

// Backdrop: a soft studio with a round platform, or one of the places she has bought.
const backdrop = new T.Group(); scene.add(backdrop);
function gradientTexture(top, bottom, extra) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  if (extra) extra(g, c);
  const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
}
function starsTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#05021a'); gr.addColorStop(1, '#2a1660'); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`; const r = Math.random() * 1.6 + 0.3; g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, r, 0, 7); g.fill(); }
  const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
}
let floorY = 0;
function buildPlace(id) {
  backdrop.clear(); floorY = 0;
  const ground = (c, r) => { const g = mesh(new T.CircleGeometry(r || 30, 48), mat(c, { roughness: 0.95 })); g.rotation.x = -Math.PI / 2; g.castShadow = false; backdrop.add(g); return g; };
  const plinth = (c, top) => { floorY = 0.091; backdrop.add(mesh(new T.CylinderGeometry(0.62, 0.66, 0.08, 48), mat(c, { roughness: 0.4 }), 0, 0.04, 0)); backdrop.add(mesh(new T.CylinderGeometry(0.6, 0.6, 0.012, 48), mat(top, { roughness: 0.35 }), 0, 0.085, 0)); };
  let fogC = null;
  switch (id) {
    case 'park':
      scene.background = gradientTexture('#59B7FF', '#D9F2FF'); ground('#58C76B');
      for (const [x, z, s] of [[-2.4, -2.2, 1.2], [2.6, -2.8, 1.4], [-4, -5, 1.6], [3.8, -6, 1.8], [0.6, -6.5, 1.5]]) {
        backdrop.add(mesh(CYL, mat('#8B5A2B'), x, 0.5 * s, z, 0.09 * s, s, 0.09 * s));
        backdrop.add(mesh(SPH, mat('#2DC653'), x, 1.25 * s, z, 0.55 * s, 0.5 * s, 0.55 * s));
      }
      for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, r = 1 + Math.random() * 3; backdrop.add(mesh(SPH_LO, mat(['#FF4F8B', '#FFD60A', '#ffffff'][i % 3]), Math.cos(a) * r, 0.03, Math.sin(a) * r - 1, 0.04)); }
      fogC = '#D9F2FF'; break;
    case 'beach':
      scene.background = gradientTexture('#3BA4FF', '#FFE9C2'); ground('#F2D7A0');
      { const sea = mesh(new T.PlaneGeometry(60, 20), mat('#2E9BD6', { roughness: 0.2 }), 0, 0.01, -12); sea.rotation.x = -Math.PI / 2; backdrop.add(sea); }
      backdrop.add(mesh(CYL, mat('#8B5A2B'), 2.4, 1, -2, 0.07, 2, 0.07));
      for (let i = 0; i < 6; i++) { const l = mesh(SPH, mat('#2DC653'), 2.4 + Math.cos(i) * 0.5, 2.0, -2 + Math.sin(i) * 0.5, 0.6, 0.06, 0.18); l.rotation.y = i; l.rotation.z = 0.3; backdrop.add(l); }
      backdrop.add(mesh(SPH, mat('#FFD60A', { emissive: new T.Color('#FFB703'), emissiveIntensity: 0.6 }), -3, 3.4, -9, 0.7));
      fogC = '#FFE9C2'; break;
    case 'space':
      scene.background = starsTexture(); ground('#3b2f6b');
      backdrop.add(mesh(SPH, mat('#FF9F1C', { roughness: 0.8 }), -2.6, 2.4, -5, 0.9));
      { const ring = mesh(new T.TorusGeometry(1.35, 0.06, 8, 48), mat('#FFD6A0'), -2.6, 2.4, -5); ring.rotation.x = 1.2; backdrop.add(ring); }
      backdrop.add(mesh(SPH, mat('#9EC9FF', { roughness: 0.9 }), 2.8, 3.1, -6, 0.5));
      plinth('#8A3FFC', '#C77DFF'); break;
    case 'castle':
      scene.background = gradientTexture('#FFB3D9', '#FFF0F7'); ground('#7BD88F');
      for (const x of [-2.2, 2.2]) { backdrop.add(mesh(CYL, mat('#E6E1F0'), x, 1.1, -3, 0.45, 2.2, 0.45)); const r = mesh(new T.ConeGeometry(0.55, 0.9, 24), mat('#FF4F8B'), x, 2.65, -3); backdrop.add(r); }
      backdrop.add(mesh(new T.BoxGeometry(3.6, 1.6, 0.6), mat('#E6E1F0'), 0, 0.8, -3.4));
      backdrop.add(mesh(new T.BoxGeometry(0.7, 1, 0.1), mat('#8B5A2B'), 0, 0.5, -3.08));
      for (let i = -4; i <= 4; i++) backdrop.add(mesh(new T.BoxGeometry(0.25, 0.25, 0.6), mat('#E6E1F0'), i * 0.4, 1.72, -3.4));
      fogC = '#FFF0F7'; break;
    case 'bedroom':
      scene.background = gradientTexture('#FFE0F0', '#FFF7E8'); ground('#C9A27A');
      backdrop.add(mesh(new T.BoxGeometry(8, 4, 0.1), mat('#FFD1E8'), 0, 2, -2.6));
      backdrop.add(mesh(new T.BoxGeometry(1.6, 0.35, 0.9), mat('#9B5DE5'), -2, 0.3, -1.9));
      backdrop.add(mesh(new T.BoxGeometry(1.6, 0.6, 0.12), mat('#7A4A20'), -2, 0.55, -2.4));
      backdrop.add(mesh(new T.BoxGeometry(1.1, 0.75, 0.05), mat('#9EE7FF', { emissive: new T.Color('#9EE7FF'), emissiveIntensity: 0.3 }), 1.6, 2.1, -2.54));
      backdrop.add(mesh(new T.CylinderGeometry(0.9, 0.9, 0.01, 40), mat('#FFD60A'), 0, 0.006, 0));
      for (let i = 0; i < 5; i++) backdrop.add(mesh(SPH, mat(['#FF4F8B', '#3A86FF', '#38E54D', '#FF9F1C', '#FFD60A'][i]), 2.2 + (i % 2) * 0.2, 0.9 + i * 0.12, -2.3, 0.08));
      break;
    case 'underwater':
      scene.background = gradientTexture('#0B4F8A', '#3FC1C9'); ground('#E8D6A8');
      for (const [x, z, c] of [[-2, -2, '#FF6F91'], [2.4, -2.6, '#FF9F1C'], [-3.2, -4, '#9B5DE5'], [3, -4.5, '#FF4F8B']]) for (let i = 0; i < 5; i++) backdrop.add(mesh(capsule(0.06, 0.5 + i * 0.1), mat(c), x + i * 0.1, 0.35, z));
      for (let i = 0; i < 4; i++) { const f = mesh(SPH, mat(['#FFD60A', '#FF9F1C', '#3A86FF', '#FF4F8B'][i]), -2.5 + i * 1.6, 1.6 + (i % 2) * 0.6, -3, 0.18, 0.12, 0.08); backdrop.add(f); }
      fogC = '#3FC1C9'; break;
    default:
      scene.background = gradientTexture('#B8D8FF', '#F3ECFF'); ground('#EDE6FA');
      plinth('#ffffff', '#FFE45C'); fogC = '#F3ECFF';
  }
  scene.fog = fogC ? new T.Fog(fogC, 6, 22) : null;
  avatar.position.y = floorY;
}

// ---------------------------------------------------------------------------------------------------------------
// The character. Feet at y = 0, about 1.6 tall. Every part is rebuilt from the design when anything changes.
// ---------------------------------------------------------------------------------------------------------------
const avatar = new T.Group(); scene.add(avatar);
let parts = {};       // named pieces for poses, blinking and the camera
// The head: a sphere stretched by face shape, narrower at the jaw, a little flatter at the face.
const HEAD = { jaw: { round: 0.94, oval: 0.86, heart: 0.76, square: 0.97 }, len: { round: 1.08, oval: 1.17, heart: 1.12, square: 1.06 }, cheek: { round: 1.0, oval: 0.97, heart: 1.04, square: 1.0 } };
// Side-to-side and front-to-back scale of the unit sphere at unit height uy (front and back differ).
function headScale(shape, uy) {
  const jaw = HEAD.jaw[shape], cheek = HEAD.cheek[shape];
  let kx = 1, kz = 0.97;
  if (uy < 0) { const t = Math.min(1, -uy); kx = shape === 'square' ? 1 - (1 - jaw) * Math.pow(t, 3) : 1 - (1 - jaw) * Math.pow(t, 1.4); kz *= 1 - (1 - jaw) * 0.6 * Math.pow(t, 1.6); }
  else kx = 1 + (cheek - 1) * (1 - uy);
  return [kx, kz, kz * (1.02 - 0.05 * Math.abs(uy))];   // [x, back, front]
}
function headGeometry(shape) {
  const g = new T.SphereGeometry(1, 56, 42), p = g.attributes.position, v = new T.Vector3(), len = HEAD.len[shape];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const [kx, kb, kf] = headScale(shape, v.y);
    p.setXYZ(i, v.x * kx, v.y * len, v.z * (v.z > 0 ? kf : kb));
  }
  g.computeVertexNormals(); return g;
}
const hairMatFor = c => mat(c, { roughness: 0.48, metalness: 0.05 });
function stripesTexture(c1, c2) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(0, i * 8, 64, 8); }
  const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1, 3); return t;
}
function lighter(c, k) { const x = new T.Color(c); x.lerp(new T.Color('#ffffff'), k); return '#' + x.getHexString(); }
function darker(c, k) { const x = new T.Color(c); x.lerp(new T.Color('#000000'), k); return '#' + x.getHexString(); }

function build(d, preview) {
  const P = Object.assign({}, d, preview || {});
  if (REAL && !REAL.failed) return buildReal(P);
  return buildDrawn(drawnDesign(P));
}

const HAT_FIT = { s: 0.9, y: -0.035, z: 0.05 };   // the drawn hats on her real head and hair
// The realistic avatar from real.js, with the drawn hats, wings, outfits extras and pets added to it.
let lastPreview = null;
function buildReal(P) {
  if (REAL.need(P).length) {
    loadingNote(true);
    REAL.onReady = () => { loadingNote(false); rebuild(lastPreview); };
    REAL.compose(new T.Group(), P);          // starts loading what is missing; the avatar on screen stays until it is ready
    return;
  }
  loadingNote(false);
  avatar.clear(); parts = {}; floaters.length = 0;
  const r = REAL.compose(avatar, P);
  const out = P.outfit, R = 0.19, W = { slim: 0.94, medium: 1, sturdy: 1.08 }[P.build] || 1;
  const head = r.head, body = r.torso;
  if (P.shades && !REAL.SHADES.includes(P.shades)) buildShades(head, P.shades, R);
  // Drawn hats sit on top of real hair, which is fuller than the drawn hair.
  const hg = new T.Group(); hg.scale.setScalar(HAT_FIT.s); hg.position.set(0, HAT_FIT.y, HAT_FIT.z); head.add(hg);
  if (P.hat && !REAL.has(P.hat)) buildHat(hg, P.hat, P.hairColor, R);
  if (out === 'chef') { hg.add(mesh(CYL, mat('#ffffff', { roughness: 0.9 }), 0, R * 0.72, -0.01, R * 1.02, R * 0.7, R * 1.02)); hg.add(mesh(SPH, mat('#ffffff', { roughness: 0.9 }), 0, R * 1.17, -0.01, R * 1.25, R * 0.55, R * 1.25)); }
  if (out === 'superhero') head.add(mesh(new T.TorusGeometry(0.085, 0.02, 8, 30), mat('#FF2D55'), 0, 0.005, R * 0.84, 1.15, 0.45, 1));
  if (out === 'astronaut') { head.add(new T.Mesh(new T.SphereGeometry(R * 1.75, 32, 24), new T.MeshPhysicalMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.1, depthWrite: false }))); put(body, mesh(new T.TorusGeometry(0.12, 0.03, 10, 30), mat('#C0C8D8', { metalness: 0.5, roughness: 0.3 }), 0, 1.13, 0, 1, 1, 0.9)).rotation.x = Math.PI / 2; }
  if (out === 'doctor') put(body, mesh(new T.TorusGeometry(0.06, 0.008, 6, 20), mat('#9A8C98', { metalness: 0.6 }), 0, 0.97, 0.11)).rotation.x = 0.2;
  if (P.neck && P.neck !== 'necklace') buildNeck(body, P.neck, W);
  // Her real back is shorter and deeper than the drawn one: things on her back sit a little higher and further out.
  const back = new T.Group(); back.position.set(0, 0.1, -0.05); body.add(back);
  if (P.back) buildBack(back, P.back, W, P.hairColor);
  if (out === 'superhero' && P.back !== 'cape') buildBack(back, 'cape', W, '#FF2D55');
  if (P.pet) buildPet(P.pet);
  if (P.sparkle) buildSparkle(P.sparkle, r.H);
  Object.assign(parts, { H: r.H, faceY: r.eyeY, headR: r.headR, real: true });
}
function loadingNote(on) {
  let n = $('loading');
  if (!n && on) { n = el('div', '', 'Getting ready...'); n.id = 'loading'; stage.appendChild(n); }
  if (n) n.classList.toggle('on', !!on);
}

function buildDrawn(P) {
  avatar.clear(); parts = {};
  const H = { short: 0.92, medium: 1, tall: 1.07 }[P.height] || 1, W = { slim: 0.9, medium: 1, sturdy: 1.13 }[P.build] || 1;
  const body = new T.Group(); body.scale.set(1, H, 1); avatar.add(body);
  const skin = mat(P.skin, { roughness: 0.55 });
  const out = P.outfit;
  // Clothes, possibly from an outfit.
  let topC = P.topColor, topKind = P.top, botC = P.bottomColor, botKind = P.bottom, shoeC = P.shoesColor, shoeKind = P.shoes;
  const OUT = {
    soccer: ['tee', '#FF2D55', 'shorts', '#ffffff', 'sneakers', '#2B2140'], chef: ['long', '#ffffff', 'jeans', '#2B2140', 'flats', '#2B2140'],
    doctor: ['long', '#7FD1E8', 'jeans', '#7FD1E8', 'sneakers', '#ffffff'], ballerina: ['tank', '#FFB3D1', 'tutu', '#FFC8E0', 'flats', '#FFB3D1'],
    superhero: ['long', '#3A86FF', 'leggings', '#3A86FF', 'boots', '#FF2D55'], princess: ['gown', '#C77DFF', 'gown', '#C77DFF', 'flats', '#FFD60A'],
    astronaut: ['suit', '#F2F2F2', 'suit', '#F2F2F2', 'boots', '#9A8C98'],
  }[out];
  if (OUT) [topKind, topC, botKind, botC, shoeKind, shoeC] = OUT;
  const dress = topKind === 'dress' || topKind === 'gown';
  if (dress && botKind !== 'gown') botKind = 'none';      // a dress has bare legs under it
  const topMat = topKind === 'stripes' ? new T.MeshStandardMaterial({ map: stripesTexture(topC, lighter(topC, 0.75)), roughness: 0.8 }) : mat(topC, { roughness: topKind === 'suit' ? 0.5 : 0.82 });
  const botMat = mat(botC, { roughness: botKind === 'jeans' ? 0.9 : 0.75 });
  const shoeMat = mat(shoeC, { roughness: 0.5 });

  // Legs and shoes.
  const hipY = 0.68, kneeY = 0.38, ankleY = 0.07, legX = 0.072 * W;
  for (const s of [-1, 1]) {
    const hip = new T.Vector3(s * legX, hipY, 0), knee = new T.Vector3(s * legX * 1.02, kneeY, 0.01), ankle = new T.Vector3(s * legX * 1.02, ankleY, 0);
    const thighM = (botKind === 'skirt' || dress || botKind === 'tutu') ? skin : botMat;
    const shinM = (botKind === 'jeans' || botKind === 'leggings' || botKind === 'suit') ? botMat : (out === 'ballerina' ? mat('#FFE4EE', { roughness: 0.4 }) : skin);
    body.add(limb(hip, knee, 0.068 * W * (botKind === 'jeans' ? 1.06 : 1), thighM));
    body.add(limb(knee, ankle, 0.05 * W * (botKind === 'jeans' ? 1.12 : 1), shinM));
    if (botKind === 'shorts') body.add(limb(hip, new T.Vector3(s * legX, 0.5, 0.005), 0.072 * W, botMat));
    // Shoe
    const shoe = new T.Group(); shoe.position.set(s * legX * 1.02, 0, 0.03);
    if (shoeKind === 'boots') { shoe.add(mesh(CYL, shoeMat, 0, 0.11, -0.01, 0.06 * W, 0.2, 0.065)); shoe.add(mesh(SPH, shoeMat, 0, 0.035, 0.04, 0.065, 0.04, 0.11)); }
    else if (shoeKind === 'sandals') { shoe.add(mesh(SPH, skin, 0, 0.035, 0.035, 0.055, 0.035, 0.1)); shoe.add(mesh(new T.BoxGeometry(0.12, 0.02, 0.22), shoeMat, 0, 0.01, 0.03)); shoe.add(mesh(new T.TorusGeometry(0.05, 0.01, 6, 16, Math.PI), shoeMat, 0, 0.03, 0.06)); }
    else { shoe.add(mesh(SPH, shoeMat, 0, 0.04, 0.035, 0.065, shoeKind === 'flats' ? 0.035 : 0.05, 0.115)); if (shoeKind === 'sneakers') shoe.add(mesh(SPH, mat('#ffffff', { roughness: 0.5 }), 0, 0.012, 0.035, 0.068, 0.015, 0.118)); }
    body.add(shoe);
  }

  // Torso: a lathe profile (radius by height), flattened front to back.
  const prof = [[0.0, 0.66], [0.13, 0.67], [0.148, 0.74], [0.135, 0.82], [0.13, 0.88], [0.148, 0.97], [0.162, 1.04], [0.15, 1.09], [0.07, 1.135], [0.0, 1.14]];
  const torso = new T.Mesh(new T.LatheGeometry(prof.map(([r, y]) => new T.Vector2(r * W, y)), 40), dress ? topMat : (topKind === 'tank' ? topMat : topMat));
  torso.scale.z = 0.72; torso.castShadow = true; body.add(torso);
  // Waistband / bottoms over the hips (not with a dress).
  if (!dress) {
    const band = new T.Mesh(new T.LatheGeometry([[0, 0.6], [0.125, 0.6], [0.152, 0.66], [0.15, 0.76], [0, 0.765]].map(([r, y]) => new T.Vector2(r * W * 1.01, y)), 40), botMat);
    band.scale.z = 0.74; band.castShadow = true; body.add(band);
  }
  if (botKind === 'skirt' || botKind === 'tutu') {
    const sk = new T.Mesh(new T.CylinderGeometry(0.14 * W, botKind === 'tutu' ? 0.34 * W : 0.22 * W, botKind === 'tutu' ? 0.14 : 0.24, 36, 1, true), new T.MeshStandardMaterial({ color: botC, roughness: 0.7, side: T.DoubleSide }));
    sk.position.y = botKind === 'tutu' ? 0.66 : 0.6; sk.scale.z = 0.85; sk.castShadow = true; body.add(sk);
  }
  if (dress) {
    const long = topKind === 'gown';
    const sk = new T.Mesh(new T.CylinderGeometry(0.135 * W, (long ? 0.38 : 0.25) * W, long ? 0.66 : 0.32, 40, 1, true), new T.MeshStandardMaterial({ color: topC, roughness: 0.7, side: T.DoubleSide }));
    sk.position.y = long ? 0.37 : 0.56; sk.scale.z = 0.85; sk.castShadow = true; body.add(sk);
    if (long) put(body, mesh(new T.TorusGeometry(0.15 * W, 0.02, 8, 30), mat('#FFD60A', { metalness: 0.4, roughness: 0.3 }), 0, 0.78, 0, 1, 1, 0.72)).rotation.x = Math.PI / 2;
  }
  if (topKind === 'hoodie') { const hood = mesh(new T.TorusGeometry(0.1, 0.045, 10, 24), topMat, 0, 1.12, -0.05, 1, 1, 1); hood.rotation.x = Math.PI / 2.4; body.add(hood); body.add(mesh(SPH, mat(lighter(topC, 0.3)), 0, 0.82, 0.105, 0.08, 0.05, 0.02)); }
  if (out === 'chef') { body.add(mesh(new T.BoxGeometry(0.2 * W, 0.3, 0.02), mat('#ffffff'), 0, 0.82, 0.115)); }
  if (out === 'doctor') { body.add(mesh(new T.BoxGeometry(0.34 * W, 0.5, 0.02), mat('#ffffff', { roughness: 0.8 }), 0, 0.85, 0.112)); body.add(mesh(new T.TorusGeometry(0.05, 0.008, 6, 20), mat('#9A8C98', { metalness: 0.6 }), 0, 0.95, 0.125)); }
  if (out === 'soccer') { body.add(mesh(new T.CircleGeometry(0.05, 20), mat('#ffffff'), 0, 0.95, 0.122)); }
  if (out === 'superhero') { const b = mesh(new T.CircleGeometry(0.06, 3), mat('#FFD60A', { emissive: new T.Color('#FFB703'), emissiveIntensity: 0.3 }), 0, 0.96, 0.122); b.rotation.z = Math.PI / 2; body.add(b); put(body, mesh(new T.TorusGeometry(0.15 * W, 0.02, 8, 30), mat('#FFD60A'), 0, 0.72, 0, 1, 1, 0.72)).rotation.x = Math.PI / 2; }
  if (out === 'astronaut') { body.add(mesh(new T.BoxGeometry(0.16, 0.12, 0.03), mat('#3A86FF'), 0, 0.94, 0.12)); for (let i = 0; i < 3; i++) body.add(mesh(SPH_LO, mat(['#FF2D55', '#FFD60A', '#38E54D'][i]), -0.04 + i * 0.04, 0.94, 0.14, 0.012)); }

  // Arms, posed. Shoulder at (±0.18, 1.06).
  const pose = P.pose || 'stand';
  const sleeve = { tee: 'short', stripes: 'short', long: 'long', hoodie: 'long', tank: 'none', dress: 'short', gown: 'short', suit: 'long' }[topKind] || 'short';
  const ARM = {
    stand: [[0.05, -0.27, 0.01], [0.07, -0.25, 0.03]], wave: [[0.18, 0.1, 0.02], [0.02, 0.24, 0.04]],
    hips: [[0.15, -0.16, -0.02], [-0.11, -0.12, 0.05]], cheer: [[0.13, 0.22, 0.01], [0.05, 0.24, 0.02]], shy: [[0.02, -0.25, 0.08], [-0.08, -0.12, 0.13]],
  };
  for (const s of [-1, 1]) {
    // The right arm (s = 1, her right is the viewer's left) waves; both arms move for hips and cheer.
    const use = (pose === 'wave' && s === 1) || pose === 'hips' || pose === 'cheer' || pose === 'shy' ? ARM[pose] : ARM.stand;
    const sh = new T.Vector3(-s * 0.175 * W, 1.055, 0);
    const el = sh.clone().add(new T.Vector3(-s * use[0][0], use[0][1], use[0][2]));
    const wr = el.clone().add(new T.Vector3(-s * use[1][0], use[1][1], use[1][2]));
    const up = sleeve === 'none' ? skin : topMat, low = sleeve === 'long' ? topMat : skin;
    body.add(limb(sh, el, 0.047 * W, up));
    if (sleeve === 'short') body.add(limb(sh, sh.clone().lerp(el, 0.55), 0.056 * W, topMat));
    body.add(limb(el, wr, 0.04 * W, low));
    const hand = mesh(SPH, skin, wr.x, wr.y - 0.035 * Math.sign(use[1][1] >= 0 ? -1 : 1), wr.z, 0.042, 0.052, 0.03);
    body.add(hand); parts['hand' + s] = hand;
    body.add(mesh(SPH, sleeve === 'none' ? skin : topMat, -s * 0.175 * W, 1.055, 0, 0.062 * W, 0.05, 0.058));   // shoulder
  }
  // Neck and head.
  body.add(mesh(CYL, skin, 0, 1.17, 0, 0.058, 0.1, 0.055));
  const head = new T.Group(); head.position.set(0, 1.375, 0.005); avatar.add(head); parts.head = head;
  head.position.y = 1.375 * H;
  if (pose === 'shy') head.rotation.set(0.12, 0.18, 0.08);
  const R = 0.19;
  const skull = new T.Mesh(headGeometry(P.face), skin); skull.scale.setScalar(R); skull.castShadow = true; head.add(skull);
  // Ears, unless her hair covers them.
  if ((HAIR_STYLE[P.hair] || HAIR_STYLE.long)[1] > -0.02) for (const s of [-1, 1]) head.add(mesh(SPH, skin, s * R * 0.98, -0.005, -0.01, 0.028, 0.045, 0.02));
  // Eyes
  const eyeY = -0.002, eyeX = 0.07, eyeZ = R * 0.86, er = 0.037;
  const wide = { round: 1, almond: 1.08, wide: 1.12, sleepy: 1 }[P.eyeShape];
  const lidDrop = { round: 0.18, almond: 0.36, wide: 0.08, sleepy: 0.55 }[P.eyeShape];
  parts.lids = [];
  for (const s of [-1, 1]) {
    const eg = new T.Group(); eg.position.set(s * eyeX, eyeY, eyeZ - 0.012); eg.rotation.y = s * 0.22; head.add(eg);
    eg.add(mesh(SPH, mat('#ffffff', { roughness: 0.25 }), 0, 0, 0, er * wide, er, er * 0.9));
    const iris = mesh(new T.CircleGeometry(er * 0.62, 32), mat(P.eyeColor, { roughness: 0.25 }), 0, 0, er * 0.9 + 0.001); eg.add(iris);
    eg.add(mesh(new T.CircleGeometry(er * 0.3, 24), mat('#0b0710', { roughness: 0.2 }), 0, 0, er * 0.9 + 0.002));
    eg.add(mesh(new T.CircleGeometry(er * 0.14, 12), new T.MeshBasicMaterial({ color: '#ffffff' }), -er * 0.22, er * 0.24, er * 0.9 + 0.003));
    // Upper lid: a skin cap over the top of the eye; lower it to shape the eye.
    const lid = new T.Mesh(new T.SphereGeometry(er * 1.08, 24, 12, 0, Math.PI * 2, 0, Math.PI * (0.25 + lidDrop * 0.4)), skin);
    lid.scale.set(wide, 1, 0.98); lid.rotation.x = -0.25; eg.add(lid); parts.lids.push(lid); lid.userData.open = lid.scale.y;
    if (P.eyeShape === 'almond') { const low = new T.Mesh(new T.SphereGeometry(er * 1.06, 24, 8, 0, Math.PI * 2, Math.PI * 0.78, Math.PI * 0.22), skin); low.scale.x = wide; eg.add(low); }
    if (P.lashes) { const lash = mesh(new T.TorusGeometry(er * 1.02 * wide, er * 0.09, 6, 24, Math.PI * 0.8), mat('#1b1230'), 0, er * 0.22, er * 0.35, 1, 1, 1); lash.rotation.set(-1.0, 0, Math.PI * 0.1); lash.castShadow = false; eg.add(lash); }
    // Brow
    const bw = { natural: 0.009, thin: 0.006, thick: 0.013, arched: 0.008 }[P.brows], arch = P.brows === 'arched' ? 0.018 : 0.01;
    const curve = new T.QuadraticBezierCurve3(new T.Vector3(-s * 0.03, 0, 0), new T.Vector3(s * 0.005, arch, 0.006), new T.Vector3(s * 0.04, -0.004 - (P.eyeShape === 'sleepy' ? 0.006 : 0), -0.008));
    const brow = new T.Mesh(new T.TubeGeometry(curve, 16, bw, 6, false), mat(darker(P.hairColor, 0.25), { roughness: 0.8 }));
    brow.position.set(s * eyeX, eyeY + 0.052, eyeZ + 0.012); brow.castShadow = false; head.add(brow);
  }
  // Nose
  const nose = { button: [0.017, 0.016, 0.017], small: [0.013, 0.018, 0.015], wide: [0.024, 0.016, 0.017], long: [0.015, 0.028, 0.022] }[P.nose];
  head.add(mesh(SPH, skin, 0, -0.03, R * 0.98, nose[0], nose[1], nose[2]));
  for (const s of [-1, 1]) head.add(mesh(SPH, skin, s * nose[0] * 0.7, -0.038, R * 0.93, nose[0] * 0.5));
  // Mouth
  const lip = mat('#C2566B', { roughness: 0.45 });
  const mY = -0.088, mZ = R * 0.9;
  if (P.mouth === 'smile' || P.mouth === 'small') {
    const w = P.mouth === 'small' ? 0.024 : 0.036;
    const m = mesh(new T.TorusGeometry(w, 0.0065, 8, 24, Math.PI * 0.85), lip, 0, mY + w * 0.55, mZ - 0.004); m.rotation.z = Math.PI + Math.PI * 0.075; head.add(m);
  } else {
    const w = P.mouth === 'grin' ? 0.04 : 0.032;
    const sh = new T.Shape(); sh.moveTo(-w, 0); sh.quadraticCurveTo(0, -w * 1.25, w, 0); sh.quadraticCurveTo(0, -w * 0.15, -w, 0);
    const m = mesh(new T.ShapeGeometry(sh, 16), mat('#5a1626', { roughness: 0.5 }), 0, mY + 0.012, mZ + 0.003); m.castShadow = false; head.add(m);
    if (P.mouth === 'grin') { const t = new T.Shape(); t.moveTo(-w * 0.8, -0.002); t.quadraticCurveTo(0, -w * 0.35, w * 0.8, -0.002); t.lineTo(-w * 0.8, -0.002); head.add(mesh(new T.ShapeGeometry(t, 12), new T.MeshBasicMaterial({ color: '#ffffff' }), 0, mY + 0.012, mZ + 0.005)); }
    else head.add(mesh(SPH_LO, mat('#E8707F'), 0, mY - 0.004, mZ - 0.002, 0.016, 0.008, 0.006));
  }
  if (P.blush) for (const s of [-1, 1]) { const b = mesh(new T.CircleGeometry(0.024, 24), new T.MeshBasicMaterial({ color: '#FF7F9E', transparent: true, opacity: 0.32, depthWrite: false }), s * 0.098, -0.035, R * 0.86); b.rotation.y = s * 0.55; b.castShadow = false; head.add(b); }
  if (P.freckles) { const fm = mat(darker(P.skin, 0.35)); for (let i = 0; i < 14; i++) { const s = i % 2 ? 1 : -1, a = (i >> 1) / 7; const f = mesh(SPH_LO, fm, s * (0.035 + a * 0.06), -0.02 - (a * 37 % 1) * 0.025, R * (0.93 - a * 0.06), 0.0035); f.castShadow = false; head.add(f); } }

  buildHair(head, P, R);
  if (P.shades) buildShades(head, P.shades, R); else if (P.glasses !== 'none') buildGlasses(head, P.glasses, P.glassesColor, R);
  if (P.hat) buildHat(head, P.hat, P.hairColor, R);
  if (out === 'astronaut') { const helm = new T.Mesh(new T.SphereGeometry(R * 1.55, 32, 24), new T.MeshPhysicalMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false })); head.add(helm); put(body, mesh(new T.TorusGeometry(0.11, 0.03, 10, 30), mat('#C0C8D8', { metalness: 0.5, roughness: 0.3 }), 0, 1.13, 0, 1, 1, 0.9)).rotation.x = Math.PI / 2; }
  if (out === 'chef') { head.add(mesh(CYL, mat('#ffffff', { roughness: 0.9 }), 0, R * 1.0, -0.01, R * 0.95, R * 0.7, R * 0.95)); head.add(mesh(SPH, mat('#ffffff', { roughness: 0.9 }), 0, R * 1.45, -0.01, R * 1.2, R * 0.55, R * 1.2)); }
  if (out === 'superhero') { const mask = mesh(new T.TorusGeometry(0.085, 0.02, 8, 30), mat('#FF2D55'), 0, eyeY, R * 0.8, 1.15, 0.45, 1); head.add(mask); }
  if (P.neck) buildNeck(body, P.neck, W);
  if (P.back) buildBack(body, P.back, W, P.hairColor);
  if (out === 'superhero' && P.back !== 'cape') buildBack(body, 'cape', W, '#FF2D55');
  if (P.pet) buildPet(P.pet);
  if (P.sparkle) buildSparkle(P.sparkle, H);
  parts.H = H;
}

// Hair is one continuous surface, like a hood: a dome over the head that keeps going down into the length, open only
// at the face. Each column runs from the crown to its own tip (shorter at the sides, longer at the back), and the
// face opening widens below the hairline, so there are no separate pieces and no gaps. A soft rolled edge runs all
// the way round the opening and the tips. Ponytails, pigtails, braids and buns start inside this hair, under a tie.
const HAIR_STYLE = {
  //          hairline  sideTip backTip  open(×π) vol   flare tuck  bump
  short:    [0.115,    0.03,   -0.2,   0.42,    1.0,  0,    0,    0],
  pixie:    [0.085,    0.0,    -0.19,  0.42,    1.0,  0,    0,    0.012],
  bob:      [0.078,   -0.15,   -0.17,   0.36,    1.03, 0.08, 0.14, 0],
  long:     [0.09,    -0.42,   -0.48,   0.36,    1.02, 0.22, 0.05, 0],
  ponytail: [0.13,     0.03,   -0.2,  0.42,    1.0,  0,    0,    0],
  pigtails: [0.082,    0.02,   -0.2,   0.42,    1.0,  0,    0,    0],
  braids:   [0.082,    0.02,   -0.2,   0.42,    1.0,  0,    0,    0],
  bun:      [0.13,     0.03,   -0.2,  0.42,    1.0,  0,    0,    0],
  curly:    [0.085,   -0.24,   -0.29,   0.36,    1.07, 0.3,  0.08, 0.05],
  afro:     [0.12,    -0.05,   -0.13,   0.40,    1.34, 0.0,  0.28, 0.045],
};
// How far the head's surface is from its centre line at height y (head units) in direction phi (0 = front).
function skullTable(R, shape) {
  const len = HEAD.len[shape];
  return (y, phi) => {
    const uy = Math.max(-1, Math.min(1, y / (R * len))), ring = Math.sqrt(1 - uy * uy), [kx, kb, kf] = headScale(shape, uy);
    const rx = ring * kx, rz = ring * (Math.cos(phi) > 0 ? kf : kb);
    return R / Math.sqrt(Math.pow(Math.sin(phi) / Math.max(1e-4, rx), 2) + Math.pow(Math.cos(phi) / Math.max(1e-4, rz), 2));
  };
}
function hairGeometry(R, cfg, shape) {
  const skullAt = skullTable(R, shape || 'round');
  const [hairline, sideTip, backTip, openK, vol, flare, tuck, bump] = cfg;
  const r = R * 1.075 * vol, ys = 1.12 / vol * (vol > 1.2 ? 1.05 : 1), yOff = vol > 1.2 ? 0.03 : 0.004, zOff = vol > 1.2 ? -0.03 : -0.004;
  const open = Math.PI * openK, yEar = -0.01;
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const tipAt = phi => sideTip + (backTip - sideTip) * (1 - Math.cos(phi)) / 2;
  const openAt = y => open * ss(hairline + 0.012, hairline - 0.035, y);
  // A point on a column at angle phi (0 = front), a fraction s of the way from the crown to the tip.
  function point(phi, s, out) {
    const tip = tipAt(phi), yEnd = Math.max(tip, yEar);
    const thEnd = Math.acos(Math.max(-0.999, Math.min(0.999, (yEnd - yOff) / (r * ys))));
    const arc = r * thEnd, drop = Math.max(0, yEnd - tip), L = arc + drop, d = s * L;
    let rr, y, c = 0;
    if (d <= arc) { const th = d / r; rr = r * Math.sin(th); y = r * ys * Math.cos(th) + yOff; }
    else { c = (d - arc) / Math.max(1e-6, drop); rr = r * Math.sin(thEnd) * (1 + flare * ss(0, 1, c)); y = yEnd - (d - arc); }
    rr *= 1 - tuck * ss(0.75, 1, s);
    // Short hair that ends on the head (at the nape or above the ears) lies down onto it at the ends instead of
    // standing off it like a brim.
    if (tip > -0.21 && y < 0.06) { const skull = skullAt(y, phi) + 0.01; rr += (Math.min(rr, skull) - rr) * ss(0.5, 1, s); }
    if (bump) rr *= 1 + bump * Math.sin(phi * 11 + y * 38) * Math.cos(y * 31 - phi * 5) * ss(0.05, 0.25, s);
    const back = c > 0 ? 0.05 * ss(0, 1, c) * Math.abs(Math.sin(phi)) : 0;
    out.set(rr * Math.sin(phi), y, rr * Math.cos(phi) + zOff - back);
    return y;
  }
  const NU = 96, NS = 60, pos = [], v = new T.Vector3(), edgeL = [], edgeR = [], bottom = [];
  for (let j = 0; j <= NS; j++) {
    const s = j / NS;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      // The opening depends on height and the height on the column: settle both in a few steps.
      let phi = u * Math.PI * 2, y = 1;
      for (let k = 0; k < 4; k++) { const o = openAt(y); phi = o + u * (Math.PI * 2 - 2 * o); y = point(phi, s, v); }
      pos.push(v.x, v.y, v.z);
      if (i === 0) edgeL.push(v.clone()); if (i === NU) edgeR.push(v.clone()); if (j === NS) bottom.push(v.clone());
    }
  }
  const idx = [];
  for (let j = 0; j < NS; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + NU + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // Where the two sides of the hair meet (above the face), share one normal so no line shows.
  const n = g.attributes.normal, P = g.attributes.position;
  for (let j = 0; j <= NS; j++) {
    const a = j * (NU + 1), b = a + NU;
    if (Math.hypot(P.getX(a) - P.getX(b), P.getY(a) - P.getY(b), P.getZ(a) - P.getZ(b)) > 1e-4) continue;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  // The rolled edge: up the left of the opening, along the tips, down the right (closing over the face where they meet).
  const firstOpen = edgeL.findIndex((p, k) => p.distanceTo(edgeR[k]) > 0.002);
  const rim = [...edgeL.slice(Math.max(0, firstOpen - 1)), ...bottom.slice(1, -1), ...edgeR.slice(Math.max(0, firstOpen - 1)).reverse()];
  return { surface: g, rim: new T.TubeGeometry(new T.CatmullRomCurve3(rim), Math.max(60, rim.length * 2), 0.0055 * Math.max(1, vol), 8, false), r };
}
function buildHair(head, P, R) {
  const hm = new T.MeshStandardMaterial({ color: P.hairColor, roughness: 0.5, metalness: 0.05, side: T.DoubleSide });
  const style = P.hair, cfg = HAIR_STYLE[style] || HAIR_STYLE.long;
  const g = hairGeometry(R, cfg, P.face);
  const surf = new T.Mesh(g.surface, hm); surf.castShadow = true; head.add(surf);
  const rim = new T.Mesh(g.rim, hm); rim.castShadow = true; head.add(rim);
  const tie = (x, y, z, rx, ry) => { const t = mesh(new T.TorusGeometry(0.026, 0.01, 8, 18), mat('#FF4F8B', { roughness: 0.4 }), x, y, z); t.rotation.set(rx || 0, ry || 0, 0); head.add(t); };
  // A tail of hair along a curve, thick at the root and narrowing to a rounded tip.
  const tail = (pts, r0, r1) => {
    const curve = new T.CatmullRomCurve3(pts), tg = new T.TubeGeometry(curve, 40, 1, 14, false), p = tg.attributes.position;
    const segs = 41, ring = 15;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1), c = curve.getPointAt(t), rad = r0 + (r1 - r0) * t, bulge = 1 + 0.25 * Math.sin(Math.min(1, t * 1.6) * Math.PI);
      for (let k = 0; k < ring; k++) { const q = i * ring + k; const x = p.getX(q) - c.x, y = p.getY(q) - c.y, z = p.getZ(q) - c.z; const l = Math.hypot(x, y, z) || 1; p.setXYZ(q, c.x + x / l * rad * bulge, c.y + y / l * rad * bulge, c.z + z / l * rad * bulge); }
    }
    tg.computeVertexNormals(); const m = new T.Mesh(tg, hm); m.castShadow = true; head.add(m);
    head.add(mesh(SPH, hm, pts[pts.length - 1].x, pts[pts.length - 1].y, pts[pts.length - 1].z, r1 * 1.0));
  };
  const V = (x, y, z) => new T.Vector3(x, y, z), b = g.r;
  switch (style) {
    case 'ponytail': tail([V(0, 0.06, -b * 0.8), V(0, 0.05, -b * 1.12), V(0, -0.06, -b * 1.28), V(0, -0.2, -b * 1.22), V(0, -0.33, -b * 1.12)], 0.05, 0.022); tie(0, 0.052, -b * 1.03); break;
    case 'pigtails': for (const s of [-1, 1]) { tail([V(s * b * 0.8, 0.02, -0.04), V(s * b * 1.08, 0.0, -0.05), V(s * b * 1.22, -0.08, -0.06), V(s * b * 1.2, -0.18, -0.05), V(s * b * 1.12, -0.26, -0.03)], 0.045, 0.022); tie(s * b * 1.02, 0.005, -0.048, 0, Math.PI / 2); } break;
    case 'braids': for (const s of [-1, 1]) { tie(s * b * 1.0, -0.035, -0.035, Math.PI / 2, 0);
      for (let i = 0; i < 9; i++) { const y = -0.06 - i * 0.036, w = 0.034 - i * 0.0014; head.add(mesh(SPH, hm, s * (b * 0.98 + (i % 2 ? 0.006 : -0.004)), y, -0.03 + (i % 2 ? 0.006 : -0.006), w, 0.028, w)); }
      tie(s * b * 0.98, -0.39, -0.03, Math.PI / 2, 0); } break;
    case 'bun': head.add(mesh(SPH, hm, 0, b * 0.92, -b * 0.62, 0.085, 0.078, 0.085)); tie(0, b * 0.84, -b * 0.54, 0.9, 0); break;
  }
}
function buildGlasses(head, kind, color, R) {
  const m = mat(color, { roughness: 0.35, metalness: 0.3 }), z = R * 0.96, y = 0.015;
  for (const s of [-1, 1]) {
    let ring;
    if (kind === 'round') ring = new T.TorusGeometry(0.037, 0.0055, 8, 32);
    if (kind === 'round') { const r = mesh(ring, m, s * 0.068, y, z); head.add(r); }
    else {
      const w = kind === 'cateye' ? 0.044 : 0.04, h = kind === 'cateye' ? 0.028 : 0.031;
      const frame = new T.Group(); frame.position.set(s * 0.068, y, z);
      for (const [a, b] of [[[-w, -h], [w, -h]], [[w, -h], [w, h]], [[w, h], [-w, h]], [[-w, h], [-w, -h]]]) frame.add(limb(new T.Vector3(a[0], a[1], 0), new T.Vector3(b[0], b[1], 0), 0.0055, m));
      if (kind === 'cateye') frame.add(limb(new T.Vector3(-s * w, h, 0), new T.Vector3(-s * (w + 0.014), h + 0.014, 0), 0.006, m));
      head.add(frame);
    }
    head.add(limb(new T.Vector3(s * 0.108, y, z - 0.005), new T.Vector3(s * R * 0.99, y, -0.02), 0.004, m));
  }
  head.add(limb(new T.Vector3(-0.03, y + 0.004, z + 0.004), new T.Vector3(0.03, y + 0.004, z + 0.004), 0.005, m));
}
function buildShades(head, id, R) {
  const z = R * 0.97, y = 0.015, frame = mat('#2B2140', { roughness: 0.3 });
  const lensC = { sunglasses: '#20202a', heartglasses: '#FF2D78', starglasses: '#FFD60A' }[id];
  const lens = new T.MeshStandardMaterial({ color: lensC, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.92 });
  for (const s of [-1, 1]) {
    let g;
    if (id === 'heartglasses') { const h = new T.Shape(); h.moveTo(0, -0.035); h.bezierCurveTo(-0.05, 0, -0.035, 0.04, 0, 0.018); h.bezierCurveTo(0.035, 0.04, 0.05, 0, 0, -0.035); g = new T.ExtrudeGeometry(h, { depth: 0.006, bevelEnabled: false }); }
    else if (id === 'starglasses') { const st = new T.Shape(); for (let i = 0; i <= 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.02 : 0.046; i ? st.lineTo(Math.cos(a) * r, Math.sin(a) * r) : st.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g = new T.ExtrudeGeometry(st, { depth: 0.006, bevelEnabled: false }); }
    else g = new T.CylinderGeometry(0.042, 0.042, 0.006, 32).rotateX(Math.PI / 2);
    head.add(mesh(g, lens, s * 0.07, y, z));
    head.add(limb(new T.Vector3(s * 0.11, y + 0.01, z - 0.005), new T.Vector3(s * R * 0.99, y + 0.01, -0.02), 0.004, frame));
  }
  head.add(limb(new T.Vector3(-0.03, y + 0.01, z + 0.004), new T.Vector3(0.03, y + 0.01, z + 0.004), 0.005, frame));
}
function buildHat(head, id, hairColor, R) {
  const g = new T.Group(); g.position.y = R * 0.55; head.add(g);
  const gold = mat('#FFC93C', { metalness: 0.65, roughness: 0.25 });
  switch (id) {
    case 'cap': g.add(mesh(new T.SphereGeometry(R * 1.1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat('#3A86FF'), 0, -R * 0.08, 0)); { const b = mesh(new T.CylinderGeometry(R * 0.75, R * 0.75, 0.012, 32, 1, false, -Math.PI / 2, Math.PI), mat('#2B2140'), 0, -R * 0.06, R * 0.55, 1, 1, 0.9); g.add(b); } break;
    case 'beanie': g.add(mesh(new T.SphereGeometry(R * 1.12, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat('#FF2D55', { roughness: 0.95 }), 0, -R * 0.1, 0)); put(g, mesh(new T.TorusGeometry(R * 1.1, 0.025, 10, 40), mat('#ffffff', { roughness: 0.95 }), 0, -R * 0.1, 0)).rotation.x = Math.PI / 2; g.add(mesh(SPH, mat('#ffffff', { roughness: 0.95 }), 0, R * 1.02, 0, 0.05)); break;
    case 'sunhat': g.add(mesh(new T.CylinderGeometry(R * 1.65, R * 1.65, 0.01, 40), mat('#F2D7A0'), 0, -R * 0.15, 0)); g.add(mesh(new T.SphereGeometry(R * 1.08, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat('#F2D7A0'), 0, -R * 0.15, 0)); put(g, mesh(new T.TorusGeometry(R * 1.06, 0.02, 8, 40), mat('#FF4F8B'), 0, -R * 0.08, 0)).rotation.x = Math.PI / 2; break;
    case 'bow': { const c = mat('#FF4F8B', { roughness: 0.5 }); for (const s of [-1, 1]) { const w = mesh(new T.ConeGeometry(0.06, 0.12, 4), c, s * 0.07, R * 0.25, -R * 0.35); w.rotation.z = s * Math.PI / 2; g.add(w); } g.add(mesh(SPH, c, 0, R * 0.25, -R * 0.35, 0.03)); g.rotation.z = 0.35; break; }
    case 'party': put(g, mesh(new T.ConeGeometry(R * 0.6, R * 1.8, 32), mat('#9B5DE5'), R * 0.15, R * 1.05, 0)).rotation.z = -0.2; g.add(mesh(SPH, mat('#FFD60A'), R * 0.33, R * 1.9, 0, 0.035)); break;
    case 'catears': case 'bunnyears': { g.add(mesh(new T.TorusGeometry(R * 1.04, 0.01, 8, 40, Math.PI), mat('#2B2140'), 0, -R * 0.2, 0)); for (const s of [-1, 1]) { if (id === 'catears') { const e = mesh(new T.ConeGeometry(0.055, 0.1, 4), mat('#2B2140'), s * R * 0.62, R * 0.55, 0); e.rotation.z = -s * 0.3; g.add(e); const inner = mesh(new T.ConeGeometry(0.03, 0.06, 4), mat('#FF8FB5'), s * R * 0.62, R * 0.52, 0.02); inner.rotation.z = -s * 0.3; g.add(inner); } else { put(g, mesh(SPH, mat('#ffffff'), s * R * 0.42, R * 1.05, 0, 0.04, 0.13, 0.025)).rotation.z = -s * 0.15; put(g, mesh(SPH, mat('#FF8FB5'), s * R * 0.42, R * 1.05, 0.012, 0.022, 0.1, 0.015)).rotation.z = -s * 0.15; } } break; }
    case 'flowers': for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.add(mesh(SPH, mat(['#FF4F8B', '#FFD60A', '#ffffff', '#C77DFF'][i % 4]), Math.cos(a) * R * 1.0, R * 0.05 + Math.sin(a * 2) * 0.004, Math.sin(a) * R * 1.0, 0.03)); } break;
    case 'wizard': g.add(mesh(new T.CylinderGeometry(R * 1.7, R * 1.7, 0.012, 40), mat('#3A2A8A'), 0, -R * 0.1, 0)); g.add(mesh(new T.ConeGeometry(R * 1.0, R * 2.6, 32), mat('#3A2A8A'), 0, R * 1.2, -0.02)); for (let i = 0; i < 4; i++) g.add(mesh(SPH_LO, mat('#FFD60A', { emissive: new T.Color('#FFD60A'), emissiveIntensity: 0.5 }), Math.cos(i * 2) * R * 0.5, R * (0.4 + i * 0.4), Math.sin(i * 2) * R * 0.5 + R * 0.3 - i * 0.02, 0.015)); break;
    case 'unicorn': { const h = mesh(new T.ConeGeometry(0.035, 0.2, 24), mat('#FFF3B0', { metalness: 0.3, roughness: 0.3 }), 0, R * 0.62, R * 0.45); h.rotation.x = 0.35; g.add(h); for (let i = 0; i < 4; i++) put(g, mesh(new T.TorusGeometry(0.03 - i * 0.006, 0.004, 6, 16), mat('#FF8FB5'), 0, R * 0.38 + i * 0.035, R * 0.38 + i * 0.012)).rotation.x = Math.PI / 2 + 0.35; break; }
    case 'tiara': { const t = mesh(new T.TorusGeometry(R * 0.95, 0.008, 8, 40, Math.PI), mat('#E8E8F0', { metalness: 0.8, roughness: 0.2 }), 0, -R * 0.1, 0); t.rotation.x = -0.2; g.add(t); for (let i = 0; i < 5; i++) { const a = Math.PI * (0.2 + i * 0.15); g.add(mesh(new T.ConeGeometry(0.012, 0.04 + (i === 2 ? 0.03 : 0), 6), mat('#E8E8F0', { metalness: 0.8, roughness: 0.2 }), Math.cos(a) * R * 0.95, -R * 0.02 + (i === 2 ? 0.015 : 0), Math.sin(a) * R * 0.95 * 0.98)); } g.add(mesh(SPH, mat('#C77DFF', { metalness: 0.2, roughness: 0.1 }), 0, R * 0.12, R * 0.94, 0.016)); break; }
    case 'crown': { g.add(mesh(new T.CylinderGeometry(R * 0.85, R * 0.8, R * 0.45, 32, 1, true), new T.MeshStandardMaterial({ color: '#FFC93C', metalness: 0.65, roughness: 0.25, side: T.DoubleSide }), 0, R * 0.12, 0)); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.add(mesh(new T.ConeGeometry(0.025, 0.07, 8), gold, Math.cos(a) * R * 0.85, R * 0.42, Math.sin(a) * R * 0.85)); g.add(mesh(SPH_LO, mat(['#FF2D55', '#3A86FF', '#38E54D'][i % 3], { roughness: 0.1 }), Math.cos(a) * R * 0.87, R * 0.1, Math.sin(a) * R * 0.87, 0.014)); } break; }
  }
}
function buildNeck(body, id, W) {
  if (id === 'necklace') for (let i = 0; i < 18; i++) { const a = Math.PI * 0.1 + i / 17 * Math.PI * 0.8; body.add(mesh(SPH_LO, mat('#FFF8EE', { roughness: 0.2 }), Math.cos(a) * 0.085, 1.09 - Math.sin(a) * 0.05, Math.sin(a) * 0.07 + 0.02, 0.011)); }
  if (id === 'scarf') { put(body, mesh(new T.TorusGeometry(0.075, 0.032, 10, 30), mat('#FF2D55', { roughness: 0.95 }), 0, 1.12, 0, 1, 1, 0.9)).rotation.x = Math.PI / 2; body.add(mesh(new T.BoxGeometry(0.06, 0.22, 0.03), mat('#FF2D55', { roughness: 0.95 }), 0.05, 0.99, 0.11)); }
  if (id === 'bowtie') { for (const s of [-1, 1]) { const w = mesh(new T.ConeGeometry(0.03, 0.055, 4), mat('#FF2D55'), s * 0.03, 1.1, 0.085); w.rotation.z = s * Math.PI / 2; body.add(w); } body.add(mesh(SPH_LO, mat('#FF2D55'), 0, 1.1, 0.088, 0.014)); }
  if (id === 'medal') { put(body, mesh(new T.TorusGeometry(0.09, 0.008, 6, 30, Math.PI), mat('#3A86FF'), 0, 1.1, 0.04)).rotation.set(Math.PI * 0.6, 0, Math.PI); put(body, mesh(new T.CylinderGeometry(0.035, 0.035, 0.01, 24), mat('#FFC93C', { metalness: 0.7, roughness: 0.25 }), 0, 0.96, 0.115)).rotation.x = Math.PI / 2; }
}
function buildBack(body, id, W, hairColor) {
  const g = new T.Group(); g.position.set(0, 0.95, -0.1); body.add(g);
  const wingMat = (c, o) => new T.MeshStandardMaterial({ color: c, transparent: true, opacity: o || 0.7, side: T.DoubleSide, roughness: 0.3, emissive: new T.Color(c), emissiveIntensity: 0.15, depthWrite: false });
  const wing = (shape, m, s, rot) => { const w = new T.Mesh(new T.ShapeGeometry(shape, 24), m); w.scale.x = s; w.rotation.y = s * (rot || 0.45); return w; };
  switch (id) {
    case 'backpack': g.add(mesh(new T.BoxGeometry(0.22 * W, 0.26, 0.1), mat('#FF9F1C'), 0, -0.05, -0.02)); g.add(mesh(new T.BoxGeometry(0.16, 0.1, 0.03), mat('#FFD60A'), 0, -0.1, -0.075)); for (const s of [-1, 1]) g.add(mesh(new T.BoxGeometry(0.025, 0.28, 0.02), mat('#2B2140'), s * 0.07, 0.0, 0.1)); break;
    case 'cape': { const c = new T.Mesh(new T.CylinderGeometry(0.16 * W, 0.34 * W, 0.78, 32, 1, true, Math.PI * 0.6, Math.PI * 0.8), new T.MeshStandardMaterial({ color: hairColor && hairColor[0] === '#' && hairColor !== '#FF2D55' ? '#FF2D55' : '#FF2D55', roughness: 0.6, side: T.DoubleSide })); c.position.set(0, -0.25, 0.08); c.castShadow = true; g.add(c); break; }
    case 'fairy': case 'butterfly': case 'angel': case 'dragonwings': {
      const sh = new T.Shape();
      if (id === 'angel') { sh.moveTo(0, 0); for (let i = 0; i <= 6; i++) sh.quadraticCurveTo(0.12 + i * 0.05, 0.35 - i * 0.06, 0.08 + i * 0.055, 0.25 - i * 0.07); sh.lineTo(0, -0.05); }
      else if (id === 'dragonwings') { sh.moveTo(0, 0); sh.lineTo(0.15, 0.32); sh.lineTo(0.45, 0.22); sh.quadraticCurveTo(0.38, 0.1, 0.42, 0.0); sh.quadraticCurveTo(0.3, 0.02, 0.3, -0.08); sh.quadraticCurveTo(0.18, -0.02, 0.14, -0.14); sh.lineTo(0, 0); }
      else { sh.moveTo(0, 0); sh.bezierCurveTo(0.1, 0.42, 0.42, 0.42, 0.36, 0.12); sh.bezierCurveTo(0.34, 0.0, 0.1, 0.0, 0, 0); sh.bezierCurveTo(0.12, -0.04, 0.3, -0.12, 0.24, -0.26); sh.bezierCurveTo(0.18, -0.34, 0.04, -0.2, 0, 0); }
      const c = { fairy: '#9EE7FF', butterfly: '#FF9F1C', angel: '#ffffff', dragonwings: '#2EC4B6' }[id];
      const m = wingMat(c, id === 'angel' ? 0.95 : id === 'dragonwings' ? 0.9 : 0.62);
      for (const s of [-1, 1]) { const w = wing(sh, m, s, id === 'angel' ? 0.3 : 0.5); w.position.x = s * 0.02; w.castShadow = false; g.add(w); parts['wing' + s] = w; }
      if (id === 'butterfly') for (const s of [-1, 1]) g.add(mesh(SPH_LO, mat('#2B2140'), s * 0.2, 0.18, -0.04 - 0.1 * 0, 0.025));
      break; }
  }
}
// Pets sit at her feet, to her left.
function buildPet(id) {
  const g = new T.Group(); g.position.set(-0.55, 0, 0.25); g.rotation.y = 0.5; avatar.add(g);
  const eyes = (p, x, y, z, r, gap) => { for (const s of [-1, 1]) { p.add(mesh(SPH, mat('#ffffff', { roughness: 0.2 }), x + s * gap, y, z, r)); p.add(mesh(SPH, mat('#1b1230'), x + s * gap, y, z + r * 0.6, r * 0.6)); } };
  const legs = (c, sp, y, r, h) => { for (const [x, z] of [[-sp, sp], [sp, sp], [-sp, -sp], [sp, -sp]]) g.add(mesh(CYL, mat(c), x, y, z, r, h, r)); };
  if (id === 'cat' || id === 'fox' || id === 'dog') {
    const c = { cat: '#FF9F1C', fox: '#FF6B1A', dog: '#C77D3A' }[id];
    g.add(mesh(SPH, mat(c), 0, 0.17, 0, 0.11, 0.09, 0.15)); g.add(mesh(SPH, mat(c), 0, 0.28, 0.12, 0.085));
    legs(c, 0.06, 0.06, 0.022, 0.12); eyes(g, 0, 0.3, 0.19, 0.016, 0.034);
    g.add(mesh(SPH_LO, mat('#FF4F8B'), 0, 0.27, 0.205, 0.012));
    if (id === 'dog') for (const s of [-1, 1]) put(g, mesh(SPH, mat('#7A4A20'), s * 0.075, 0.29, 0.1, 0.025, 0.06, 0.03)).rotation.z = s * 0.3;
    else for (const s of [-1, 1]) put(g, mesh(new T.ConeGeometry(0.03, 0.06, 4), mat(c), s * 0.05, 0.37, 0.11)).rotation.z = -s * 0.2;
    if (id === 'fox') g.add(mesh(SPH_LO, mat('#ffffff'), 0, 0.255, 0.18, 0.04, 0.03, 0.03));
    const tail = mesh(SPH, mat(c), 0, 0.22, -0.18, 0.035, 0.035, id === 'fox' ? 0.13 : 0.1); tail.rotation.x = -0.6; g.add(tail);
  } else if (id === 'bunny') {
    g.add(mesh(SPH, mat('#F5F0FF'), 0, 0.12, 0, 0.1, 0.1, 0.12)); g.add(mesh(SPH, mat('#F5F0FF'), 0, 0.24, 0.07, 0.07));
    for (const s of [-1, 1]) put(g, mesh(SPH, mat('#F5F0FF'), s * 0.03, 0.36, 0.05, 0.018, 0.07, 0.012)).rotation.z = -s * 0.15;
    eyes(g, 0, 0.26, 0.125, 0.013, 0.028); g.add(mesh(SPH_LO, mat('#ffffff'), 0, 0.12, -0.12, 0.035));
  } else if (id === 'owl') {
    const perch = mesh(CYL, mat('#8B5A2B'), 0, 0.25, 0, 0.02, 0.5, 0.02); g.add(perch); put(g, mesh(CYL, mat('#8B5A2B'), 0, 0.5, 0, 0.012, 0.18, 0.012)).rotation.z = Math.PI / 2;
    g.add(mesh(SPH, mat('#9B5DE5'), 0, 0.6, 0, 0.07, 0.09, 0.065)); g.add(mesh(SPH, mat('#E7D3FF'), 0, 0.59, 0.04, 0.05, 0.065, 0.03));
    for (const s of [-1, 1]) { g.add(mesh(SPH, mat('#ffffff'), s * 0.028, 0.64, 0.055, 0.022)); g.add(mesh(SPH, mat('#FF9F1C'), s * 0.028, 0.64, 0.07, 0.012)); g.add(mesh(new T.ConeGeometry(0.012, 0.03, 4), mat('#9B5DE5'), s * 0.045, 0.69, 0)); }
  } else if (id === 'dragon') {
    const c = '#2EC4B6';
    g.add(mesh(SPH, mat(c), 0, 0.18, 0, 0.1, 0.1, 0.13)); g.add(mesh(SPH, mat(c), 0, 0.33, 0.07, 0.08)); g.add(mesh(SPH, mat('#9EF0E6'), 0, 0.16, 0.08, 0.07, 0.07, 0.05));
    eyes(g, 0, 0.35, 0.13, 0.016, 0.032); legs(c, 0.05, 0.06, 0.022, 0.12);
    for (const s of [-1, 1]) { g.add(mesh(new T.ConeGeometry(0.012, 0.05, 6), mat('#FFD60A'), s * 0.035, 0.42, 0.05)); const w = mesh(new T.ConeGeometry(0.08, 0.14, 3), mat('#FF4F8B'), s * 0.11, 0.26, -0.03); w.rotation.z = -s * 1.2; g.add(w); }
    const t = mesh(new T.ConeGeometry(0.04, 0.2, 8), mat(c), 0, 0.12, -0.18); t.rotation.x = -1.8; g.add(t);
  }
}
const floaters = [];
function buildSparkle(id, H) {
  floaters.length = 0;
  const g = new T.Group(); avatar.add(g); parts.sparkle = g;
  const n = id === 'stars' ? 10 : 22;
  for (let i = 0; i < n; i++) {
    let m;
    if (id === 'hearts') { const h = new T.Shape(); h.moveTo(0, -0.03); h.bezierCurveTo(-0.045, 0, -0.03, 0.035, 0, 0.015); h.bezierCurveTo(0.03, 0.035, 0.045, 0, 0, -0.03); m = new T.Mesh(new T.ShapeGeometry(h), new T.MeshBasicMaterial({ color: '#FF4F8B', side: T.DoubleSide, transparent: true, opacity: 0.9 })); }
    else if (id === 'stars') { const st = new T.Shape(); for (let k = 0; k <= 10; k++) { const a = Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.018 : 0.04; k ? st.lineTo(Math.cos(a) * r, Math.sin(a) * r) : st.moveTo(Math.cos(a) * r, Math.sin(a) * r); } m = new T.Mesh(new T.ShapeGeometry(st), new T.MeshBasicMaterial({ color: '#FFD60A', side: T.DoubleSide })); }
    else if (id === 'bubbles') m = new T.Mesh(SPH, new T.MeshPhysicalMaterial({ color: '#BDEFFF', transparent: true, opacity: 0.35, roughness: 0, metalness: 0.1, depthWrite: false }));
    else m = new T.Mesh(new T.OctahedronGeometry(0.012), new T.MeshBasicMaterial({ color: ['#FFF3B0', '#ffffff', '#FFD1F0', '#C7F0FF'][i % 4] }));
    if (id === 'bubbles') m.scale.setScalar(0.02 + Math.random() * 0.03);
    m.userData = { a: i / n * Math.PI * 2, r: id === 'stars' ? 0.55 : 0.35 + Math.random() * 0.3, y: id === 'stars' ? 1.0 * H : Math.random() * 1.7 * H, sp: 0.3 + Math.random() * 0.5, kind: id };
    g.add(m); floaters.push(m);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Camera, turning, idle life
// ---------------------------------------------------------------------------------------------------------------
let view = 'body', yaw = 0.25, yawGoal = 0.25;
const camGoal = { body: { y: 0.82, d: 4.6, look: 0.8 }, face: { y: 1.38, d: 1.45, look: 1.36 } };
let camNow = Object.assign({}, camGoal.body);
function setView(v) { view = v; [...$('views').children].forEach(b => b.classList.toggle('on', b.dataset.v === v)); }
function resize() { const w = stage.clientWidth || 1, h = stage.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(stage);
let drag = null;
stage.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; drag = { x: e.clientX, yaw: yawGoal }; stage.setPointerCapture(e.pointerId); });
stage.addEventListener('pointermove', e => { if (drag) yawGoal = drag.yaw + (e.clientX - drag.x) * 0.01; });
stage.addEventListener('pointerup', () => { drag = null; });
stage.addEventListener('pointercancel', () => { drag = null; });
$('turn').querySelectorAll('button').forEach(b => b.onclick = () => { yawGoal += +b.dataset.t * Math.PI / 4; });
$('views').querySelectorAll('button').forEach(b => b.onclick = () => setView(b.dataset.v));
const clock = new T.Clock(); let blinkAt = 2;
function frame() {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  yaw += (yawGoal - yaw) * Math.min(1, dt * 6); avatar.rotation.y = yaw;
  const H = parts.H || 1;
  const g = view === 'face' && parts.faceY ? { y: parts.faceY / H + 0.02, d: 1.45 * parts.headR / 0.19 + 0.15, look: parts.faceY / H - 0.02 } : camGoal[view];
  for (const k of ['y', 'd', 'look']) camNow[k] += (g[k] * (k === 'd' ? 1 : H) - camNow[k]) * Math.min(1, dt * 4);
  const aspect = camera.aspect, d = camNow.d * (aspect < 1 ? 1.25 / Math.max(0.6, aspect) : 1);
  camera.position.set(0, camNow.y, d); camera.lookAt(0, camNow.look, 0);
  // Breathing, a little sway, and a blink now and then.
  avatar.scale.y = 1 + Math.sin(t * 2.1) * 0.004;
  if (parts.head) parts.head.rotation.z = (parts.head.userData.rz || 0) + Math.sin(t * 0.7) * 0.02;
  if (parts.real) { const b = t > blinkAt && t < blinkAt + 0.16 ? 1 : 0; REAL.tick(t, b); if (t > blinkAt + 0.2) blinkAt = t + 2.5 + Math.random() * 3; }
  if (parts.lids) { const b = t > blinkAt ? Math.min(1, (t - blinkAt) / 0.08) : 0; const close = b > 0 && t < blinkAt + 0.16; parts.lids.forEach(l => { l.scale.y = close ? 1.9 : 1; }); if (t > blinkAt + 0.2) blinkAt = t + 2.5 + Math.random() * 3; }
  for (const s of [-1, 1]) if (parts['wing' + s]) parts['wing' + s].rotation.y = s * (0.5 + Math.sin(t * 2.4) * 0.12);
  for (const f of floaters) { const u = f.userData; u.a += dt * u.sp * 0.6; if (u.kind === 'stars') { f.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(u.a * 2) * 0.05, Math.sin(u.a) * u.r); f.rotation.y = -u.a; } else { u.y += dt * u.sp * 0.25; if (u.y > 1.9) u.y = 0.05; f.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r); f.lookAt(camera.position); } }
  renderer.render(scene, camera);
  if (portraitDue && showingDesign()) { portraitDue = false; sendHome(true); }
}
renderer.setAnimationLoop(frame);

// The home screen portrait: head and shoulders on a clear background, 384 pixels square.
let pr = null, pcam = null;
function portrait() {
  if (!pr) { pr = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); pr.setSize(384, 384, false); pr.setPixelRatio(1); pr.outputEncoding = renderer.outputEncoding; pr.toneMapping = renderer.toneMapping; pr.toneMappingExposure = renderer.toneMappingExposure; pcam = new T.PerspectiveCamera(30, 1, 0.05, 50); }
  const H = parts.H || 1, bg = scene.background, fog = scene.fog, ry = avatar.rotation.y, sp = parts.sparkle;
  scene.background = null; scene.fog = null; backdrop.visible = false; avatar.rotation.y = 0.22; if (sp) sp.visible = false;
  // Frame the head and a little of the shoulders; step back for tall hats and big hair.
  const tall = (S.design.hat && ['wizard', 'party', 'unicorn', 'crown', 'bunnyears', 'tiara'].includes(S.design.hat)) || S.design.outfit === 'chef' || S.design.outfit === 'astronaut' ? 1 : 0;
  const big = ['afro', 'bun', 'hair-afro', 'hair-curls', 'hair-bun', 'hair-braid-bun'].includes(S.design.hair) ? 0.5 : 0;
  const hy = (parts.faceY || 1.375 * H) + floorY, k = parts.headR ? parts.headR / 0.19 : 1;
  const back = parts.real ? 0.04 : 0, drop = parts.real ? 0.035 : 0;   // real heads are smaller; show a little more of her
  pcam.position.set(0, hy + (0.02 + (tall + big) * 0.04) * k, (1.45 + (tall + big) * 0.3) * k + back); pcam.lookAt(0, hy + (-0.06 + (tall + big) * 0.05) * k - drop + 0.03, 0);
  pr.setClearColor(0x000000, 0); pr.render(scene, pcam);
  scene.background = bg; scene.fog = fog; backdrop.visible = true; avatar.rotation.y = ry; if (sp) sp.visible = true;
  return pr.domElement.toDataURL('image/png');
}

// ---------------------------------------------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------------------------------------------
const CATS = [
  { id: 'body', e: '🧍', name: 'Body', view: 'body' }, { id: 'face', e: '🙂', name: 'Face', view: 'face' },
  { id: 'eyes', e: '👀', name: 'Eyes', view: 'face' }, { id: 'hair', e: '💇', name: 'Hair', view: 'face' },
  { id: 'clothes', e: '👕', name: 'Clothes', view: 'body' }, { id: 'pose', e: '🙋', name: 'Pose', view: 'body' }, null,
  { id: 'hat', e: '👑', name: 'Hats', view: 'face', shop: ['hat'] }, { id: 'acc', e: '🎒', name: 'Extras', view: 'body', shop: ['shades', 'neck', 'back'] },
  { id: 'outfit', e: '🦸', name: 'Outfits', view: 'body', shop: ['outfit'] }, { id: 'pet', e: '🐶', name: 'Pets', view: 'body', shop: ['pet'] },
  { id: 'place', e: '🏞️', name: 'Places', view: 'body', shop: ['place'] }, { id: 'sparkle', e: '✨', name: 'Sparkles', view: 'body', shop: ['sparkle'] },
];
let cat = 'body', trying = null;      // trying: a shop item shown on her before she buys it
function nav() {
  const n = $('nav'); n.innerHTML = '';
  for (const c of CATS) {
    if (!c) { const s = document.createElement('div'); s.className = 'sep'; n.appendChild(s); continue; }
    const b = document.createElement('button'); b.className = c.id === cat ? 'on' : ''; b.dataset.c = c.id;
    b.innerHTML = `<span class="e">${c.e}</span>${c.name}${c.shop ? ' ⭐' : ''}`;
    b.onclick = () => { cat = c.id; stopTrying(); setView(c.view); nav(); render(); };
    n.appendChild(b);
  }
}
function set(k, v) { S.design[k] = v; persist(); if (k === 'place') buildPlace(v); rebuild(); render(); }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function opts(title, k, list) {
  const p = $('panel'); p.appendChild(el('h3', '', title)); const r = el('div', 'row'); p.appendChild(r);
  for (const [v, name] of list) { const b = el('button', 'opt' + (S.design[k] === v ? ' on' : ''), name); b.dataset.k = k; b.dataset.v = v; b.onclick = () => set(k, v); r.appendChild(b); }
}
function swatches(title, k, colors, priced) {
  const p = $('panel'); p.appendChild(el('h3', '', title)); const r = el('div', 'row'); p.appendChild(r);
  for (const c of colors) {
    const b = el('button', 'sw' + (S.design[k] === c ? ' on' : '')); b.style.background = c; b.dataset.k = k; b.dataset.v = c; b.title = c;
    const dye = priced && SHOP.find(i => i.color === c);
    if (dye && !S.owned.includes(dye.id)) { const pp = el('span', 'p', '⭐' + dye.price); b.appendChild(pp); b.onclick = () => tryOn(dye); }
    else b.onclick = () => set(k, c);
    r.appendChild(b);
  }
}
function toggle(title, k) { const p = $('panel'); p.appendChild(el('h3', '', title)); const r = el('div', 'row'); p.appendChild(r); for (const [v, n] of [[true, 'Yes'], [false, 'No']]) { const b = el('button', 'opt' + (S.design[k] === v ? ' on' : ''), n); b.dataset.k = k; b.dataset.v = String(v); b.onclick = () => set(k, v); r.appendChild(b); } }
function render() {
  const p = $('panel'); p.innerHTML = ''; const c = CATS.find(x => x && x.id === cat);
  p.appendChild(el('h2', '', c.e + ' ' + c.name));
  $('balance').innerHTML = ''; $('balance').append('⭐ ' + balance()); const sm = el('small', '', 'to spend'); $('balance').appendChild(sm);
  if (REAL && !REAL.failed && renderReal()) return;
  switch (cat) {
    case 'body': swatches('Skin', 'skin', SKIN); opts('Height', 'height', LOOK.height); opts('Build', 'build', LOOK.build); break;
    case 'face': opts('Face shape', 'face', LOOK.face); opts('Nose', 'nose', LOOK.nose); opts('Mouth', 'mouth', LOOK.mouth); toggle('Freckles', 'freckles'); toggle('Rosy cheeks', 'blush'); break;
    case 'eyes': opts('Eye shape', 'eyeShape', LOOK.eyeShape); swatches('Eye color', 'eyeColor', EYES); opts('Eyebrows', 'brows', LOOK.brows); toggle('Eyelashes', 'lashes'); opts('Glasses', 'glasses', LOOK.glasses); if (S.design.glasses !== 'none') swatches('Glasses color', 'glassesColor', GLASSCOL); break;
    case 'hair': opts('Hair style', 'hair', LOOK.hair); swatches('Hair color', 'hairColor', HAIR); swatches('Fun colors ⭐', 'hairColor', Object.keys(DYES), true); break;
    case 'clothes': opts('Top', 'top', LOOK.top); swatches('Top color', 'topColor', CLOTH); if (S.design.top !== 'dress') { opts('Bottoms', 'bottom', LOOK.bottom); swatches('Bottoms color', 'bottomColor', CLOTH); } opts('Shoes', 'shoes', LOOK.shoes); swatches('Shoe color', 'shoesColor', SHOECOL);
      if (S.design.outfit) p.appendChild(el('h3', '', 'You are wearing an outfit from the Outfits shop. Take it off there to see these clothes.')); break;
    case 'pose': opts('Pose', 'pose', LOOK.pose); break;
    default: shop(c);
  }
}
// The panels for the realistic avatar: real clothes and hair, and sliders for the face.
function renderReal() {
  const p = $('panel'), d = S.design, tints = id => REAL.tints(id);
  switch (cat) {
    case 'body': swatches('Skin', 'skin', SKIN); toggle('Freckles', 'freckles'); opts('Height', 'height', LOOK.height); opts('Build', 'build', LOOK.build); return true;
    case 'face': opts('Face shape', 'face', LOOK.face); opts('Mouth', 'mouth', LOOK.mouth); sliders('Make it look like you', REAL.TUNE); opts('Earrings', 'earrings', LOOK.earrings); return true;
    case 'eyes': swatches('Eye color', 'eyeColor', EYES); opts('Eyebrows', 'brows', LOOK.brows); toggle('Eyelashes', 'lashes'); opts('Glasses', 'glasses', LOOK.glasses); return true;
    case 'hair': opts('Hair style', 'hair', LOOK.hair); swatches('Hair color', 'hairColor', HAIR); swatches('Fun colors ⭐', 'hairColor', Object.keys(DYES), true); return true;
    case 'clothes':
      if (d.outfit) p.appendChild(el('h3', '', 'You are wearing an outfit from the Outfits shop. Take it off there to see these clothes.'));
      opts('Top or dress', 'top', LOOK.top); if (tints(d.top)) swatches('Top color', 'topColor', CLOTH);
      if (!REAL.isDress(d.top)) { opts('Bottoms', 'bottom', LOOK.bottom); if (tints(d.bottom)) swatches('Bottoms color', 'bottomColor', CLOTH); }
      opts('Socks', 'socks', LOOK.socks); opts('Shoes', 'shoes', LOOK.shoes); if (tints(d.shoes)) swatches('Shoe color', 'shoesColor', SHOECOL);
      return true;
    case 'pose': opts('Pose', 'pose', LOOK.pose); return true;
  }
  return false;
}
let tuneT = null;
function sliders(title, list) {
  const p = $('panel'); p.appendChild(el('h3', '', title));
  const box = el('div', 'sliders'); p.appendChild(box);
  for (const [k, name] of list) {
    const row = el('label', 'slide'); row.appendChild(el('span', '', name));
    const r = document.createElement('input'); r.type = 'range'; r.min = -100; r.max = 100; r.step = 5; r.dataset.k = k;
    r.value = Math.round(((S.design.tune || {})[k] || 0) * 100);
    r.oninput = () => { S.design.tune = Object.assign({}, S.design.tune, { [k]: +r.value / 100 }); rebuild(); clearTimeout(tuneT); tuneT = setTimeout(() => persist(), 400); };
    r.ondblclick = () => { r.value = 0; r.oninput(); };
    row.appendChild(r); box.appendChild(row);
  }
  const reset = el('button', 'opt', 'Start over'); reset.onclick = () => { S.design.tune = {}; persist(); rebuild(); render(); }; p.appendChild(reset);
}
function shop(c) {
  const p = $('panel');
  p.appendChild(el('h3', '', 'Tap to try it on. Buy it with your stars to keep it.'));
  for (const slot of c.shop) {
    const names = { hat: 'Hats', shades: 'Fun glasses', neck: 'Around your neck', back: 'On your back', outfit: 'Outfits', pet: 'Pets', place: 'Places', sparkle: 'Sparkles' };
    if (c.shop.length > 1) p.appendChild(el('h3', '', names[slot]));
    const r = el('div', 'row'); p.appendChild(r);
    for (const it of SHOP.filter(i => i.slot === slot)) {
      const own = S.owned.includes(it.id), on = S.design[slot] === it.id;
      const b = el('button', 'item' + (own ? ' owned' : '') + (on ? ' on' : '') + (trying === it ? ' trying' : '')); b.dataset.id = it.id;
      b.append(el('span', 'e', it.e), el('span', 'n', it.name), el('span', 'p', own ? (on ? 'Wearing' : 'Yours') : '⭐ ' + it.price));
      b.onclick = () => own ? set(slot, on ? null : it.id) : tryOn(it);
      r.appendChild(b);
    }
  }
}
function tryOn(it) {
  trying = it; const pv = {}; if (it.slot === 'dye') pv.hairColor = it.color; else pv[it.slot] = it.id;
  if (it.slot === 'place') buildPlace(it.id); rebuild(pv);
  const short = balance() < it.price;
  $('tryname').textContent = `${it.e} ${it.name}`; $('buy').textContent = short ? `⭐ ${it.price} (need ${it.price - balance()} more)` : `Buy for ⭐ ${it.price}`;
  $('buy').classList.toggle('short', short); $('tryon').classList.add('on'); render();
}
function stopTrying() { if (!trying) return; trying = null; $('tryon').classList.remove('on'); buildPlace(S.design.place); rebuild(); }
$('takeoff').onclick = () => { stopTrying(); render(); };
$('buy').onclick = () => {
  const it = trying; if (!it) return;
  if (balance() < it.price) return modal(`You need ${it.price - balance()} more stars for the ${it.name}. Play your games to earn more!`, [['OK', null]]);
  modal(`Buy the ${it.name} for ${it.price} stars?`, [['Yes!', () => buy(it)], ['Not now', null, 'no']]);
};
function buy(it) {
  if (S.owned.includes(it.id) || balance() < it.price) return false;
  S.owned.push(it.id); S.spent += it.price;
  if (it.slot === 'dye') S.design.hairColor = it.color; else S.design[it.slot] = it.id;
  trying = null; $('tryon').classList.remove('on'); persist(); buildPlace(S.design.place); rebuild(); render();
  say(`You got the ${it.name}!`); return true;
}
function modal(text, buttons) {
  $('mtext').textContent = text; const box = $('mbtns'); box.innerHTML = '';
  for (const [label, fn, cls] of buttons) { const b = el('button', cls || '', label); b.onclick = () => { $('modal').classList.remove('on'); if (fn) fn(); }; box.appendChild(b); }
  $('modal').classList.add('on');
}
function rebuild(preview) { lastPreview = preview || null; try { build(S.design, preview); } catch (e) { window.MY_AVATAR.errors.push(e.message); console.error(e); } }
function say(t) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.rate = 0.95; speechSynthesis.speak(u); } catch (e) {} }

// Stars earned in other apps change while she plays; check now and then while this app is open.
setInterval(() => { if (!document.hidden) { const b = $('balance').firstChild; if (b && b.textContent !== '⭐ ' + balance()) render(); } }, 5000);

window.MY_AVATAR = {
  errors: [], state: () => JSON.parse(JSON.stringify(S)), balance, earned, set, buy: id => buy(ITEM[id]), tryOn: id => tryOn(ITEM[id]), stopTrying,
  setCat: c => { cat = c; const x = CATS.find(y => y && y.id === c); setView(x.view); nav(); render(); }, setView, turn: a => { yawGoal = a; yaw = a; },
  portrait, sendHome, SHOP, LOOK, DEFAULT, homeOk: () => homeOk, parts: () => parts, restoreFromHome,
  HAT_FIT,
  three: { renderer, scene, camera, lights: { hemi, key, rim, fill } },
  portraitDue: () => portraitDue, showingDesign: () => showingDesign(),
  real: () => (REAL ? { ready: REAL.ready, failed: REAL.failed, need: REAL.need(Object.assign({}, S.design, lastPreview || {})), textures: !!REAL.texturesReady, errors: REAL.errors.slice() } : null),
};
buildPlace(S.design.place); rebuild(); nav(); render(); setView('body'); resize();
restoreFromHome().then(() => { if (!S.savedAt) persist(true); else sendHome(true); });
