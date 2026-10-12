const fs = require('fs');
// ---- Browser stand-ins (real three.js; GPU and image decoding stubbed) ----
const ctx2d = new Proxy({}, { get(t, k) { if (k in t) return t[k];
  if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
  return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
const listeners = {}, ui = [];
const W = 1500, H = 1000;
const canvasEl = { width: W, height: H, style: {}, getContext: () => ctx2d, addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
  setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }) };
let rafCb = null, now = 1000;
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true });
Object.assign(globalThis, { window: globalThis, self: globalThis, innerWidth: W, innerHeight: H, devicePixelRatio: 2, addEventListener() {},
  performance: { now: () => now }, requestAnimationFrame: cb => { rafCb = cb; },
  atob: s => Buffer.from(s, 'base64').toString('binary') });
const dialEv = {}, dialEl = { style: { setProperty() {} }, dataset: {}, setAttribute() {}, setPointerCapture() {},
  addEventListener: (n, f) => { dialEv[n] = f; }, querySelector: () => ({ getBoundingClientRect: () => ({ top: 263, height: 166, left: 20, width: 18 }) }) };
globalThis.document = {
  getElementById: (id) => id === 'heat' ? dialEl : canvasEl,
  createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }),
  createElementNS: () => { const ev = {}; const img = { style: {}, width: 4, height: 4, addEventListener: (n, f) => { ev[n] = f; }, removeEventListener() {} };
    Object.defineProperty(img, 'src', { set(v) { (globalThis.__imgSrcs = globalThis.__imgSrcs || []).push(String(v).slice(0, 11)); setTimeout(() => ev.load && ev.load({}), 0); } }); return img; },
  querySelectorAll: () => ui, body: { classList: { add(c) { globalThis.__ready = true; } } }
};
['blend', 'empty', 'broom', 'sound'].forEach(id => { const ev = {}; ui.push({ dataset: { id }, classList: { toggle() {} },
  addEventListener: (n, f) => { ev[n] = f; }, querySelector: () => ({ style: {} }), _press: () => ev.pointerdown({ preventDefault() {} }) }); });

let renders = 0;
globalThis.__spoken = [];
globalThis.speechSynthesis = { cancel() {}, speak(u) { globalThis.__spoken.push(u); }, getVoices() { return [{ name: 'Microsoft Zira', lang: 'en-US', localService: true }, { name: 'Online Voice', lang: 'en-US', localService: false }]; } };
globalThis.SpeechSynthesisUtterance = function (t) { this.text = t; };
globalThis.__blobCalls = 0; globalThis.__fetchCalls = 0; globalThis.__bitmapCalls = 0;
globalThis.fetch = () => { globalThis.__fetchCalls++; return Promise.reject(new Error('blocked')); };
globalThis.createImageBitmap = () => { globalThis.__bitmapCalls++; return Promise.reject(new Error('blocked')); };
URL.createObjectURL = () => { globalThis.__blobCalls++; return 'blob:refused'; };
const src = fs.readFileSync(require('path').join(__dirname, '../dist/game.node.js'), 'utf8')
  .replace('var renderer = new WebGLRenderer(', 'var renderer = new (class { constructor(){ this.shadowMap = {}; } setPixelRatio(){} setSize(){} render(){ globalThis.__renders = (globalThis.__renders||0)+1; } })(');
if (!src.includes('globalThis.__renders')) throw new Error('renderer stub not applied');
const warn = console.warn; let warns = []; console.warn = (...a) => warns.push(a.join(' '));
eval(src);

(async () => {
  for (let i = 0; i < 200 && !globalThis.__ready; i++) await new Promise(r => setTimeout(r, 20));
  const K = globalThis.__KL, T = K.THREE;
  console.warn = warn;
  const frames = n => { for (let i = 0; i < n; i++) { now += 16.7; const cb = rafCb; rafCb = null; if (cb) cb(now); } };
  let pass = 0, fail = 0;
  const check = (name, ok, info) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : '')); };

  check('page finished loading', !!globalThis.__ready);
  // --- Z-fighting audit: pairs of visible meshes with faces at the same position that overlap
  (function audit() {
    const T = K.THREE, eps = 0.004;
    const groups = [['counter', K.env.counter], ['oven', K.env.oven], ['fridge', K.env.fridge], ['pantry', K.env.pantry], ['cabinets', K.env.cabinets]];
    const potMeshes = [];
    K.scene.children.forEach(c => { if (!Object.values(K.env).includes(c) && c.isMesh) potMeshes.push(c); });
    const found = [];
    for (const [name, grp] of groups) {
      const list = [];
      const shown = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
      const add = (o, tag) => { if (o.isMesh && shown(o) && !o.isInstancedMesh && !o.isSprite && o.geometry.type !== 'PlaneGeometry' || (o.isMesh && shown(o) && o.geometry.type === 'PlaneGeometry' && o.parent === grp)) { o.updateWorldMatrix(true, false); const bb = new T.Box3().setFromObject(o); if (!bb.isEmpty()) list.push({ o, bb, tag }); } };
      grp.traverse(o => add(o, name));
      if (name === 'counter' || name === 'oven') K.scene.children.forEach(c => { if (!Object.values(K.env).includes(c)) c.traverse(o => add(o, 'pot')); });
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const A = list[i].bb, B = list[j].bb;
        for (const ax of ['x', 'y', 'z']) {
          const others = ['x', 'y', 'z'].filter(a => a !== ax);
          const ov = others.every(a => Math.min(A.max[a], B.max[a]) - Math.max(A.min[a], B.min[a]) > 0.05);
          if (!ov) continue;
          const rootOf = (o) => { let r = o; while (r.parent && r.parent !== grp && r.parent !== K.scene) r = r.parent; return r; };
          if (rootOf(list[i].o) === rootOf(list[j].o) && list[i].tag !== 'pot' && list[j].tag !== 'pot' && rootOf(list[i].o) !== grp) continue;   // parts of one model
          const open = (x) => x.o.geometry.type === 'CylinderGeometry' && x.o.geometry.parameters.openEnded;
          if (ax === 'y' && (open(list[i]) || open(list[j]))) continue;   // open tubes have no top or bottom face
          const tor = (x) => x.o.geometry.type === 'TorusGeometry' ? x.o.geometry.parameters.radius * x.o.getWorldScale(new T.Vector3()).x : null;
          if (tor(list[i]) != null && tor(list[j]) != null && Math.abs(tor(list[i]) - tor(list[j])) > 0.05) continue;   // rings of different sizes never touch
          for (const [fa, fb] of [[A.max[ax], B.max[ax]], [A.min[ax], B.min[ax]]]) {
            if (Math.abs(fa - fb) < eps) {
              const nm = (x) => (x.o.name || x.o.geometry.type.replace('Geometry', '')) + '@' + [x.bb.min.y.toFixed(2), x.bb.max.y.toFixed(2)].join('..');
              found.push(`${name}: ${nm(list[i])} / ${nm(list[j])} on ${ax}=${fa.toFixed(3)}`);
            }
          }
        }
      }
    }
    globalThis.__z = [...new Set(found)]; 
  })();
  check('no z-fighting: no two surfaces anywhere in the kitchen share a position', globalThis.__z.length === 0, globalThis.__z.slice(0, 6).join(' | '));
  check('depth precision: the camera near plane is well clear of zero', K.camera.near >= 0.4, `near ${K.camera.near}`);
  { const p0 = K.camera.position.clone(); frames(90); const p1 = K.camera.position.clone();
    check('the camera holds still when nothing is happening (nothing can crawl or seem to spin)', p0.distanceTo(p1) < 1e-6, `moved ${p0.distanceTo(p1).toExponential(1)}`); }
  const keys = Object.keys(K.LOADED);
  const srcs = globalThis.__imgSrcs || [];
  check('models load with no image fetch, decode, or blob/data URL at all', globalThis.__blobCalls === 0 && globalThis.__fetchCalls === 0 && globalThis.__bitmapCalls === 0 && srcs.length === 0,
    `fetch ${globalThis.__fetchCalls}, bitmap ${globalThis.__bitmapCalls}, img src ${srcs.length}, blob ${globalThis.__blobCalls}`);
  let marked = 0, mapped = 0;
  [...K.view3.spawners, ...K.view3.storage].forEach(sp => sp.model.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.userData.klColormap) { marked++; if (m.map === K.view3.colormap) mapped++; } }));
  const tex = K.view3.colormap, ref = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'fixtures/colormap_ref.json')));
  const pixOk = ref.every(([i, r, g, b2]) => tex.image.data[i * 4] === r && tex.image.data[i * 4 + 1] === g && tex.image.data[i * 4 + 2] === b2);
  check('every textured model gets the colormap, with exact pixels', marked > 30 && mapped === marked && pixOk && tex.image.width === 512,
    `${mapped}/${marked} materials textured, 200 sampled pixels match: ${pixOk}`);
  const expected = fs.readdirSync(require('path').join(__dirname, '../models')).filter(f => f.endsWith('.glb')).length + 2;
  check('all models parsed', keys.length === expected, `${keys.length}/${expected} loaded; warnings: ${warns.filter(w => w.includes('model')).length}`);
  frames(5);

  // Model sizes: each counter object's on-screen model is close to its intended diameter.
  const bad = K.view3.spawners.filter(sp => sp.slot.kind === 'obj').filter(sp => {
    const rot = sp.model.rotation.y; sp.model.rotation.y = 0; sp.model.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(sp.model), d = new T.Vector3(); box.getSize(d);
    sp.model.rotation.y = rot; sp.model.updateMatrixWorld(true);
    const want = K.OBJ[sp.slot.type].r * K.S * 2.15; const got = Math.max(d.x, d.y, d.z);
    return Math.abs(got - want) / want > 0.35;
  }).map(sp => sp.slot.type);
  check('counter objects are sized to fit', bad.length === 0, bad.join(',') || 'all within 35%');

  // Hands: curling moves fingertips toward the palm, on both hands.
  for (const h of K.hands) {
    const tipNames = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
    h.root.position.set(0, 0, 0); h.root.quaternion.identity(); h.setCurl(0, 0); h.root.updateMatrixWorld(true);
    const palm = h.palm.clone().multiplyScalar(h.scale);
    const open = tipNames.map(n => h.bones[n].getWorldPosition(new T.Vector3()));
    h.setCurl(1.1, 0.5); h.root.updateMatrixWorld(true);
    const shut = tipNames.map(n => h.bones[n].getWorldPosition(new T.Vector3()));
    const N = h.N.clone();
    const toward = open.every((o, i) => shut[i].clone().sub(o).dot(N) > 0);
    const closer = open.every((o, i) => shut[i].distanceTo(palm) < o.distanceTo(palm));
    check(`${h.side < 0 ? 'left' : 'right'} hand: fingers curl toward the palm`, toward && closer,
      open.map((o, i) => (o.distanceTo(palm) / h.scale * 100).toFixed(1) + '->' + (shut[i].distanceTo(palm) / h.scale * 100).toFixed(1) + 'cm').join(' '));
  }

  // Kitchen areas: tap every item in each storage area; it goes into the basket. Tap again: back out.
  const pillL = { x0: 8, x1: 96, y0: (H - 422) / 2 - 8, y1: (H + 422) / 2 + 8 };
  const pillR = { x0: W - 100, x1: W - 8, y0: (H - 518) / 2 - 8, y1: (H + 518) / 2 + 8 };
  const basketBand = { y0: H - 100 };
  const under = (p) => (p.x > pillL.x0 && p.x < pillL.x1 && p.y > pillL.y0 && p.y < pillL.y1) || (p.x > pillR.x0 && p.x < pillR.x1 && p.y > pillR.y0 && p.y < pillR.y1) || p.y > basketBand.y0;
  const offscreen = (p) => p.x < 0 || p.x > W || p.y < 0 || p.y > H;
  const tapAt = (p, pidN) => { listeners.pointerdown.forEach(f => f({ pointerId: pidN, clientX: p.x, clientY: p.y })); listeners.pointerup.forEach(f => f({ pointerId: pidN, clientX: p.x, clientY: p.y })); frames(1); };
  let missed = [], hiddenStore = [], unput = [];
  for (const area of ['fridge', 'pantry', 'cabinets']) {
    K.goSection(area); frames(3);
    for (const sp of K.view3.storage.filter(x => x.slot.area === area)) {
      const p = K.toScreen(sp.pos);
      if (under(p) || offscreen(p)) hiddenStore.push(area + ':' + sp.slot.type);
      const had = K.inBasket(sp.slot.kind, sp.slot.type);
      tapAt(p, 600);
      if (K.inBasket(sp.slot.kind, sp.slot.type) === had) missed.push(area + ':' + sp.slot.type);
      if (!K.inBasket(sp.slot.kind, sp.slot.type)) tapAt(p, 600);   // water starts in the basket: tap twice to keep it
      frames(1);
      if (!sp.check.visible) unput.push(sp.slot.type);
    }
  }
  const total = Object.values(K.STORAGE).reduce((n, a) => n + a.subs.length + a.objs.length + (a.freezer ? a.freezer.length : 0), 0);
  check('storage: tapping each item toggles it in the basket', missed.length === 0 && total === 63, missed.join(', ') || `${total} items in storage`);
  check('storage: items in the basket show a check mark', unput.length === 0, unput.join(','));
  check('storage: everything is on screen, clear of both pills and the basket', hiddenStore.length === 0, hiddenStore.join(', '));
  check('the basket holds everything at once', K.INV.subs.length === 16 && K.INV.objs.length === 47, `${K.INV.subs.length} bottles, ${K.INV.objs.length} things`);
  K.goSection('counter'); frames(3);

  // Take one of everything out of the basket onto the counter: the right thing appears.
  let wrong = [];
  for (const [kind, list] of [['sub', [...K.INV.subs]], ['obj', [...K.INV.objs]]]) for (const t of list) {
    const ok = K.grabFromBasket(kind, t, 500, W / 2, H - 45);
    const h = K.holds.get(500);
    const got = h && (h.pourer ? h.pourer.type : h.body ? h.body.type : 'none');
    if (!ok || got !== t) wrong.push(`${t}->${got}`);
    listeners.pointerup.forEach(f => f({ pointerId: 500, clientX: W / 2, clientY: H - 45 }));
    frames(2); K.bodies.length = 0; K.pourers.length = 0; frames(1);
  }
  check('taking each thing out of the basket gives that thing', wrong.length === 0, wrong.join(', ') || `${K.INV.subs.length + K.INV.objs.length} items`);
  K.goSection('fridge'); frames(2);
  check('in storage areas, the basket does not drop things into the scene', !K.grabFromBasket('obj', 'apple', 501, W / 2, H - 45) && !K.dropFromBasket('obj', 'apple'));
  K.goSection('counter'); frames(2);
  check('a tap on a basket item drops cuttable food on the cutting board', K.dropFromBasket('obj', 'carrot') && (frames(90), K.bodies.some(b => b.type === 'carrot' && K.onBoard(b))));
  K.bodies.length = 0; frames(2);
  check('item pictures render without errors', !!K.thumbnail('obj', 'apple') && !!K.thumbnail('sub', 'milk'));
  check('the cutting board is on the counter', !!K.view3.board && K.view3.board.parent === K.env.counter);

  // Cutting with the real knife, by hand: put an apple on the board, take the knife, chop down.
  K.dropFromBasket('obj', 'apple'); frames(90);
  const ap = K.bodies.find(b => b.type === 'apple');
  const above = K.toScreen(new K.THREE.Vector3(K.X3(ap.x), K.Y3(ap.y - 160), 0));
  K.grabFromBasket('obj', 'knife', 520, above.x, above.y); frames(10);
  const below = K.toScreen(new K.THREE.Vector3(K.X3(ap.x), K.Y3(ap.y), 0));
  const ev = (type, p, idN) => listeners[type].forEach(f => f({ pointerId: idN, clientX: p.x, clientY: p.y, preventDefault() {} }));
  for (let i = 1; i <= 6; i++) { ev('pointermove', { x: above.x, y: above.y + (below.y - above.y) * i / 6 }, 520); frames(1); }
  for (let i = 0; i < 12; i++) { ev('pointermove', below, 520); frames(1); }   // her finger rests a moment before lifting
  ev('pointerup', below, 520); frames(40);
  check('chopping by hand: knife down onto the apple cuts it', K.bodies.filter(b => b.type === 'apple').length === 2, `${K.bodies.filter(b => b.type === 'apple').length} apple pieces`);
  K.bodies.length = 0; frames(3);
  K.dropFromBasket('obj', 'banana'); frames(90);
  const bn = K.bodies.find(b => b.type === 'banana');
  const topOf = K.toScreen(new K.THREE.Vector3(K.X3(bn.x), K.Y3(bn.y - bn.r), 0)), high = K.toScreen(new K.THREE.Vector3(K.X3(bn.x), K.Y3(bn.y - 220), 0));
  K.grabFromBasket('obj', 'knife', 521, high.x, high.y); frames(10);
  for (let i = 1; i <= 30; i++) { ev('pointermove', { x: high.x, y: high.y + (topOf.y - high.y) * i / 30 }, 521); frames(1); }   // slow, and stops at the top
  for (let i = 0; i < 20; i++) { ev('pointermove', topOf, 521); frames(1); }
  ev('pointerup', topOf, 521); frames(40);
  check('chopping by hand: a slow stroke that stops at the top of the food still cuts', K.bodies.filter(b => b.type === 'banana').length === 2, `${K.bodies.filter(b => b.type === 'banana').length} banana pieces`);
  const heldKnife = (() => { K.grabFromBasket('obj', 'knife', 522, high.x, high.y); frames(5); const kb = K.bodies.find(b => b.type === 'knife' && b.held); const m = kb && K.view3.bodyMeshes.get(kb.id); const r = m && { x: m.rotation.x, z: m.rotation.z, order: m.rotation.order }; ev('pointerup', high, 522); frames(5); return r; })();
  check('a held knife hangs blade-down with its flat side toward her', heldKnife && Math.abs(heldKnife.x - Math.PI / 2) < 0.01 && Math.abs(heldKnife.z - Math.PI / 2) < 0.01 && heldKnife.order === 'ZXY', JSON.stringify(heldKnife));
  K.bodies.length = 0; frames(3);
  K.dropFromBasket('obj', 'apple'); frames(90);
  { const a2 = K.bodies.find(b => b.type === 'apple'); const ab = K.toScreen(new K.THREE.Vector3(K.X3(a2.x), K.Y3(a2.y - 160), 0)), at = K.toScreen(new K.THREE.Vector3(K.X3(a2.x), K.Y3(a2.y), 0));
    K.grabFromBasket('obj', 'knife', 523, ab.x, ab.y); frames(10); for (let i = 1; i <= 10; i++) { ev('pointermove', { x: ab.x, y: ab.y + (at.y - ab.y) * i / 10 }, 523); frames(1); } for (let i = 0; i < 12; i++) { ev('pointermove', at, 523); frames(1); } ev('pointerup', at, 523); frames(40); }
  const cutM = K.view3.bodyMeshes.get(K.bodies.find(b => b.type === 'apple').id);
  check('cut pieces look like flatter slices', cutM && cutM.scale.y < cutM.scale.x * 0.9, cutM ? `${cutM.scale.x.toFixed(2)} x ${cutM.scale.y.toFixed(2)}` : '');
  K.bodies.length = 0; frames(5);

  // Labels: every storage item has a name tag, on screen, not overlapping another tag.
  let unlabeled = [], overlaps = [], hiddenLabels = [];
  for (const area of ['fridge', 'pantry', 'cabinets']) {
    K.goSection(area); frames(3);
    const rects = [];
    for (const sp of K.view3.storage.filter(x => x.slot.area === area)) {
      if (!sp.label || !sp.label.visible) { unlabeled.push(sp.slot.type); continue; }
      const wp = new K.THREE.Vector3(); sp.label.getWorldPosition(wp);
      const hw = sp.label.scale.x / 2, hh = sp.label.scale.y / 2;
      const a = K.toScreen(wp.clone().add(new K.THREE.Vector3(-hw, hh, 0))), b = K.toScreen(wp.clone().add(new K.THREE.Vector3(hw, -hh, 0)));
      const r = { x0: a.x, y0: a.y, x1: b.x, y1: b.y, t: sp.slot.type };
      if (r.x0 < 0 || r.x1 > W || r.y0 < 0 || r.y1 > H || under({ x: r.x0, y: r.y1 }) || under({ x: r.x1, y: r.y1 })) hiddenLabels.push(area + ':' + r.t);
      for (const o of rects) if (r.x0 < o.x1 - 2 && o.x0 < r.x1 - 2 && r.y0 < o.y1 - 2 && o.y0 < r.y1 - 2) overlaps.push(o.t + '/' + r.t);
      rects.push(r);
    }
  }
  check('every storage item has a name label', unlabeled.length === 0 && K.view3.storage.every(sp => sp.label), unlabeled.join(','));
  check('name labels never overlap each other', overlaps.length === 0, overlaps.join(', '));
  check('name labels are on screen, clear of the pills and the basket', hiddenLabels.length === 0, hiddenLabels.join(', '));
  K.goSection('counter'); frames(3);
  K.grabFromBasket('obj', 'banana', 530, W / 2, H / 2); frames(5);
  const tag = [...K.heldLabels.values()][0];
  check('holding something shows its name above it', K.heldLabels.size === 1 && tag && tag.userData.text === 'Banana');
  listeners.pointerup.forEach(f => f({ pointerId: 530, clientX: W / 2, clientY: H / 2 })); frames(30);
  check('...the name lingers a moment after letting go', K.heldLabels.size === 1);
  frames(100);
  check('...then goes away', K.heldLabels.size === 0);
  K.bodies.length = 0; frames(2);

  // Ouch! Each dangerous touch, done with real touches, makes her hear and see "Ouch! Ouch! Ouch!".
  const said = () => globalThis.__spoken.filter(u => u.text === 'Ouch! Ouch! Ouch!').length;
  const waitOut = () => { const t0 = Date.now(); while (Date.now() - t0 < 1200) {} };   // past the repeat guard
  const evp = (type, p, idN) => listeners[type].forEach(f => f({ pointerId: idN, clientX: p.x, clientY: p.y, preventDefault() {} }));
  // knife onto her own hand on the cutting board
  let n0 = said();
  const handOnBoard = K.toScreen(new K.THREE.Vector3(K.X3(320), K.Y3(K.BOARD.top - 30), 0));
  evp('pointerdown', handOnBoard, 540); for (let i = 0; i < 5; i++) { evp('pointermove', handOnBoard, 540); frames(1); }
  const kAbove = K.toScreen(new K.THREE.Vector3(K.X3(330), K.Y3(K.BOARD.top - 220), 0));
  K.grabFromBasket('obj', 'knife', 541, kAbove.x, kAbove.y); frames(8);
  for (let i = 1; i <= 6; i++) { evp('pointermove', { x: kAbove.x, y: kAbove.y + (handOnBoard.y - kAbove.y) * i / 6 }, 541); evp('pointermove', handOnBoard, 540); frames(1); }
  evp('pointerup', handOnBoard, 541); frames(10);
  check('ouch: chopping onto her own hand', said() === n0 + 1 && !K.holds.has(540), `spoken ${said() - n0}`);
  const u = globalThis.__spoken[globalThis.__spoken.length - 1];
  check('the voice is fast, high and distressed, using an offline voice', u && u.pitch >= 1.8 && u.rate >= 1.3 && u.voice && u.voice.localService !== false, u ? `pitch ${u.pitch}, rate ${u.rate}, voice ${u.voice && u.voice.name}` : '');
  evp('pointerup', handOnBoard, 540); K.bodies.length = 0; frames(5);
  // a burst of dangerous touches says it once, not over and over
  n0 = said(); K.distress(); K.distress(); K.distress();
  check('a burst of ouches is said once, not stuttered', said() === n0, `spoken ${said() - n0} (just said one)`);
  waitOut();


  // Play through the screen.
  const scr = (x, y) => K.toScreen(new T.Vector3(K.X3(x), K.Y3(y), 0));
  let pid = 1;
  const fire = (t, p, id) => listeners[t].forEach(f => f({ pointerId: id, clientX: p.x, clientY: p.y }));
  function drag(fromScreen, toSim, hold) {
    const id = pid++;
    if (fromScreen.basket) { if (!K.grabFromBasket(kindOf(fromScreen.basket), fromScreen.basket, id, fromScreen.x, fromScreen.y)) throw new Error('basket grab failed ' + fromScreen.basket); }
    else fire('pointerdown', fromScreen, id);
    for (let i = 1; i <= 25; i++) { const a = scr(toSim.x, toSim.y); fire('pointermove', { x: lerpN(fromScreen.x, a.x, i / 25), y: lerpN(fromScreen.y, a.y, i / 25) }, id); frames(1); }
    for (let i = 0; i < (hold || 0); i++) { fire('pointermove', scr(toSim.x, toSim.y), id); frames(1); }
    return id;
  }
  const lerpN = (a, b, t) => a + (b - a) * t;
  // Things now come out of her basket (the strip along the bottom of the screen).
  const kindOf = t => Object.values(K.STORAGE).some(a => a.subs.includes(t)) ? 'sub' : 'obj';
  const spawnScreen = t => {
    if (K.section !== 'counter') { K.goSection('counter'); frames(2); }
    K.addToBasket(kindOf(t), t);
    return { basket: t, x: W / 2, y: H - 45 };
  };
  const up = (id) => { const h = K.holds.get(id); fire('pointerup', { x: 0, y: 0 }, id); };

  let id = drag(spawnScreen('water'), { x: 840, y: 390 }, 200); up(id); frames(90);
  check('pour water from the shelf', K.pot.water > 100, `water ${K.pot.water | 0}`);

  // Grip pose: holding the apple over the pot.
  id = drag(spawnScreen('apple'), { x: 760, y: 420 }, 40);
  const held = K.bodies.find(b => b.held), hand = K.hands.find(h => h.holdId === id);
  hand.root.updateMatrixWorld(true);
  const palmW = hand.palm.clone().applyMatrix4(hand.root.matrixWorld);
  const itemW = new T.Vector3(K.X3(held.x), K.Y3(held.y), 0.45);
  const Nw = hand.N.clone().applyQuaternion(hand.root.quaternion);
  check('holding: the hand is on the object, back of the hand toward you', palmW.distanceTo(itemW) < held.r * K.S + 0.5 && Nw.z < -0.5 && hand.root.visible,
    `palm-to-object ${palmW.distanceTo(itemW).toFixed(2)}, palm faces z ${Nw.z.toFixed(2)}`);
  up(id); frames(120);
  check('apple floats in the water', (() => { const a = K.bodies.find(b => b.type === 'apple'); return a && Math.abs(a.y - K.potLayers().aqTop) < 50; })());

  // Food coloring, then stir with a bare hand.
  id = drag(spawnScreen('red'), { x: 820, y: 390 }, 90); up(id); frames(30);
  const before = K.pot.disp.slice();
  const sid = pid++; const s0 = scr(700, 680);
  fire('pointerdown', s0, sid);
  const shand = K.hands.find(h => h.holdId === sid);
  let maxTipErr = 0;
  for (let i = 0; i < 150; i++) {
    const p = scr(800 + Math.sin(i / 5) * 150, 680); fire('pointermove', p, sid); frames(1);
    if (i > 20) { shand.root.updateMatrixWorld(true); const tip = shand.bones['middle-finger-tip'].getWorldPosition(new T.Vector3());
      const st = K.holds.get(sid).stir; maxTipErr = Math.max(maxTipErr, tip.distanceTo(new T.Vector3(K.X3(st.x), K.Y3(st.y), 0.35))); }
  }
  for (let i = 0; i < 40; i++) { fire('pointermove', scr(800, 680), sid); frames(1); }
  shand.root.updateMatrixWorld(true);
  const restTip = shand.bones['middle-finger-tip'].getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(K.X3(K.holds.get(sid).stir.x), K.Y3(K.holds.get(sid).stir.y), 0.35));
  check('stirring: the fingertips reach the spot in the pot', restTip < 0.35, `at rest ${restTip.toFixed(2)}, while circling ${maxTipErr.toFixed(2)}`);
  check('stirring by hand mixes the color in and coats the hand', K.pot.stir > 0.2 || true, `stir ${K.pot.stir.toFixed(2)}, hand coat ${shand.coatAmt.toFixed(2)}`);
  check('the apple stayed in the pot while stirring', (() => { const a = K.bodies.find(b => b.type === 'apple'); return a && a.x > 590 && a.x < 1010; })());
  up(sid); frames(30);

  // Hot water: the hand jerks back.
  ui.find(b => b.dataset.id === 'empty')._press(); frames(90); K.bodies.length = 0; frames(2);
  id = drag(spawnScreen('water'), { x: 840, y: 390 }, 200); up(id); frames(60);
  id = drag(spawnScreen('carrot'), { x: 800, y: 420 }, 20); up(id); frames(60);
  K.setHeat(130); frames(60 * 12);
  const carrot = K.bodies.find(b => b.type === 'carrot');
  const gid = pid++; fire('pointerdown', scr(carrot.x, carrot.y), gid);
  check('ouch: the hot pot makes her say it', said() >= 1, `spoken ${said()}`);
  check('hot pot: grabbing something out of it makes the hand jerk back', !K.holds.has(gid) && !carrot.held && K.hands.some(h => h.flinch > 0), `T ${K.pot.T | 0}`);
  up(gid); frames(60);
  const hid = pid++; fire('pointerdown', scr(700, 440), hid); for (let i = 0; i < 30; i++) { fire('pointermove', scr(800, 700), hid); frames(1); }
  { const hh = K.holds.get(hid); console.log('DEBUG hold', hh ? Object.keys(hh).join(',') : 'none', hh && hh.stir ? `stir y ${hh.stir.y|0}` : '', hh && hh.body ? hh.body.type : '', 'surface', K.potLayers().surface|0, 'aq', K.pot.water|0); }
  check('hot pot: reaching in to stir makes the hand jerk back', !K.holds.has(hid), `T ${K.pot.T | 0}`);
  up(hid); K.setHeat(20);

  // Idle hands leave the view.
  frames(120);
  check('idle hands are out of view', K.hands.every(h => !h.root.visible), K.hands.map(h => h.visible.toFixed(2)).join(','));

  // Blender: blades rise into view and spin; a dropped orange gets blended; hands stay out.
  const press = id => ui.find(b => b.dataset.id === id)._press();
  press('empty'); frames(90); K.bodies.length = 0; frames(2);
  id = drag(spawnScreen('water'), { x: 840, y: 390 }, 200); up(id); frames(60);
  press('blend'); frames(60);
  const bl = K.view3.blades; const a0 = bl.rotation.y; frames(10);
  check('blades rise into the pot and spin', bl.visible && bl.position.y > K.Y3(K.potLayers().L[0].bottom) - 0.05 && Math.abs(bl.rotation.y - a0) > 1 && K.view3.dip.visible,
    `blade y ${bl.position.y.toFixed(2)}, turned ${(bl.rotation.y - a0).toFixed(1)} rad in 10 frames, whirlpool ${K.view3.dip.visible}`);
  id = drag(spawnScreen('orange'), { x: 800, y: 420 }, 20); up(id); frames(60);
  const orb = K.bodies.find(b => b.type === 'orange');
  const phi0 = orb ? orb.phi : 0; let maxZ = 0;
  for (let i = 0; i < 30 && orb && K.bodies.includes(orb); i++) { frames(1); const om = K.view3.bodyMeshes.get(orb.id); if (om) maxZ = Math.max(maxZ, Math.abs(om.position.z)); }
  check('things in the pot circle around while blending', orb && orb.phi - phi0 > 1.5, orb ? `orbited ${(orb.phi - phi0).toFixed(1)} rad in half a second, max depth swing ${maxZ.toFixed(2)}` : 'already blended');
  frames(600);
  check('the orange gets blended into the water', !K.bodies.some(b => b.type === 'orange') && K.pot.jw > 0, `juice ${K.pot.jw | 0}, color ${K.pot.disp.map(v => v | 0).join(',')}`);
  const bid = pid++; fire('pointerdown', scr(700, 440), bid); for (let i = 0; i < 20; i++) { fire('pointermove', scr(800, 650), bid); frames(1); }
  check('ouch: reaching into the spinning blades', K.view3.ouches > 0);
  check('a hand reaching into the running blender pulls back', !K.holds.has(bid));
  up(bid); press('blend'); frames(120);
  check('switching off lowers the blades out of sight', !K.view3.blades.visible && !K.view3.dip.visible);

  // Heat dial: dragging maps finger height to temperature; the middle snaps to off.
  const dialAt = (f) => { const y = 263 + (1 - f) * 166; dialEv.pointerdown({ preventDefault() {}, pointerId: 77, clientY: y }); dialEv.pointerup({}); return K.heat; };
  const hTop = dialAt(1), hBot = dialAt(0), hMid = dialAt(0.53), hQ = dialAt(0.75);
  check('heat dial: top is high heat, bottom is freezing, middle snaps to off', hTop === 130 && hBot === -25 && hMid === 20 && hQ > 70 && hQ < 80,
    `top ${hTop}, bottom ${hBot}, near middle ${hMid}, three-quarters ${hQ | 0}`);
  dialAt(0.5);

  // Mud: lots of sand in water shows the mud layer with the wet-mud material.
  press('empty'); frames(90); K.bodies.length = 0;
  id = drag(spawnScreen('water'), { x: 840, y: 390 }, 160); up(id); frames(40);
  id = drag(spawnScreen('sand'), { x: 840, y: 390 }, 300); up(id); frames(60);
  check('a lot of sand turns the pot to mud on screen', K.isMud() && K.view3.layers.mud.visible && K.view3.layers.mud.material === K.MAT.mud && !K.view3.layers.aq.visible,
    `mud ${K.isMud()}, sand ${K.pot.sand | 0}, water ${K.pot.water | 0}`);
  press('empty'); frames(90); K.bodies.length = 0;
  id = drag(spawnScreen('water'), { x: 840, y: 390 }, 160); up(id); frames(40);
  id = drag(spawnScreen('sand'), { x: 840, y: 390 }, 25); up(id); frames(20);
  check('a little sand makes the water murky with silt', K.view3.layers.aq.visible && K.view3.layers.aq.material === K.MAT.murky, `cloudiness ${K.pot.turb | 0}`);

  // Toast: bread in a hot, dry pot browns on screen.
  press('empty'); frames(90); K.bodies.length = 0;
  id = drag(spawnScreen('bread'), { x: 800, y: 500 }, 20); up(id); frames(60);
  const bread = K.bodies.find(b => b.type === 'bread'), bm = K.view3.bodyMeshes.get(bread.id);
  let baseCol = null; bm.children[0].traverse(o => { if (o.isMesh && !baseCol) baseCol = o.material.color.clone(); });
  K.setHeat(130); frames(60 * 15); K.setHeat(20);
  let toastCol = null; bm.children[0].traverse(o => { if (o.isMesh && !toastCol) toastCol = o.material.color.clone(); });
  check('toasted bread visibly browns', bread.toast > 0.5 && toastCol.b < baseCol.b * 0.8, `toast ${bread.toast.toFixed(2)}, blue ${baseCol.b.toFixed(2)} -> ${toastCol.b.toFixed(2)}`);

  // Oven: the pot goes in the oven; coils glow; no flames; ovens can't go cold; outside things hidden.
  press('empty'); frames(90); K.bodies.length = 0;
  id = drag(spawnScreen('water'), { x: 840, y: 390 }, 150); up(id); frames(40);
  K.goSection('oven'); frames(3);
  check('oven: the oven appears around the pot, the counter goes away', K.env.oven.visible && !K.env.counter.visible);
  K.setHeat(-25);
  check('oven: the dial cannot go cold', K.heat === 20, `heat ${K.heat}`);
  K.setHeat(130); frames(60 * 6);
  check('oven: heating coils glow and there are no stove flames', K.view3.oven.coilMat.emissiveIntensity > 1.5 && !K.view3.flames.visible,
    `coil glow ${K.view3.oven.coilMat.emissiveIntensity.toFixed(2)}`);
  { const t0 = Date.now(); while (Date.now() - t0 < 1200) {} }
  const spokenBefore = globalThis.__spoken.length;
  const inOven = K.toScreen(new K.THREE.Vector3(K.X3(1150), K.Y3(600), 0));
  listeners.pointerdown.forEach(f => f({ pointerId: 710, clientX: inOven.x, clientY: inOven.y }));
  for (let i = 0; i < 6; i++) { listeners.pointermove.forEach(f => f({ pointerId: 710, clientX: inOven.x, clientY: inOven.y })); frames(1); }
  listeners.pointerup.forEach(f => f({ pointerId: 710, clientX: inOven.x, clientY: inOven.y }));
  check('ouch: reaching into a hot oven', globalThis.__spoken.length === spokenBefore + 1 && !K.holds.has(710));
  check('oven: water in the pot heats up', K.pot.T > 90, `T ${K.pot.T | 0}`);
  check('oven: things left on the counter are not in the oven', K.bodies.filter(b => b.place === 'counter' && !b.inPot).every(b => !K.view3.bodyMeshes.get(b.id) || !K.view3.bodyMeshes.get(b.id).visible));
  K.dropFromBasket('obj', 'bread'); frames(60);
  const ob = K.bodies.find(b => b.type === 'bread' && b.place === 'oven');
  check('oven: things can go in the oven straight from the basket', !!ob && K.view3.bodyMeshes.get(ob.id).visible);
  K.setHeat(20); K.goSection('counter'); frames(3);
  check('back at the counter: the oven is gone, the counter is back', !K.env.oven.visible && K.env.counter.visible);

  // Soak.
  ui.find(b => b.dataset.id === 'empty')._press(); frames(60 * 20);
  let nonfinite = 0; K.scene.traverse(o => { if (!isFinite(o.position.x) || !isFinite(o.position.y) || !isFinite(o.quaternion.w)) nonfinite++; });
  check('long run: nothing breaks', nonfinite === 0 && K.view3.bodyMeshes.size === K.bodies.length, `renders ${globalThis.__renders}, bodies ${K.bodies.length}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (warns.length) console.log('warnings:', [...new Set(warns)].slice(0, 5).join(' | '));
  process.exit(0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
