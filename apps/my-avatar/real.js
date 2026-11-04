// Realistic avatar: MakeHuman models (built by tools/build-avatar-models.py into models/*.js) put together in three.js.
//
// The body, each piece of hair, clothing and the skin and eye textures are separate files, loaded when first needed.
// Each file is a plain script that stores a base64 glTF (or WebP) in window.AVATAR_MODELS, because the tablet's browser
// cannot fetch files or open data: or blob: URLs; images are decoded with createImageBitmap straight from the bytes.
//
// window.REAL_AVATAR.compose(group, P) puts the avatar for design P into group and returns the anchors avatar.js uses
// for its own hats, glasses, wings and the camera, or null while files are still loading (onReady is called after).
(function () {
  'use strict';
  const T = window.THREE, CAT = window.AVATAR_CATALOG;
  const R = window.REAL_AVATAR = { ok: !!(T && CAT && T.GLTFLoader), ready: false, failed: null, onReady: null, errors: [] };
  if (!R.ok) return;
  const MODELS = () => (window.AVATAR_MODELS = window.AVATAR_MODELS || {});
  const HEIGHT = 1.6;                        // the avatar's height in scene units (the procedural avatar's size)

  // ------------------------------------------------------------------------------------------------------------
  // Choices: design values to model files
  // ------------------------------------------------------------------------------------------------------------
  const A = CAT.assets;
  const ids = kind => Object.keys(A).filter(k => k.startsWith(kind + '-'));
  const list = kind => ids(kind).map(k => [k, A[k].label]);
  const SHADES = ['glasses-3d', 'glasses-goggles'];
  R.SHADES = SHADES;
  R.LOOK = {
    hair: list('hair'), brows: list('brows'), top: list('top').concat(list('dress')), bottom: list('bottom'), shoes: list('shoes'),
    socks: [['none', 'None']].concat(list('socks')), glasses: [['none', 'None']].concat(list('glasses').filter(([k]) => !SHADES.includes(k))),
    earrings: [['none', 'None']].concat(list('jewel').filter(([k]) => k !== 'jewel-pearls')),
    pose: [['stand', 'Stand'], ['wave', 'Salute'], ['hips', 'Hands on hips'], ['hero', 'Hero'], ['shy', 'Shy'], ['peace', 'Peace'], ['pose', 'Strike a pose'], ['fly', 'Fly']]
      .filter(([k]) => CAT.body.poses.includes(k)),
  };
  // The face sliders (each -1 to 1). Keys pair with the body's "name-" and "name+" shape keys.
  R.TUNE = [['faceWidth', 'Face width'], ['cheeks', 'Cheeks'], ['jaw', 'Jaw'], ['chin', 'Chin'], ['eyeSize', 'Eye size'], ['eyeSpacing', 'Eyes apart'],
    ['browHeight', 'Eyebrow height'], ['noseSize', 'Nose size'], ['noseWidth', 'Nose width'], ['noseTip', 'Nose tip'], ['lips', 'Lips'],
    ['mouthWidth', 'Mouth width'], ['ears', 'Ears']].filter(([k]) => CAT.body.keys.includes(k + '+'));
  R.isDress = id => /^dress-/.test(id || '');
  R.tints = id => !!(A[id] && A[id].tint);
  R.has = id => !!A[id];

  // Old (drawn) avatar choices to the real ones, so a saved design carries over.
  R.MIGRATE = {
    hair: { short: 'hair-short', bob: 'hair-bob', long: 'hair-long', ponytail: 'hair-ponytail', pigtails: 'hair-double-braid', braids: 'hair-double-braid',
            bun: 'hair-bun', curly: 'hair-curls', afro: 'hair-afro', pixie: 'hair-short-side' },
    brows: { natural: 'brows-natural', thin: 'brows-soft', thick: 'brows-thick', arched: 'brows-arched' },
    top: { tee: 'top-tee', long: 'top-sweater', hoodie: 'top-sweater', stripes: 'top-tucked-tee', tank: 'top-tank', dress: 'dress-sundress' },
    bottom: { jeans: 'bottom-pants', leggings: 'bottom-pants', shorts: 'bottom-jean-shorts', skirt: 'bottom-ruffle-skirt' },
    shoes: { sneakers: 'shoes-sneakers', boots: 'shoes-rain-boots', sandals: 'shoes-mary-janes', flats: 'shoes-flats-bows' },
    glasses: { round: 'glasses-round', square: 'glasses-black', cateye: 'glasses-leopard' },
    pose: { cheer: 'peace' },
  };

  // Shop outfits made of real clothes: [top, top colour, bottom, bottom colour, shoes, shoe colour, socks].
  R.OUTFITS = {
    soccer: ['top-tee', '#FF2D55', 'bottom-jean-shorts', null, 'shoes-sneakers', '#2B2140', 'socks-high'],
    chef: ['top-sweater', '#FFFFFF', 'bottom-pants', '#2B2140', 'shoes-leather', null, 'socks-low'],
    doctor: ['top-polo', '#7FD1E8', 'bottom-pants', '#7FD1E8', 'shoes-sneakers', '#FFFFFF', 'socks-low'],
    ballerina: ['top-tank', null, 'bottom-tiered-skirt', null, 'shoes-flats-bows', null, 'socks-frill'],
    superhero: ['top-sweater', '#3A86FF', 'bottom-pants', '#3A86FF', 'shoes-rain-boots', '#FF2D55', null],
    princess: ['dress-party', null, null, null, 'shoes-flats-flowers', null, null],
    astronaut: ['dress-overalls', null, null, null, 'shoes-rain-boots', '#C0C8D8', null],
  };

  // ------------------------------------------------------------------------------------------------------------
  // Loading
  // ------------------------------------------------------------------------------------------------------------
  const scripts = {};
  function loadScript(id) {
    if (scripts[id]) return scripts[id];
    return (scripts[id] = new Promise((res, rej) => {
      if (MODELS()[id]) return res();
      const s = document.createElement('script'); s.src = 'models/' + id + '.js';
      s.onload = () => (MODELS()[id] ? res() : rej(new Error('empty ' + id))); s.onerror = () => rej(new Error('missing ' + id));
      document.head.appendChild(s);
    }));
  }
  function takeBytes(id) {
    const b = atob(MODELS()[id]); delete MODELS()[id];
    const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  function bitmapTexture(u8, type) {
    return createImageBitmap(new Blob([u8], { type }), { premultiplyAlpha: 'none' }).then(bm => { const t = new T.Texture(bm); t.needsUpdate = true; return t; });
  }
  // glTF from bytes, with images decoded without URLs.
  function parseGlb(u8) {
    const loader = new T.GLTFLoader();
    loader.pluginCallbacks = loader.pluginCallbacks.map(cb => parser => {
      const p = cb(parser);
      if (p && p.name === 'EXT_texture_webp') p.isSupported = Promise.resolve(true);
      return p;
    });
    loader.register(parser => {
      parser.loadImageSource = function (index) {
        if (this.sourceCache[index] !== undefined) return this.sourceCache[index].then(t => t.clone());
        const def = this.json.images[index];
        const p = this.getDependency('bufferView', def.bufferView).then(bv => bitmapTexture(bv, def.mimeType)).then(t => { t.userData.mimeType = def.mimeType; return t; });
        this.sourceCache[index] = p; return p;
      };
      return { name: 'kid_bitmap_images' };
    });
    return new Promise((res, rej) => loader.parse(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), '', res, rej));
  }

  const cache = {};            // id: { meshes } once loaded
  const loading = {};
  let body = null;             // { root, rig, mesh, parts, bones, mixer, clips, index, vid, scale, eyeY, ... }
  const tex = { skin: {}, eye: {} };
  // Bones by their MakeHuman name (three.js drops the dots from node names: wrist.L is wristL).
  const bone = n => body && (body.bones[n] || body.bones[T.PropertyBinding.sanitizeNodeName(n)]);

  function load(id) {
    if (cache[id] || loading[id]) return loading[id] || Promise.resolve();
    return (loading[id] = loadScript(id).then(() => parseGlb(takeBytes(id))).then(g => { cache[id] = adopt(id, g); delete loading[id]; }));
  }
  function loadTex(kind, name) {
    const id = kind + '-' + name, box = tex[kind];
    if (box[name]) return box[name];
    return (box[name] = loadScript(id).then(() => bitmapTexture(takeBytes(id), 'image/webp')).then(t => { t.flipY = false; t.encoding = T.sRGBEncoding; return t; }));
  }

  function setupMaterial(m, kind) {
    if (m.map) m.map.encoding = T.sRGBEncoding;
    m.transparent = false; m.depthWrite = true;
    if (kind === 'hair') { m.alphaTest = 0.2; m.alphaToCoverage = true; m.side = T.DoubleSide; m.roughness = 0.55; m.metalness = 0; }   // soft edges without sorting
    else if (kind === 'eyebrows' || kind === 'lashes') { m.transparent = true; m.depthWrite = false; m.alphaTest = 0.05; m.side = T.DoubleSide; }
    else { m.alphaTest = 0.5; m.side = T.DoubleSide; if (m.metalness > 0.5) m.metalness = 0.2; }
    m.userData.base = m.color.clone();
  }

  // The body: its skeleton is the one every other piece is bound to.
  function loadBody() {
    if (R.bodyPromise) return R.bodyPromise;
    R.bodyPromise = loadScript('body').then(() => parseGlb(takeBytes('body'))).then(g => {
      const root = g.scene, meshes = [];
      root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
      const mesh = meshes.find(m => m.geometry.attributes._vid) || meshes[0];
      const bones = {}; mesh.skeleton.bones.forEach(b => { bones[b.name] = b; });
      const parts = {};
      for (const m of meshes) {
        m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
        const n = (m.material.name || m.name).toLowerCase();
        const kind = m === mesh ? 'body' : /lash/.test(n) ? 'lashes' : /teeth/.test(n) ? 'teeth' : /eye|high-poly/.test(n) ? 'eyes' : 'other';
        parts[kind] = m; setupMaterial(m.material, kind);
        if (kind === 'eyes') { m.material.roughness = 0.3; m.material.side = T.FrontSide; m.material.metalness = 0; }
        if (kind === 'body') { m.material.roughness = 0.62; m.material.metalness = 0; }
        if (kind === 'teeth' || kind === 'lashes' || kind === 'eyes') m.castShadow = false;
      }
      const mixer = new T.AnimationMixer(root), clips = {};
      for (const c of g.animations) clips[c.name] = c;
      body = { root, mesh, meshes, parts, bones, mixer, clips, index: mesh.geometry.index.array.slice(), vid: mesh.geometry.attributes._vid, pose: null };
      // Size: feet on the floor, HEIGHT tall. Measured in the rest pose, in the model's own units.
      root.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(mesh);
      body.scale = HEIGHT / Math.max(0.1, box.max.y - box.min.y); body.floor = box.min.y;
      const eyes = parts.eyes ? new T.Box3().setFromObject(parts.eyes) : null;
      const top = box.max.y, eyeY = eyes ? (eyes.min.y + eyes.max.y) / 2 : top - (top - box.min.y) * 0.1;
      const headR = (top - eyeY) / 1.12, front = eyes ? eyes.max.z : headR * 0.9;
      // Anchors for the drawn extras, kept relative to a bone so they follow every pose: a head frame (the drawn
      // head's units, radius 0.19, centred where the drawn head's centre would be) and a torso frame (the drawn
      // body's units, so its neck at height 1.13 lands on her neck and its shoulders on hers).
      const wp = n => (bone(n) ? bone(n).getWorldPosition(new T.Vector3()) : null);
      // The drawn body's shoulders are 0.175 from its middle; hers are about 1.3 head radii (this keeps the drawn
      // necklaces, wings and capes at the sizes they were fitted at).
      const neck = wp('neck01') || new T.Vector3(0, eyeY - headR * 1.5, 0);
      const kTorso = headR * 1.3 / 0.175;
      const anchor = (boneName, pos, sc) => {
        const b = bone(boneName); if (!b) return null;
        const w = new T.Matrix4().compose(pos, new T.Quaternion(), new T.Vector3(sc, sc, sc));
        return { bone: b, local: new T.Matrix4().copy(b.matrixWorld).invert().multiply(w) };
      };
      body.headAnchor = anchor('head', new T.Vector3(0, eyeY + headR * 0.01, front - headR * 0.95), headR / 0.19);
      body.torsoAnchor = anchor('spine02', new T.Vector3(0, neck.y - 1.13 * kTorso, neck.z), kTorso);
      body.restEye = (eyeY - box.min.y) * body.scale; body.headR = headR * body.scale;
      body.scalp = makeScalp(mesh, new T.Vector3(0, eyeY, front - headR * 0.95), headR);
      setPose('stand');
      R.ready = true;
    });
    return R.bodyPromise;
  }

  // Short hair on the scalp itself, under hair styles that leave the front of the head bare (a ponytail pulled back,
  // a bun). It is the body's own surface above a hairline, coloured like her hair, sharing the body's skin and shapes.
  const SCALP = ['hair-ponytail', 'hair-bun', 'hair-braid-bun', 'hair-afro', 'hair-short', 'hair-short-side', 'hair-wavy-short', 'hair-curls'];
  function makeScalp(mesh, centre, r) {
    const g = mesh.geometry, pos = g.attributes.position, idx = g.index.array, mw = mesh.matrixWorld, v = new T.Vector3();
    // Each vertex's cover (0 to 1), fading in just above the hairline so its edge is soft.
    const cover = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mw).sub(centre).divideScalar(r);
      const flat = Math.hypot(v.x, v.z) || 1, c = v.z / flat;
      // Hairline height (in head radii from the head's centre): high at the forehead, lower over the ears, low at the nape.
      const line = -0.12 + 0.62 * Math.pow(Math.max(0, c), 2) - 0.75 * Math.max(0, -c);
      const ear = Math.abs(v.x) > 0.75 && v.y < 0.12 && v.z > -0.5;
      const t = ear || v.y < -1.1 ? 0 : Math.min(1, Math.max(0, (v.y - line + 0.02) / 0.07));
      cover.set([1, 1, 1, t * t * (3 - 2 * t)], i * 4);
    }
    const out = [];
    for (let i = 0; i < idx.length; i += 3) if (cover[idx[i] * 4 + 3] + cover[idx[i + 1] * 4 + 3] + cover[idx[i + 2] * 4 + 3] > 0) out.push(idx[i], idx[i + 1], idx[i + 2]);
    const sg = new T.BufferGeometry();
    for (const k in g.attributes) sg.setAttribute(k, g.attributes[k]);
    sg.setAttribute('color', new T.BufferAttribute(cover, 4));
    sg.morphAttributes = g.morphAttributes; sg.morphTargetsRelative = g.morphTargetsRelative; sg.setIndex(out);
    const m = new T.MeshStandardMaterial({ color: '#3B2416', roughness: 0.85, metalness: 0, vertexColors: true, alphaToCoverage: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const sm = new T.SkinnedMesh(sg, m); sm.name = 'scalp';
    sm.morphTargetDictionary = mesh.morphTargetDictionary; sm.morphTargetInfluences = mesh.morphTargetInfluences.slice();
    sm.bind(mesh.skeleton, mesh.bindMatrix); sm.frustumCulled = false; sm.castShadow = false;
    return sm;
  }

  // An asset's meshes, re-bound to the body's bones by name.
  function adopt(id, g) {
    const kind = A[id].kind === 'eyebrows' ? 'eyebrows' : A[id].kind === 'hair' ? 'hair' : 'clothes';
    const out = [];
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => { if (o.isSkinnedMesh) out.push(o); });
    for (const m of out) {
      const bones = m.skeleton.bones.map(b => body.bones[b.name] || b);
      m.removeFromParent();
      m.bind(new T.Skeleton(bones, m.skeleton.boneInverses), body.mesh.bindMatrix);
      m.frustumCulled = false; m.castShadow = kind !== 'eyebrows'; m.receiveShadow = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach(x => setupMaterial(x, kind));
      if (kind === 'eyebrows') m.renderOrder = 2;
      // Layers, so a closer layer wins where two nearly touch (a shirt hem over the top of the trousers).
      const layer = { socks: 1, bottom: 2, shoes: 3, top: 4, dress: 4, glasses: 5, hat: 5, jewel: 5 }[id.split('-')[0]] || 0;
      if (layer) mats.forEach(x => { x.polygonOffset = true; x.polygonOffsetFactor = -layer; x.polygonOffsetUnits = -4 * layer; });
    }
    return { meshes: out, kind };
  }

  function setPose(id) {
    if (!body || body.pose === id) return;
    const clip = body.clips[id] || body.clips.stand;
    body.mixer.stopAllAction();
    for (const b of Object.values(body.bones)) { if (b.userData.rest) { b.position.copy(b.userData.rest[0]); b.quaternion.copy(b.userData.rest[1]); b.scale.copy(b.userData.rest[2]); } else b.userData.rest = [b.position.clone(), b.quaternion.clone(), b.scale.clone()]; }
    if (clip) { const a = body.mixer.clipAction(clip); a.reset(); a.play(); body.mixer.update(0); a.paused = true; }
    for (const b of Object.values(body.bones)) b.userData.posed = b.quaternion.clone();
    body.pose = id;
  }

  // ------------------------------------------------------------------------------------------------------------
  // Putting a design together
  // ------------------------------------------------------------------------------------------------------------
  const lin = hex => new T.Color(hex);           // ColorManagement converts sRGB hex to linear
  function worn(P) {
    const o = P.outfit && R.OUTFITS[P.outfit];
    let top = P.top, topC = P.topColor, bottom = P.bottom, botC = P.bottomColor, shoes = P.shoes, shoeC = P.shoesColor, socks = P.socks;
    if (o) [top, topC, bottom, botC, shoes, shoeC, socks] = [o[0], o[1] || topC, o[2], o[3] || botC, o[4], o[5] || shoeC, o[6]];
    if (!A[top]) top = 'top-tee';
    if (R.isDress(top)) bottom = null; else if (!A[bottom]) bottom = 'bottom-pants';
    if (!A[shoes]) shoes = 'shoes-sneakers';
    const items = [[A[P.hair] ? P.hair : 'hair-long', P.hairColor], [A[P.brows] ? P.brows : 'brows-natural', P.hairColor, 0.55],
      [top, topC], [bottom, botC], [shoes, shoeC], [A[socks] ? socks : null, '#FFFFFF']];
    if (A[P.glasses] && !P.shades) items.push([P.glasses]);
    if (SHADES.includes(P.shades)) items.push([P.shades]);
    if (A[P.earrings]) items.push([P.earrings]);
    if (P.neck === 'necklace') items.push(['jewel-pearls']);
    if (A[P.hat]) items.push([P.hat, HAT_COLOR[P.hat] || '#5C4A3A']);
    if (A[P.realHat]) items.push([P.realHat]);
    return items.filter(x => x[0]);
  }
  const HAT_COLOR = { 'hat-newsboy': '#6B5444' };
  R.need = P => ['body'].concat(worn(P).map(x => x[0])).filter(id => id === 'body' ? !R.ready : !cache[id]);

  // Each skin texture stands for one colour of the palette (the colour it looks like on screen); her colour picks the
  // nearest texture, and the texture is tinted by her colour over that one, so the palette's own steps stay even.
  const SKIN_REF = { light: '#F6D2B8', medium: '#E2AC82', deep: '#6F4128' };
  function skinChoice(P) {
    const target = new T.Color(P.skin), lum = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    let best = 'light', bd = 9;
    for (const [id, hex] of Object.entries(SKIN_REF)) {
      if (!CAT.body.skins[id]) continue;
      const d = Math.abs(Math.log(lum(new T.Color(hex))) - Math.log(Math.max(1e-4, lum(target)))); if (d < bd) { bd = d; best = id; }
    }
    const ref = new T.Color(SKIN_REF[best]);
    if (P.freckles && best === 'light' && CAT.body.skins.freckles) best = 'freckles';
    const f = (a, b) => Math.min(1.6, Math.max(0.4, a / b));
    return { id: best, tint: new T.Color(f(target.r, ref.r), f(target.g, ref.g), f(target.b, ref.b)) };
  }
  const EYE_TEX = { '#5B3A1E': 'brown', '#3A2412': 'darkbrown', '#7A6A2E': 'green', '#4E8B3A': 'green', '#3F7CC2': 'blue', '#7F8C99': 'grey', '#B07A2A': 'brownlight', '#4F9A94': 'bluegreen', '#8EC5E8': 'lightblue' };
  const eyeName = c => { const n = EYE_TEX[c] || 'brown'; return CAT.body.eyes[n] ? n : Object.keys(CAT.body.eyes)[0]; };

  function morphs(P) {
    const m = {};
    const shape = { round: 'shape-round', oval: 'shape-oval', heart: 'shape-heart', square: 'shape-square' }[P.face];
    if (shape) m[shape] = 0.7;
    const tune = P.tune || {};
    for (const [k] of R.TUNE) { const v = +tune[k] || 0; if (v) m[k + (v < 0 ? '-' : '+')] = Math.min(1, Math.abs(v)); }
    if (P.gender === 'boy') m.boy = 1;
    if (P.build === 'slim') m['build-'] = 0.8; else if (P.build === 'sturdy') m['build+'] = 0.8;
    const mouth = { smile: { mouthSmileLeft: 0.45, mouthSmileRight: 0.45 }, grin: { mouthSmileLeft: 0.85, mouthSmileRight: 0.85, cheekSquintLeft: 0.3, cheekSquintRight: 0.3 },
      small: { mouthSmileLeft: 0.2, mouthSmileRight: 0.2, mouthClose: 0.15 }, open: { mouthSmileLeft: 0.7, mouthSmileRight: 0.7, jawOpen: 0.22 } }[P.mouth] || {};
    Object.assign(m, mouth);
    return m;
  }
  function applyMorphs(meshes, m) {
    for (const x of meshes) {
      const d = x.morphTargetDictionary, inf = x.morphTargetInfluences; if (!d || !inf) continue;
      inf.fill(0); for (const k in m) if (d[k] !== undefined) inf[d[k]] = m[k];
    }
  }
  function hideUnder(ids) {
    const hide = new Set(); for (const id of ids) for (const v of hidesOf(id)) hide.add(v);
    const src = body.index, vid = body.vid.array, out = [];
    for (let i = 0; i < src.length; i += 3) {
      const a = src[i], b = src[i + 1], c = src[i + 2];
      // Only where the whole triangle is covered: hiding every triangle that touches a covered vertex opens gaps at
      // collars and cuffs.
      if (hide.has(Math.round(vid[a])) && hide.has(Math.round(vid[b])) && hide.has(Math.round(vid[c]))) continue;
      out.push(a, b, c);
    }
    const g = body.mesh.geometry; g.setIndex(out); g.index.needsUpdate = true;
  }

  // Some clothes come without a list of the skin they cover, so her skin can show through them where the boy shape is
  // fuller. They cover at least what a plain T-shirt or shorts cover.
  const HIDE_LIKE = { 'top-tucked-tee': 'top-tee', 'top-polo': 'top-tee', 'top-sweater': 'top-tee',
                      'bottom-cargo': 'bottom-jean-shorts', 'bottom-pants': 'bottom-jean-shorts', 'bottom-plaid-skirt': 'bottom-jean-shorts' };
  const hidesOf = id => ((A[id].hides || []).length ? A[id].hides : (A[HIDE_LIKE[id]] && A[HIDE_LIKE[id]].hides) || []);
  let lastKey = '';
  R.compose = function (group, P) {
    const missing = R.need(P);
    if (missing.length) {
      const go = () => Promise.all(missing.map(id => id === 'body' ? loadBody() : null)).then(() => Promise.all(R.need(P).map(load)));
      go().then(() => { if (R.onReady) R.onReady(); }, e => { R.failed = e.message; R.errors.push(e.message); if (R.onReady) R.onReady(); });
      return null;
    }
    const sk = skinChoice(P), eye = eyeName(P.eyeColor);
    const texWait = [loadTex('skin', sk.id), loadTex('eye', eye)];
    // Textures are small; show the avatar now with whichever skin it had and swap when ready.
    R.texturesReady = false;
    Promise.all(texWait).then(([st, et]) => { R.texturesReady = true;
      const bm = body.parts.body.material; if (bm.map !== st) { bm.map = st; bm.needsUpdate = true; }
      if (body.parts.eyes) { const em = body.parts.eyes.material; if (em.map !== et) { em.map = et; em.needsUpdate = true; } }
    }).catch(e => R.errors.push('texture: ' + e.message));
    body.parts.body.material.color.copy(sk.tint);

    const holder = new T.Group(); holder.name = 'real';
    const H = { short: 0.93, medium: 1, tall: 1.06 }[P.height] || 1;
    holder.scale.setScalar(body.scale * H); holder.position.y = -body.floor * body.scale * H;
    holder.add(body.root); group.add(holder);
    setPose(P.pose);

    const items = worn(P), meshes = body.meshes.slice(), hides = [];
    for (const [id, color, k] of items) {
      const c = cache[id];
      for (const m of c.meshes) {
        body.mesh.parent.add(m); meshes.push(m);
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const x of mats) {
          if (A[id].tint && color) { x.color.copy(lin(color)).multiplyScalar(A[id].kind === 'hair' || A[id].kind === 'eyebrows' ? 1.0 : 1.2); if (k) x.color.multiplyScalar(k); } else x.color.copy(x.userData.base);
        }
      }
      if (hidesOf(id).length) hides.push(id);
    }
    const hairId = items[0][0];
    if (body.scalp && SCALP.includes(hairId)) {
      body.mesh.parent.add(body.scalp); meshes.push(body.scalp);
      body.scalp.material.color.copy(lin(P.hairColor)).multiplyScalar(0.8);
    }
    // Pieces left over from the last design come off.
    const keep = new Set(meshes);
    for (const m of body.mesh.parent.children.slice()) if (m.isSkinnedMesh && !keep.has(m)) body.mesh.parent.remove(m);
    if (body.parts.lashes) body.parts.lashes.visible = P.lashes !== false;
    const key = hides.sort().join(',');
    if (key !== lastKey) { hideUnder(hides); lastKey = key; }
    const m = morphs(P);
    const topId = items[2] && items[2][0];
    if (!R.isDress(topId) && topId !== 'top-tucked-tee') m.under = 1.6;    // the shirt hangs over the waistband
    applyMorphs(meshes, m);
    body.morphs = m; body.all = meshes;

    holder.updateMatrixWorld(true);
    for (const g of body.anchors || []) g.removeFromParent();
    const head = new T.Group(), torso = new T.Group(); body.anchors = [head, torso];
    for (const [g, an] of [[head, body.headAnchor], [torso, body.torsoAnchor]]) {
      if (an) { an.local.decompose(g.position, g.quaternion, g.scale); an.bone.add(g); } else holder.add(g);
    }
    holder.updateMatrixWorld(true);
    // Her left hand, for things she holds: upright in the room (whatever the pose), in the drawn head's units.
    let hand = null;
    const wrist = bone('wrist.L'), knuckle = bone('finger3-1.L');
    if (wrist) {
      hand = new T.Group(); body.anchors.push(hand);
      const p = wrist.getWorldPosition(new T.Vector3());
      if (knuckle) p.lerp(knuckle.getWorldPosition(new T.Vector3()), 0.7);
      const s = body.headR * H / 0.19 * group.getWorldScale(new T.Vector3()).x;
      const w = new T.Matrix4().compose(p, group.getWorldQuaternion(new T.Quaternion()), new T.Vector3(s, s, s));
      new T.Matrix4().copy(wrist.matrixWorld).invert().multiply(w).decompose(hand.position, hand.quaternion, hand.scale);
      wrist.add(hand);
    }
    const eyeAt = group.worldToLocal(head.getWorldPosition(new T.Vector3()));
    return { head, torso, hand, H, eyeY: eyeAt.y, headR: body.headR * H, headBone: body.bones.head };
  };

  // Idle life: blinking and a gentle head sway, called every frame by avatar.js.
  R.tick = function (t, blink) {
    if (!body || !body.all) return;
    const m = body.morphs || {};
    for (const x of body.all) {
      const d = x.morphTargetDictionary, inf = x.morphTargetInfluences; if (!d) continue;
      for (const k of ['eyeBlinkLeft', 'eyeBlinkRight']) if (d[k] !== undefined) inf[d[k]] = Math.max(m[k] || 0, blink);
    }
    const hb = body.bones.head;
    if (hb && hb.userData.posed) { hb.quaternion.copy(hb.userData.posed); hb.rotateZ(Math.sin(t * 0.7) * 0.025); hb.rotateY(Math.sin(t * 0.43) * 0.03); }
  };
  R._body = () => body; R._tex = tex;
  R.preload = () => loadBody().catch(e => { R.failed = e.message; });
})();
