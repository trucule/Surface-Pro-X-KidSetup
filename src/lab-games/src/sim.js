const LAB = (typeof APP !== 'undefined' && APP) || 'kitchen';
// ===========================================================================
// Simulation. A 1600 x 1000 side-on plane (y down). The 3D view places this
// plane at z = 0; counter spawners sit behind it on the countertop.
// ===========================================================================
const W = 1600, H = 1000;
const G = 1800;
const POT = { x0: 590, x1: 1010, rim: 470, bottom: 800, wall: 16 };
const CAP = POT.bottom - POT.rim - 10;
const COUNTER = 840;
const HOT_HANDS = 55;   // above this, hands pull back out of the pot

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------------------------------------------------------------------------
// Sound (synthesized)
// ---------------------------------------------------------------------------
let actx = null, muted = false;
const lastSfx = {};
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(f, dur, type, vol, slide) {
  const a = audio(); if (!a || muted) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + dur);
  g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq, q) {
  const a = audio(); if (!a || muted) return;
  const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination); src.start(t);
}
function sfx(name) {
  const now = performance.now();
  const gap = { yelp: 900, splash: 90, fizz: 300, plop: 60, pop: 40, sizzle: 400, bubble: 120, swish: 160, ouch: 600, knock: 250, clunk: 300, chop: 70 }[name] || 50;
  if (lastSfx[name] && now - lastSfx[name] < gap) return;
  lastSfx[name] = now;
  switch (name) {
    case 'pop': tone(rand(480, 620), 0.09, 'sine', 0.18, 380); break;
    case 'plop': tone(rand(200, 260), 0.14, 'sine', 0.2, -110); break;
    case 'splash': noise(0.16, 0.08, 1400, 0.7); break;
    case 'swish': noise(0.22, 0.05, 900, 0.6); break;
    case 'fizz': noise(0.6, 0.05, 4200, 0.5); break;
    case 'sizzle': noise(0.5, 0.03, 6000, 0.4); break;
    case 'bubble': tone(rand(300, 500), 0.06, 'sine', 0.06, 200); break;
    case 'click': tone(900, 0.05, 'square', 0.05); break;
    case 'whoosh': noise(0.4, 0.12, 700, 0.4); break;
    case 'clink': tone(1800, 0.12, 'triangle', 0.08, -200); break;
    case 'boing': tone(160, 0.25, 'sine', 0.15, 260); break;
    case 'crack': noise(0.08, 0.2, 3000, 2); tone(900, 0.06, 'square', 0.05, -500); break;
    case 'ouch': tone(700, 0.25, 'triangle', 0.14, -380); break;
    // Three sharp, falling cries: "ow! ow! ow!"
    case 'yelp': [0, 230, 460].forEach((d, i) => setTimeout(() => { tone(980 - i * 60, 0.2, 'sawtooth', 0.09, -520); tone(1460 - i * 80, 0.16, 'triangle', 0.06, -700); }, d)); break;
    case 'knock': tone(260, 0.08, 'square', 0.08, -60); break;
    case 'thud': tone(90, 0.18, 'sine', 0.2, -40); noise(0.08, 0.06, 400, 0.05); break;
    case 'geyser': noise(1.4, 0.16, 2600, 0.4); break;
    case 'ding': tone(1568, 0.5, 'sine', 0.12, 0); tone(2093, 0.4, 'sine', 0.06, 0); break;
    case 'yay': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.12, 0), i * 110)); break;
    case 'clunk': tone(140, 0.18, 'square', 0.12, -60); noise(0.1, 0.12, 900, 1); break;
    case 'chop': noise(0.05, 0.05, 2400, 1.5); break;
  }
}

// ---------------------------------------------------------------------------
// What's in the kitchen
// ---------------------------------------------------------------------------
const SUB = {
  water:   { col: '#5BB8F5', liquid: true,  rate: 45 },
  milk:    { col: '#FBFBF6', liquid: true,  rate: 35 },
  oil:     { col: '#F5C542', liquid: true,  rate: 35 },
  honey:   { col: '#E8A317', liquid: true,  rate: 18, thick: true },
  vinegar: { col: '#EEF3F7', liquid: true,  rate: 35 },
  soap:    { col: '#7DDB8A', liquid: true,  rate: 14 },
  cola:    { col: '#6B3A22', liquid: true,  rate: 35 },
  ojuice:  { col: '#FFA21F', liquid: true, rate: 0 },
  lemon:   { col: '#FFF27A', liquid: true,  rate: 6 },
  salt:    { col: '#FFFFFF', liquid: false, rate: 12 },
  pepper:  { col: '#2E2A26', liquid: false, rate: 8 },
  sugar:   { col: '#FFF7E6', liquid: false, rate: 12 },
  soda:    { col: '#F2F6FF', liquid: false, rate: 12 },
  sand:    { col: '#E8C27A', liquid: false, rate: 22 },
  flour:   { col: '#FFF6E8', liquid: false, rate: 22 },
  starch:  { col: '#FBFBF7', liquid: false, rate: 22 },  yeast: { col: '#C9A66B', liquid: false, rate: 10 },
  peroxide: { col: '#EAF6FF', liquid: true, rate: 35 },  glue: { col: '#F4F4EE', liquid: true, rate: 18, thick: true },
  activator: { col: '#D9F1FF', liquid: true, rate: 20 }, cabbagejuice: { col: '#6A3FA0', liquid: true, rate: 35 },
  fizzwater: { col: '#E6F7FF', liquid: true, rate: 45 },
  red:     { col: '#E63946', liquid: true,  rate: 4, drop: true },
  yellow:  { col: '#FFD100', liquid: true,  rate: 4, drop: true },
  blue:    { col: '#1E78FF', liquid: true,  rate: 4, drop: true }
};
// d: density (water = 1). Floats or sinks the way the real thing does.
const OBJ = {
  apple:   { r: 33, d: 0.85 }, banana: { r: 36, d: 0.94 }, orange: { r: 32, d: 0.87, juice: 25 }, lemon: { r: 28, d: 0.92, juice: 25 },
  tomato:  { r: 30, d: 0.95 }, grapes: { r: 32, d: 1.06 }, carrot: { r: 36, d: 1.04 }, mushroom: { r: 26, d: 0.5 },
  cabbage: { r: 40, d: 0.9, dye: 40 }, egg: { r: 28, d: 1.08 }, cheese: { r: 30, d: 1.1 }, cookie: { r: 26, d: 1.2 },
  choc:    { r: 28, d: 1.3 }, icecream: { r: 28, d: 0.95 }, mint: { r: 28, d: 0.95 }, candy: { r: 26, d: 1.3 },
  duck:    { r: 34, d: 0.35 }, rock: { r: 30, d: 2.6 }, coin: { r: 19, d: 7.5, metal: true }, ice: { r: 30, d: 0.92 },
  sponge:  { r: 30, d: 0.18 }, magnet: { r: 32, d: 6.0 }, butter: { r: 27, d: 0.9 }, mallow: { r: 24, d: 0.45 },
  kernel:  { r: 13, d: 1.2 }, whisk: { r: 34, d: 1.4, metal: true, tool: 2 }, spoon: { r: 34, d: 0.7, tool: 1.6 },
  knife:   { r: 34, d: 2.0, metal: true, tool: 1 },
  raisin:  { r: 9, d: 1.15 }, tablet: { r: 14, d: 1.4 }, paper: { r: 32, d: 0.9 }, stick: { r: 36, d: 1.2 },
  slime:   { r: 34, d: 1.1 }, curd: { r: 12, d: 1.05 },
  masher:  { r: 34, d: 1.6, metal: true, tool: 1 },
  fork:    { r: 30, d: 1.6, metal: true, tool: 0.6 }, teaspoon: { r: 28, d: 1.4, metal: true, tool: 1 },
  plate:   { r: 46, d: 1.2, flat: 6 },
  bowl:    { r: 34, d: 0.9, cup: 70 }, cup: { r: 24, d: 0.9, cup: 40 }, mug: { r: 28, d: 0.9, cup: 45 }, glass: { r: 26, d: 1.0, cup: 45 },
  mash:    { r: 30, d: 1.1 },
  bread:   { r: 36, d: 0.25, soak: true }, croissant: { r: 32, d: 0.3, soak: true }, donut: { r: 30, d: 0.35, soak: true },
  cupcake: { r: 30, d: 0.6, soak: true }, strawberry: { r: 24, d: 0.92, jam: true }, broccoli: { r: 34, d: 0.95 },
  corn:    { r: 36, d: 1.1 }, pear: { r: 32, d: 0.98 }, pineapple: { r: 42, d: 0.9 }, avocado: { r: 30, d: 1.05 },
  cherries: { r: 26, d: 1.05, jam: true },
  popcorn: { r: 25, d: 0.22 }, friedegg: { r: 40, d: 0.55 }, rawegg: { r: 30, d: 1.03 }, shell: { r: 20, d: 0.8 }
};

// ---------------------------------------------------------------------------
// Kitchen areas. The counter is the workspace; the fridge, pantry and cabinets
// hold everything else. Tapping something in storage brings it to the counter.
// ---------------------------------------------------------------------------
const SECTIONS = ['counter', 'fridge', 'pantry', 'cabinets', 'oven'];
const STORAGE = {
  fridge:   { subs: ['milk', 'cola'],
              objs: ['egg', 'butter', 'cheese', 'apple', 'orange', 'lemon', 'tomato', 'grapes', 'strawberry', 'cherries', 'pear', 'avocado',
                     'carrot', 'cabbage', 'mushroom', 'broccoli'],
              freezer: ['ice', 'icecream', 'mint'] },
  pantry:   { subs: ['flour', 'sugar', 'salt', 'pepper', 'soda', 'oil', 'honey', 'vinegar'],
              objs: ['bread', 'croissant', 'donut', 'cupcake', 'cookie', 'choc', 'candy', 'mallow', 'kernel', 'banana', 'pineapple', 'corn'] },
  cabinets: { subs: ['water', 'soap', 'sand', 'red', 'yellow', 'blue'],
              objs: ['plate', 'bowl', 'cup', 'glass', 'mug', 'knife', 'fork', 'teaspoon', 'spoon', 'whisk', 'masher', 'sponge', 'duck', 'rock', 'coin', 'magnet'] }
};
let section = 'counter';
// What everything is called, for the labels.
const NAMES = {
  obj: { apple: 'Apple', banana: 'Banana', orange: 'Orange', lemon: 'Lemon', tomato: 'Tomato', grapes: 'Grapes', carrot: 'Carrot',
    mushroom: 'Mushroom', cabbage: 'Red cabbage', egg: 'Egg', cheese: 'Cheese', cookie: 'Cookie', choc: 'Chocolate', icecream: 'Ice cream',
    mint: 'Mint ice cream', candy: 'Candy', duck: 'Rubber duck', rock: 'Rock', coin: 'Coin', ice: 'Ice', sponge: 'Sponge', magnet: 'Magnet',
    butter: 'Butter', mallow: 'Marshmallow', kernel: 'Popcorn kernel', whisk: 'Whisk', spoon: 'Big spoon', teaspoon: 'Spoon', fork: 'Fork', knife: 'Knife', masher: 'Masher', mash: 'Mash',
    plate: 'Plate', bowl: 'Bowl', cup: 'Cup', mug: 'Mug', glass: 'Glass',
    raisin: 'Raisin', tablet: 'Fizzy tablet', paper: 'Paper', stick: 'Stick', slime: 'Slime', curd: 'Milk plastic', bread: 'Bread',
    croissant: 'Croissant', donut: 'Donut', cupcake: 'Cupcake', strawberry: 'Strawberry', broccoli: 'Broccoli', corn: 'Corn', pear: 'Pear',
    pineapple: 'Pineapple', avocado: 'Avocado', cherries: 'Cherries', popcorn: 'Popcorn', friedegg: 'Cooked egg', rawegg: 'Egg', shell: 'Eggshell' },
  sub: { water: 'Water', milk: 'Milk', oil: 'Oil', honey: 'Honey', vinegar: 'Vinegar', soap: 'Dish soap', cola: 'Cola', lemon: 'Lemon juice',
    salt: 'Salt', pepper: 'Pepper', sugar: 'Sugar', soda: 'Baking soda', sand: 'Sand', flour: 'Flour', red: 'Red', yellow: 'Yellow', blue: 'Blue',
    starch: 'Cornstarch', yeast: 'Yeast', peroxide: 'Peroxide', glue: 'Glue', activator: 'Contact solution', cabbagejuice: 'Cabbage juice', fizzwater: 'Fizzy water' }
};
const nameOf = (kind, type) => (NAMES[kind] && NAMES[kind][type]) || type;
// A body's name, including what it has become: "Mashed avocado", "Toast", "Boiled egg".
function bodyName(b) {
  if (b.type === 'mash') return 'Mashed ' + nameOf('obj', b.src).toLowerCase();
  if (b.type === 'bread' && b.buttered) return 'Buttered toast';
  if (b.type === 'bread' && b.toast > 0.5) return 'Toast';
  if (b.type === 'egg' && b.boiled) return 'Boiled egg';
  if (b.type === 'friedegg' && b.scrambled) return 'Scrambled egg';
  if (b.type === 'egg' && b.naked) return 'Naked egg';
  if (b.type === 'coin' && b.tarnish != null) return b.tarnish < 0.05 ? 'Shiny penny' : 'Penny';
  if (b.type === 'stick' && b.crystal > 0.3) return 'Rock candy';
  if (b.type === 'paper' && b.reveal > 0.5) return 'Secret message';
  if (OBJ[b.type] && OBJ[b.type].cup && b.fill > 2) return nameOf('obj', b.type) + ' of ' + (b.drink || 'drink');
  return nameOf('obj', b.type);
}

// Dangerous touches the view should react to (knife on her hand), queued here.
const dangers = [];

// Decorative wall shelves above the counter (heights only).
const SHELF_ROWS = [{ y: 92 }];

// Her basket: everything she has collected. She can take as many of each as she likes,
// anywhere: onto the counter, onto the cutting board, into the pot, into the oven.
const INV = { subs: ['water'], objs: [], version: 1 };
function inBasket(kind, type) { return (kind === 'sub' ? INV.subs : INV.objs).includes(type); }
// Tapping something in storage puts it in the basket; tapping it again puts it back.
function toggleBasket(kind, type) {
  const list = kind === 'sub' ? INV.subs : INV.objs;
  const i = list.indexOf(type);
  if (i >= 0) list.splice(i, 1); else list.push(type);
  INV.version++;
  return i < 0;
}
function addToBasket(kind, type) { if (!inBasket(kind, type)) toggleBasket(kind, type); }
function whereIs(kind, type) {
  for (const [area, a] of Object.entries(STORAGE)) if ((kind === 'sub' ? a.subs : [...a.objs, ...(a.freezer || [])]).includes(type)) return area;
  return null;
}

// What kind of thing is it?
const CUPS = new Set(['bowl', 'cup', 'mug', 'glass']);
const BLADES = new Set(['knife', 'masher', 'fork']);            // held, they pass through food rather than shove it
const NOT_FOOD = new Set(['knife', 'fork', 'teaspoon', 'spoon', 'whisk', 'masher', 'plate', 'bowl', 'cup', 'mug', 'glass',
  'duck', 'rock', 'coin', 'magnet', 'sponge', 'shell']);
const isFood = (b) => !NOT_FOOD.has(b.type);
const hints = [];          // gentle tips for the view to show ("Put it on the cutting board!")

// The cutting board, on the counter to the left of the pot.
const BOARD = { x0: 170, x1: 470, top: COUNTER - 20 };
const CHOPPABLE = new Set(['apple', 'banana', 'orange', 'lemon', 'tomato', 'carrot', 'mushroom', 'cabbage', 'cheese', 'cookie', 'choc', 'candy',
  'butter', 'mallow', 'bread', 'croissant', 'donut', 'cupcake', 'strawberry', 'broccoli', 'corn', 'pear', 'pineapple', 'avocado', 'ice', 'sponge', 'grapes']);
// Toaster: drop bread in the slot; it goes down, toasts, and pops up with a ding.
const TOASTER = { x0: 1190, x1: 1330, top: COUNTER - 64, slot: 1260, busy: null, t: 0 };
// What was served, for recipes: what it has become, where that matters.
function serveKey(b) {
  if (b.type === 'bread' && b.toast > 0.5) return 'toast';
  if (b.type === 'friedegg' && b.scrambled) return 'scrambled';
  if (b.type === 'egg' && b.boiled) return 'boiledegg';
  if (b.type === 'mash') return 'mash-' + b.src;
  return b.type;
}
function plateUnder(b) {
  if (b.type === 'plate') return null;
  for (const p of bodies) {
    if (p.type !== 'plate' || p.place !== b.place || p === b) continue;
    if (Math.abs(b.x - p.x) < p.r * 1.25 && b.y <= p.y) return p;
  }
  return null;
}
function floorAt(b) {
  const p = plateUnder(b);
  if (p) return p.y - (OBJ.plate.flat + 2);
  if (b.place !== 'counter') return COUNTER;
  if (b.x > BOARD.x0 && b.x < BOARD.x1) return BOARD.top;
  if (b.x > TOASTER.x0 && b.x < TOASTER.x1 && !b.inToaster) return TOASTER.top;
  return COUNTER;
}
function updateToaster(dt) {
  const tb = TOASTER.busy;
  if (tb) {
    if (!bodies.includes(tb)) { TOASTER.busy = null; return; }
    TOASTER.t += dt;
    tb.x = TOASTER.slot; tb.y = TOASTER.top + 26; tb.vx = tb.vy = 0; tb.rot = 0;
    tb.toast = Math.min(1, tb.toast + dt * 0.3);
    if (TOASTER.t > 3.5) {
      tb.inToaster = false; tb.locked = false; tb.vy = -700; tb.vx = -170; tb.y = TOASTER.top - tb.r - 2;
      tb.poppedAt = time;   // it lands on the counter beside the toaster, not back in the slot
      TOASTER.busy = null; sfx('ding');
      logEvent('toaster', tb.type);
    }
    return;
  }
  for (const b of bodies) {
    if (b.held || b.place !== 'counter' || !['bread', 'croissant'].includes(b.type)) continue;
    if (b.poppedAt != null && time - b.poppedAt < 2.5) continue;
    if (Math.abs(b.x - TOASTER.slot) < 46 && b.y + b.r >= TOASTER.top - 8 && b.y < TOASTER.top + 10 && Math.abs(b.vy) < 220) {
      TOASTER.busy = b; TOASTER.t = 0; b.inToaster = true; b.locked = true; sfx('click');
      break;
    }
  }
}
function onBoard(b) { return b.place === 'counter' && b.x > BOARD.x0 && b.x < BOARD.x1 && b.y + b.r > BOARD.top - 6 && !b.held; }

// A quick downward stroke of the knife over something on the board cuts it in two.
function eggRimCheck() {
  for (const e of bodies) {
    if (e.type !== 'egg' || !e.held || e.boiled) continue;
    const speed = Math.hypot(e.vx, e.vy);
    if (speed < 450) continue;
    const nearRim = [POT.x0 - POT.wall / 2, POT.x1 + POT.wall / 2].some(rx => Math.hypot(e.x - rx, e.y - POT.rim) < e.r + 14);
    if (!nearRim) continue;
    const inward = e.x < 800 ? 1 : -1;
    bodies.splice(bodies.indexOf(e), 1);
    sfx('crack'); logEvent('crack', 'egg');
    for (const h of holds.values()) if (h.body === e) h.body = null;
    const raw = makeBody('rawegg', e.x + inward * (e.r + 30), POT.rim + 20); raw.vy = 60;
    [-1, 1].forEach(sd => { const sh = makeBody('shell', e.x - inward * 10 + sd * 10, e.y - 8); sh.vx = -inward * rand(80, 200); sh.vy = -rand(150, 300); sh.vr = sd * rand(3, 6); });
    break;
  }
}
function forkCheck() {
  for (const f of bodies) {
    if (f.type !== 'fork') continue;
    const carried = f.carry != null ? bodies.find(b => b.id === f.carry) : null;
    if (!f.held) { if (carried) { carried.stuck = null; carried.vy = 60; } f.carry = null; continue; }
    if (carried) continue;
    f.carry = null;
    const tip = { x: f.x, y: f.y + f.r * 0.9 };
    for (const o of bodies) {
      if (o === f || o.held || o.stuck || !isFood(o) || o.inToaster) continue;
      if (Math.hypot(o.x - tip.x, o.y - tip.y) < o.r + 4) { o.stuck = f.id; f.carry = o.id; sfx('pop'); logEvent('fork', o.type); break; }
    }
  }
}
function bladeTip(k) { return k.y + k.r; }           // held blade-down: the working end is at the bottom
function chopCheck(dt) {
  eggRimCheck();
  mashCheck(dt);
  updateToaster(dt);
  forkCheck();
  for (const k of bodies) {
    if (k.type !== 'knife') continue;
    if (!k.held) { k.knifePrev = null; continue; }
    const tip = bladeTip(k), prev = k.knifePrev ?? tip;
    k.knifePrev = tip;
    k.chopCool = Math.max(0, (k.chopCool || 0) - dt);
    if (k.chopCool > 0 || tip <= prev + 0.5) continue;           // only on the way down
    // Her own hand on the board: ouch.
    let cutHand = false;
    for (const [id, h] of holds) {
      const st = h.stir;
      if (!st || Math.abs(st.x - k.x) > 55 || st.x < BOARD.x0 - 20 || st.x > BOARD.x1 + 20 || st.y < BOARD.top - 90) continue;
      if (prev < st.y - 20 && tip >= st.y - 20) { dangers.push({ id, x: st.x, y: st.y, why: 'knife' }); k.chopCool = 0.6; cutHand = true; }
    }
    if (cutHand) continue;
    for (const o of bodies) {
      if (o === k || o.held || !CHOPPABLE.has(o.type)) continue;
      if (Math.abs(o.x - k.x) > o.r + 10) continue;
      const line = o.y - o.r * 0.6;                              // as soon as the blade goes into the top of it
      if (!(prev < line && tip >= line)) continue;
      if (!onBoard(o)) { if (o.place === 'counter' && !o.inPot) { hints.push('board'); k.chopCool = 0.8; sfx('knock'); } break; }
      if (o.r < OBJ[o.type].r * 0.4) { sfx('knock'); k.chopCool = 0.3; break; }   // too small to cut again
      chop(o); k.chopCool = 0.25;
      break;
    }
  }
}
// Masher: press soft food on the board until it's mashed.
const MASHABLE = new Set(['avocado', 'banana', 'strawberry', 'bread', 'cupcake', 'pear', 'tomato', 'mallow', 'butter']);
function mashCheck(dt) {
  for (const k of bodies) {
    if (k.type !== 'masher') continue;
    if (!k.held) { k.mashPrev = null; continue; }
    const tip = k.y + k.r, prev = k.mashPrev ?? tip; k.mashPrev = tip;
    k.mashCool = Math.max(0, (k.mashCool || 0) - dt);
    if (k.mashCool > 0 || tip <= prev + 0.5) continue;
    for (const o of bodies) {
      if (o === k || !MASHABLE.has(o.type)) continue;
      if (Math.abs(o.x - k.x) > o.r + 16) continue;
      const line = o.y - o.r * 0.3;
      if (!(prev < line && tip >= line)) continue;
      if (!onBoard(o)) { if (o.place === 'counter' && !o.inPot) { hints.push('board'); k.mashCool = 0.8; } break; }
      o.mashed = (o.mashed || 0) + 1; k.mashCool = 0.3; sfx('plop');
      for (let i = 0; i < 4; i++) spark(o.x + rand(-o.r, o.r), o.y, '#FFFFFF');
      if (o.mashed >= 3) {
        const m = makeBody('mash', o.x, o.y); m.src = o.type; m.place = o.place; m.r = Math.max(18, o.r * 1.05);
        bodies.splice(bodies.indexOf(o), 1);
        logEvent('mash', o.type);
      }
      break;
    }
  }
}
function chop(o) {
  o.r *= 0.79; o.cut = (o.cut || 0) + 1; o.juice /= 2; o.mass0 /= 2;
  const twin = makeBody(o.type, o.x + o.r * 0.9, o.y);
  for (const k of ['r', 'd', 'cut', 'juice', 'mass0', 'toast', 'cook', 'melt', 'water', 'soak', 'dye', 'place']) twin[k] = o[k];
  o.x -= o.r * 0.9; o.vx = -60; twin.vx = 60; o.vy = twin.vy = -80;
  sfx('chop');
  for (let i = 0; i < 6; i++) spark(o.x + o.r, o.y, '#FFFFFF');
  logEvent('chop', o.type);
}

// What has happened, so recipe steps can tick themselves off.
const events = [];
const lastLog = new Map();
function logEvent(kind, type) {
  const key = kind + ':' + (type || '');
  if (time - (lastLog.get(key) ?? -9) < 0.5) return;
  lastLog.set(key, time);
  events.push({ kind, type: type || null, t: time, where: section });
  if (events.length > 400) events.splice(0, 100);
}
function happened(kind, type, since, where) {
  return events.some(e => e.t >= since && e.kind === kind && (type == null || e.type === type) && (!where || e.where === where));
}

const RECIPES = [
  { id: 'smoothie', cat: 'drinks', name: 'Smoothie', icon: '🥤', need: [['obj', 'banana'], ['obj', 'strawberry'], ['sub', 'milk'], ['obj', 'glass']],
    steps: [{ text: 'Put in a banana', icon: ['obj', 'banana'], act: '⬇️', done: t => happened('inpot', 'banana', t) },
            { text: 'Put in a strawberry', icon: ['obj', 'strawberry'], act: '⬇️', done: t => happened('inpot', 'strawberry', t) },
            { text: 'Pour in milk', icon: ['sub', 'milk'], act: '💧', done: t => happened('pour', 'milk', t) },
            { text: 'Blend it smooth', act: '🌀', done: t => happened('blend', 'banana', t) && happened('blend', 'strawberry', t) },
            { text: 'Scoop it into a glass', icon: ['obj', 'glass'], act: '🥄', done: t => happened('scoop', null, t) }] },
  { id: 'cake', cat: 'sweets', name: 'Cake', icon: '🎂', need: [['sub', 'flour'], ['sub', 'sugar'], ['obj', 'egg'], ['sub', 'milk']],
    steps: [{ text: 'Pour in flour', icon: ['sub', 'flour'], act: '💧', done: t => happened('pour', 'flour', t) },
            { text: 'Pour in sugar', icon: ['sub', 'sugar'], act: '💧', done: t => happened('pour', 'sugar', t) },
            { text: 'Crack an egg on the edge of the pot', icon: ['obj', 'egg'], act: '💥', done: t => happened('crack', 'egg', t) },
            { text: 'Pour in milk', icon: ['sub', 'milk'], act: '💧', done: t => happened('pour', 'milk', t) },
            { text: 'Stir it into batter', act: '🥄', done: t => happened('batter', null, t) },
            { text: 'Bake it in the oven', act: '🔥', done: t => happened('bake', 'cake', t, 'oven') }] },
  { id: 'popcorn', cat: 'snacks', name: 'Popcorn', icon: '🍿', need: [['sub', 'oil'], ['obj', 'kernel']],
    steps: [{ text: 'Pour in a little oil', icon: ['sub', 'oil'], act: '💧', done: t => happened('pour', 'oil', t) },
            { text: 'Put in corn kernels', icon: ['obj', 'kernel'], act: '⬇️', done: t => happened('inpot', 'kernel', t) },
            { text: 'Heat it until it pops', act: '🔥', done: t => happened('pop', 'kernel', t) }] },
  { id: 'lemonade', cat: 'drinks', name: 'Lemonade', icon: '🍋', need: [['obj', 'lemon'], ['obj', 'knife'], ['sub', 'water'], ['sub', 'sugar'], ['obj', 'cup']],
    steps: [{ text: 'Cut the lemon on the board', icon: ['obj', 'lemon'], act: '🔪', done: t => happened('chop', 'lemon', t) },
            { text: 'Pour in water', icon: ['sub', 'water'], act: '💧', done: t => happened('pour', 'water', t) },
            { text: 'Put in the lemon', icon: ['obj', 'lemon'], act: '⬇️', done: t => happened('inpot', 'lemon', t) },
            { text: 'Pour in sugar', icon: ['sub', 'sugar'], act: '💧', done: t => happened('pour', 'sugar', t) },
            { text: 'Stir it', act: '🥄', done: t => happened('stir', null, t) },
            { text: 'Scoop it into a cup', icon: ['obj', 'cup'], act: '🥄', done: t => happened('scoop', null, t) }] },
  { id: 'volcano', cat: 'science', name: 'Volcano', icon: '🌋', need: [['sub', 'soda'], ['sub', 'red'], ['sub', 'vinegar']],
    steps: [{ text: 'Pour in baking soda', icon: ['sub', 'soda'], act: '💧', done: t => happened('pour', 'soda', t) },
            { text: 'Add red color', icon: ['sub', 'red'], act: '💧', done: t => happened('pour', 'red', t) },
            { text: 'Pour in vinegar', icon: ['sub', 'vinegar'], act: '💧', done: t => happened('pour', 'vinegar', t) },
            { text: 'Watch it fizz!', act: '🌋', done: t => happened('fizz', null, t) }] },
  { id: 'magic', cat: 'science', name: 'Magic Milk', icon: '🌈', need: [['sub', 'milk'], ['sub', 'red'], ['sub', 'yellow'], ['sub', 'blue'], ['sub', 'soap']],
    steps: [{ text: 'Pour in milk', icon: ['sub', 'milk'], act: '💧', done: t => happened('pour', 'milk', t) },
            { text: 'Drop in colors', icon: ['sub', 'blue'], act: '💧', done: t => ['red', 'yellow', 'blue'].filter(c => happened('pour', c, t)).length >= 2 },
            { text: 'Add a drop of soap', icon: ['sub', 'soap'], act: '💧', done: t => happened('magic', null, t) }] },
  { id: 'soup', cat: 'meals', name: 'Veggie Soup', icon: '🥕', need: [['obj', 'carrot'], ['obj', 'tomato'], ['obj', 'broccoli'], ['obj', 'knife'], ['sub', 'water'], ['obj', 'bowl']],
    steps: [{ text: 'Cut the carrot', icon: ['obj', 'carrot'], act: '🔪', done: t => happened('chop', 'carrot', t) },
            { text: 'Cut the tomato', icon: ['obj', 'tomato'], act: '🔪', done: t => happened('chop', 'tomato', t) },
            { text: 'Pour in water', icon: ['sub', 'water'], act: '💧', done: t => happened('pour', 'water', t) },
            { text: 'Put in the veggies', icon: ['obj', 'broccoli'], act: '⬇️', done: t => ['carrot', 'tomato', 'broccoli'].every(v => happened('inpot', v, t)) },
            { text: 'Boil it', act: '♨️', done: t => happened('boil', null, t) },
            { text: 'Scoop it into a bowl', icon: ['obj', 'bowl'], act: '🥄', done: t => happened('scoop', null, t) }] },
  { id: 'toast', cat: 'meals', name: 'Toast', icon: '🍞', need: [['obj', 'bread'], ['obj', 'knife'], ['obj', 'fork'], ['obj', 'plate']],
    steps: [{ text: 'Slice the bread', icon: ['obj', 'bread'], act: '🔪', done: t => happened('chop', 'bread', t) },
            { text: 'Put the bread in the pot', icon: ['obj', 'bread'], act: '⬇️', done: t => happened('inpot', 'bread', t) },
            { text: 'Toast it in the oven', act: '🔥', done: t => happened('toast', 'bread', t, 'oven') },
            { text: 'Take it out with a fork', icon: ['obj', 'fork'], act: '🍴', done: t => happened('fork', 'bread', t) },
            { text: 'Put it on a plate', icon: ['obj', 'plate'], act: '🍽️', done: t => happened('serve', 'toast', t) }] },
  { id: 'fruitsalad', cat: 'snacks', name: 'Fruit Salad', icon: '🍓', need: [['obj', 'apple'], ['obj', 'banana'], ['obj', 'strawberry'], ['obj', 'knife'], ['obj', 'plate']],
    steps: [{ text: 'Cut the apple', icon: ['obj', 'apple'], act: '🔪', done: t => happened('chop', 'apple', t) },
            { text: 'Cut the banana', icon: ['obj', 'banana'], act: '🔪', done: t => happened('chop', 'banana', t) },
            { text: 'Cut the strawberry', icon: ['obj', 'strawberry'], act: '🔪', done: t => happened('chop', 'strawberry', t) },
            { text: 'Put the fruit on a plate', icon: ['obj', 'plate'], act: '🍽️', done: t => ['apple', 'banana', 'strawberry'].every(f => happened('serve', f, t)) }] },
  { id: 'buttertoast', cat: 'meals', name: 'Buttered Toast', icon: '🧈', need: [['obj', 'bread'], ['obj', 'butter'], ['obj', 'plate']],
    steps: [{ text: 'Put bread in the toaster', icon: ['obj', 'bread'], act: '⬇️', done: t => happened('toaster', 'bread', t) },
            { text: 'Put butter on the toast', icon: ['obj', 'butter'], act: '🧈', done: t => happened('spread', 'butter', t) },
            { text: 'Put it on a plate', icon: ['obj', 'plate'], act: '🍽️', done: t => happened('serve', 'toast', t) }] },
  { id: 'guac', cat: 'snacks', name: 'Guacamole', icon: '🥑', need: [['obj', 'avocado'], ['obj', 'tomato'], ['obj', 'lemon'], ['obj', 'knife'], ['obj', 'masher'], ['obj', 'spoon']],
    steps: [{ text: 'Mash the avocado on the board', icon: ['obj', 'avocado'], act: '👊', done: t => happened('mash', 'avocado', t) },
            { text: 'Cut the tomato', icon: ['obj', 'tomato'], act: '🔪', done: t => happened('chop', 'tomato', t) },
            { text: 'Put them in the pot', icon: ['obj', 'avocado'], act: '⬇️', done: t => happened('inpot', 'mash-avocado', t) && happened('inpot', 'tomato', t) },
            { text: 'Cut a lemon and squeeze it in', icon: ['obj', 'lemon'], act: '✊', done: t => happened('squeeze', 'lemon', t) },
            { text: 'Stir it with a spoon', icon: ['obj', 'spoon'], act: '🥄', done: t => happened('stir', null, t) }] },
  { id: 'oj', cat: 'drinks', name: 'Orange Juice', icon: '🍊', need: [['obj', 'orange'], ['obj', 'knife'], ['obj', 'glass']],
    steps: [{ text: 'Cut the orange', icon: ['obj', 'orange'], act: '🔪', done: t => happened('chop', 'orange', t) },
            { text: 'Squeeze it over the pot', icon: ['obj', 'orange'], act: '✊', done: t => happened('squeeze', 'orange', t) },
            { text: 'Scoop it into a glass', icon: ['obj', 'glass'], act: '🥄', done: t => happened('scoop', null, t) }] },
  { id: 'scrambled', cat: 'meals', name: 'Scrambled Eggs', icon: '🍳', need: [['obj', 'butter'], ['obj', 'egg'], ['obj', 'whisk'], ['obj', 'fork'], ['obj', 'plate']],
    steps: [{ text: 'Melt butter in the hot pot', icon: ['obj', 'butter'], act: '🔥', done: t => happened('melt', 'butter', t) },
            { text: 'Crack an egg on the edge', icon: ['obj', 'egg'], act: '💥', done: t => happened('crack', 'egg', t) },
            { text: 'Whisk the egg', icon: ['obj', 'whisk'], act: '🌀', done: t => happened('beat', 'egg', t) },
            { text: 'Cook until scrambled', act: '🔥', done: t => happened('scramble', null, t) },
            { text: 'Put it on a plate with a fork', icon: ['obj', 'plate'], act: '🍽️', done: t => happened('serve', 'scrambled', t) }] },
  { id: 'boiledegg', cat: 'meals', name: 'Boiled Egg', icon: '🥚', need: [['sub', 'water'], ['obj', 'egg'], ['obj', 'fork'], ['obj', 'plate']],
    steps: [{ text: 'Pour in water', icon: ['sub', 'water'], act: '💧', done: t => happened('pour', 'water', t) },
            { text: 'Put in a whole egg', icon: ['obj', 'egg'], act: '⬇️', done: t => happened('inpot', 'egg', t) },
            { text: 'Boil until it dings', act: '♨️', done: t => happened('boil', 'egg', t) },
            { text: 'Take it out with a fork', icon: ['obj', 'fork'], act: '🍴', done: t => happened('fork', 'egg', t) },
            { text: 'Put it on a plate', icon: ['obj', 'plate'], act: '🍽️', done: t => happened('serve', 'boiledegg', t) }] },
  { id: 'cocoa', cat: 'drinks', name: 'Hot Cocoa', icon: '☕', need: [['sub', 'milk'], ['obj', 'choc'], ['obj', 'mallow'], ['obj', 'spoon'], ['obj', 'mug']],
    steps: [{ text: 'Pour in milk', icon: ['sub', 'milk'], act: '💧', done: t => happened('pour', 'milk', t) },
            { text: 'Put in chocolate', icon: ['obj', 'choc'], act: '⬇️', done: t => happened('inpot', 'choc', t) },
            { text: 'Heat until it melts', icon: ['obj', 'choc'], act: '🔥', done: t => happened('melt', 'choc', t) },
            { text: 'Stir it with a spoon (it is hot!)', icon: ['obj', 'spoon'], act: '🥄', done: t => happened('stir', null, t) },
            { text: 'Add a marshmallow', icon: ['obj', 'mallow'], act: '⬇️', done: t => happened('inpot', 'mallow', t) },
            { text: 'Scoop it into a mug', icon: ['obj', 'mug'], act: '🥄', done: t => happened('scoop', null, t) }] },
  { id: 'icepop', cat: 'sweets', name: 'Fruit Ice Pop', icon: '🍧', need: [['obj', 'strawberry'], ['obj', 'banana'], ['sub', 'water']],
    steps: [{ text: 'Put in a strawberry', icon: ['obj', 'strawberry'], act: '⬇️', done: t => happened('inpot', 'strawberry', t) },
            { text: 'Put in a banana', icon: ['obj', 'banana'], act: '⬇️', done: t => happened('inpot', 'banana', t) },
            { text: 'Pour in water', icon: ['sub', 'water'], act: '💧', done: t => happened('pour', 'water', t) },
            { text: 'Blend it', act: '🌀', done: t => happened('blend', 'strawberry', t) },
            { text: 'Freeze it solid', act: '❄️', done: t => happened('freeze', null, t) }] },
  { id: 'milkshake', cat: 'drinks', name: 'Banana Milkshake', icon: '🥛', need: [['obj', 'banana'], ['obj', 'icecream'], ['sub', 'milk'], ['obj', 'glass']],
    steps: [{ text: 'Put in a banana', icon: ['obj', 'banana'], act: '⬇️', done: t => happened('inpot', 'banana', t) },
            { text: 'Put in ice cream', icon: ['obj', 'icecream'], act: '⬇️', done: t => happened('inpot', 'icecream', t) },
            { text: 'Pour in milk', icon: ['sub', 'milk'], act: '💧', done: t => happened('pour', 'milk', t) },
            { text: 'Blend it', act: '🌀', done: t => happened('blend', 'banana', t) },
            { text: 'Scoop it into a glass', icon: ['obj', 'glass'], act: '🥄', done: t => happened('scoop', null, t) }] },
  { id: 'foam', cat: 'drinks', name: 'Milk Foam', icon: '☁️', need: [['sub', 'milk'], ['obj', 'whisk'], ['obj', 'mug']],
    steps: [{ text: 'Pour in milk', icon: ['sub', 'milk'], act: '💧', done: t => happened('pour', 'milk', t) },
            { text: 'Whisk it fast until foamy', icon: ['obj', 'whisk'], act: '🌀', done: t => happened('whip', null, t) },
            { text: 'Scoop it into a mug', icon: ['obj', 'mug'], act: '🥄', done: t => happened('scoop', null, t) }] },
  { id: 'slushie', cat: 'drinks', name: 'Cola Slushie', icon: '🧊', need: [['obj', 'ice'], ['sub', 'cola'], ['obj', 'cup']],
    steps: [{ text: 'Put in ice', icon: ['obj', 'ice'], act: '⬇️', done: t => happened('inpot', 'ice', t) },
            { text: 'Pour in cola', icon: ['sub', 'cola'], act: '💧', done: t => happened('pour', 'cola', t) },
            { text: 'Blend the ice', act: '🌀', done: t => happened('blend', 'ice', t) },
            { text: 'Scoop it into a cup', icon: ['obj', 'cup'], act: '🥄', done: t => happened('scoop', null, t) }] },
  { id: 'cheesetoast', cat: 'meals', name: 'Cheese Toast', icon: '🧀', need: [['obj', 'bread'], ['obj', 'cheese'], ['obj', 'fork'], ['obj', 'plate']],
    steps: [{ text: 'Put bread in the pot', icon: ['obj', 'bread'], act: '⬇️', done: t => happened('inpot', 'bread', t) },
            { text: 'Put cheese in the pot', icon: ['obj', 'cheese'], act: '⬇️', done: t => happened('inpot', 'cheese', t) },
            { text: 'Bake it in the oven', act: '🔥', done: t => happened('toast', 'bread', t, 'oven') && happened('melt', 'cheese', t) },
            { text: 'Put it on a plate with a fork', icon: ['obj', 'plate'], act: '🍽️', done: t => happened('serve', 'toast', t) }] }
];
const RECIPE_CATS = [['meals', 'Meals'], ['snacks', 'Snacks'], ['drinks', 'Drinks'], ['sweets', 'Sweets'], ['science', 'Science fun']];

// ---------------------------------------------------------------------------
// Chemistry Lab: its own shelves and experiments (the same engine underneath)
// ---------------------------------------------------------------------------
if (LAB === 'chem') {
  NAMES.obj.coin = 'Penny'; NAMES.obj.candy = 'Mint candy'; NAMES.sub.lemon = 'Lemon juice';
  // Lab equipment (handled like the kitchen things it replaces)
  Object.assign(NAMES.obj, { cup: 'Test tube', glass: 'Flask', mug: 'Measuring cylinder', bowl: 'Beaker', plate: 'Petri dish', fork: 'Tongs', spoon: 'Stirring rod', teaspoon: 'Spatula' });
  // No toaster or cutting board in a lab: move their surfaces out of the way.
  TOASTER.x0 = TOASTER.x1 = TOASTER.slot = -9999; BOARD.x0 = BOARD.x1 = -9999;
  STORAGE.fridge = { subs: ['milk', 'lemon', 'cabbagejuice', 'cola', 'fizzwater'], objs: ['egg', 'lemon', 'cabbage'], freezer: ['ice'] };
  STORAGE.pantry = { subs: ['soda', 'vinegar', 'salt', 'sugar', 'starch', 'yeast', 'oil', 'honey'], objs: ['raisin', 'candy', 'tablet'] };
  STORAGE.cabinets = { subs: ['water', 'soap', 'peroxide', 'glue', 'activator', 'red', 'yellow', 'blue'],
    objs: ['cup', 'glass', 'bowl', 'mug', 'plate', 'fork', 'teaspoon', 'spoon', 'coin', 'paper', 'stick'] };
  INV.subs = ['water']; INV.objs = [];
  const H = happened, pour = (sub, text) => ({ text: text || 'Pour in ' + nameOf('sub', sub).toLowerCase(), icon: ['sub', sub], act: '💧', done: t => H('pour', sub, t) });
  const anyColor = { text: 'Add a color', icon: ['sub', 'red'], act: '💧', done: t => ['red', 'yellow', 'blue'].some(c => H('pour', c, t)) };
  const put = (obj, text) => ({ text: text || 'Put in ' + nameOf('obj', obj).toLowerCase(), icon: ['obj', obj], act: '⬇️', done: t => H('inpot', obj, t) });
  RECIPES.length = 0;
  RECIPES.push(
    { id: 'toothpaste', cat: 'foam', name: 'Elephant Toothpaste', icon: '🐘', need: [['sub', 'peroxide'], ['sub', 'soap'], ['sub', 'red'], ['sub', 'yeast']],
      steps: [pour('peroxide'), anyColor, pour('soap', 'Add a squirt of dish soap'), pour('yeast', 'Add yeast and stand back!'),
              { text: 'Watch the foam erupt', act: '🫧', done: t => H('toothpaste', null, t) }] },
    { id: 'volcano', cat: 'foam', name: 'Volcano', icon: '🌋', need: [['sub', 'soda'], ['sub', 'red'], ['sub', 'vinegar']],
      steps: [pour('soda'), pour('red', 'Add red color'), pour('vinegar'), { text: 'Watch it fizz!', act: '🌋', done: t => H('fizz', null, t) }] },
    { id: 'geyser', cat: 'foam', name: 'Cola Geyser', icon: '⛲', need: [['sub', 'cola'], ['obj', 'candy']],
      steps: [pour('cola'), put('candy', 'Drop in a mint candy'), { text: 'Whoosh!', act: '⛲', done: t => H('geyser', null, t) }] },
    { id: 'lava', cat: 'colors', name: 'Lava Lamp', icon: '🫧', need: [['sub', 'water'], ['sub', 'blue'], ['sub', 'oil'], ['obj', 'tablet']],
      steps: [pour('water'), anyColor, pour('oil', 'Pour oil on top'), put('tablet', 'Drop in a fizzy tablet'),
              { text: 'Watch the blobs go up and down', act: '🫧', done: t => H('lava', null, t) }] },
    { id: 'cabbage', cat: 'colors', name: 'Rainbow Cabbage', icon: '🌈', need: [['sub', 'cabbagejuice'], ['sub', 'vinegar'], ['sub', 'soda']],
      steps: [pour('cabbagejuice'), pour('vinegar', 'Add vinegar: it turns pink!'), { text: 'Pink means acid', act: '🩷', done: t => H('ph-acid', null, t) },
              pour('soda', 'Add lots of baking soda'), { text: 'Green means base', act: '💚', done: t => H('ph-base', null, t) }] },
    { id: 'magic', cat: 'colors', name: 'Magic Milk', icon: '🎨', need: [['sub', 'milk'], ['sub', 'red'], ['sub', 'yellow'], ['sub', 'blue'], ['sub', 'soap']],
      steps: [pour('milk'), { text: 'Drop in colors', icon: ['sub', 'blue'], act: '💧', done: t => ['red', 'yellow', 'blue'].filter(c => H('pour', c, t)).length >= 2 },
              { text: 'Add a drop of soap', icon: ['sub', 'soap'], act: '💧', done: t => H('magic', null, t) }] },
    { id: 'slime', cat: 'goo', name: 'Slime', icon: '🟢', need: [['sub', 'glue'], ['sub', 'blue'], ['sub', 'activator']],
      steps: [pour('glue'), anyColor, pour('activator', 'Add contact solution'), { text: 'It turns into slime', act: '🟢', done: t => H('slime', null, t) },
              { text: 'Pick it up and stretch it', act: '🤏', done: t => H('stretch', null, t) }] },
    { id: 'oobleck', cat: 'goo', name: 'Oobleck', icon: '⚪', need: [['sub', 'starch'], ['sub', 'water']],
      steps: [pour('starch'), pour('water', 'Add a little water'), { text: 'Mix until it is goopy', act: '🥄', done: t => H('oobleck', null, t) },
              { text: 'Poke it fast: it goes hard!', act: '👊', done: t => H('oobleck-solid', null, t) }] },
    { id: 'plastic', cat: 'goo', name: 'Milk Plastic', icon: '🥛', need: [['sub', 'milk'], ['sub', 'vinegar']],
      steps: [pour('milk'), { text: 'Warm it up', act: '🔥', done: t => H('warm', null, t) }, pour('vinegar'),
              { text: 'Lumps of plastic appear', act: '⚪', done: t => H('curds', null, t) }] },
    { id: 'tower', cat: 'float', name: 'Density Tower', icon: '🍯', need: [['sub', 'honey'], ['sub', 'water'], ['sub', 'red'], ['sub', 'oil']],
      steps: [pour('honey'), pour('water'), anyColor, pour('oil'), { text: 'See the layers stack up', act: '🌈', done: t => H('tower', null, t) }] },
    { id: 'floategg', cat: 'float', name: 'Floating Egg', icon: '🥚', need: [['sub', 'water'], ['obj', 'egg'], ['sub', 'salt']],
      steps: [pour('water'), put('egg', 'Put in an egg: it sinks'), pour('salt', 'Add lots of salt'), { text: 'Now the egg floats!', act: '⬆️', done: t => H('floategg', null, t) }] },
    { id: 'raisins', cat: 'float', name: 'Dancing Raisins', icon: '🍇', need: [['sub', 'fizzwater'], ['obj', 'raisin']],
      steps: [pour('fizzwater'), put('raisin', 'Drop in some raisins'), { text: 'Watch them dance up and down', act: '💃', done: t => H('dance', null, t) }] },
    { id: 'nakedegg', cat: 'more', name: 'Naked Egg', icon: '🫧', need: [['obj', 'egg'], ['sub', 'vinegar']],
      steps: [pour('vinegar'), put('egg', 'Gently put in an egg'), { text: 'Wait while the shell melts away', act: '⏳', done: t => H('nakedegg', null, t) },
              { text: 'Take it out and bounce it', act: '🏀', done: t => H('bounce', null, t) }] },
    { id: 'pennies', cat: 'more', name: 'Shiny Pennies', icon: '🪙', need: [['sub', 'vinegar'], ['sub', 'salt'], ['obj', 'coin']],
      steps: [pour('vinegar'), pour('salt'), put('coin', 'Drop in a dull penny'), { text: 'Wait for it to shine', act: '✨', done: t => H('shiny', null, t) }] },
    { id: 'rockcandy', cat: 'more', name: 'Rock Candy', icon: '💎', need: [['sub', 'water'], ['sub', 'sugar'], ['obj', 'stick']],
      steps: [pour('water'), { text: 'Heat it up (not to boiling)', act: '🔥', done: t => H('hot', null, t) }, pour('sugar', 'Pour in lots of sugar'),
              put('stick', 'Put in a stick'), { text: 'Turn off the heat: crystals grow as it cools', act: '💎', done: t => H('crystals', null, t) }] },
    { id: 'secret', cat: 'more', name: 'Secret Message', icon: '🕵️', need: [['sub', 'lemon'], ['obj', 'paper']],
      steps: [pour('lemon'), { text: 'Dip the paper in it', icon: ['obj', 'paper'], act: '📄', done: t => H('ink', null, t) },
              { text: 'Warm the paper in the oven', act: '🔥', done: t => H('secret', null, t) }] }
  );
  RECIPE_CATS.length = 0;
  RECIPE_CATS.push(['foam', 'Fizz and foam'], ['colors', 'Colors'], ['goo', 'Goo and slime'], ['float', 'Float and sink'], ['more', 'More experiments']);
}

const recipe = { active: null, since: 0, done: [], complete: false };
function startRecipe(id) {
  const r = RECIPES.find(x => x.id === id) || null;
  recipe.active = r; recipe.since = time; recipe.done = r ? r.steps.map(() => false) : []; recipe.complete = false;
}
function updateRecipe() {
  const r = recipe.active;
  if (!r || recipe.complete) return false;
  r.steps.forEach((st, i) => { if (!recipe.done[i] && st.done(recipe.since)) { recipe.done[i] = true; sfx('click'); } });
  if (recipe.done.every(Boolean)) { recipe.complete = true; return true; }
  return false;
}

function setSection(name) {
  if (!SECTIONS.includes(name) || name === section) return false;
  section = name;
  // Ovens only heat: the cold side of the dial does nothing in the oven.
  if (section === 'oven' && heat < HEAT_OFF) setHeat(HEAT_OFF);
  return true;
}


// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const pot = {};
const BASE_WATER = [91, 184, 245];
function resetPot(keepTemp) {
  const T = keepTemp ? pot.T : 20;
  Object.assign(pot, {
    water: 0, vinegar: 0, soap: 0, milk: 0, lemon: 0, cola: 0,
    oil: 0, honey: 0, sand: 0, flour: 0, flourDry: 0, cake: 0,
    saltD: 0, saltS: 0, sugarD: 0, sugarS: 0, sodaD: 0, sodaS: 0,
    pepper: 0, ind: 0, dr: 0, dy: 0, db: 0, foam: 0, T,
    bakeT: 0, caramel: false, fizz: 0, carb: 0, stir: 0, turb: 0, emul: 0,
    pulp: 0, jr: 0, jg: 0, jb: 0, jw: 0, perox: 0, glue: 0, act: 0, starch: 0, yeast: 0, oobleck: false, curdAcc: 0, whiskLast: -9, egg: 0, eggCook: 0,
    disp: BASE_WATER.slice(), spots: [], specks: [], pepperFlee: 0, soapSeen: false
  });
}
resetPot(false);

// One heat setting, from freezing cold to high heat; 20 is off (room temperature).
const HEAT_MIN = -25, HEAT_MAX = 130, HEAT_OFF = 20;
let heat = HEAT_OFF;
let stove = 0, freezer = false;   // derived from heat, for visuals
function setHeat(v) {
  heat = clamp(v, section === 'oven' ? HEAT_OFF : HEAT_MIN, HEAT_MAX);
  stove = heat >= 100 ? 2 : heat > HEAT_OFF + 4 ? 1 : 0;
  freezer = heat < 5;
}

// Blender blades in the pot floor: they rise, spin, and chop what reaches them.
let blender = false;
const blade = { h: 0, spin: 0, jam: 0, angle: 0, chopping: 0 };
const BLADE = { x: 800, y: POT.bottom - 34, reach: 70 };
// What each thing turns into: juice color, juice and pulp amounts, extras.
const BLEND = {
  apple: { col: [242, 224, 150], juice: 14, pulp: 10 }, banana: { col: [250, 236, 175], juice: 8, pulp: 16 },
  orange: { col: [255, 150, 30], juice: 16, pulp: 8 }, lemon: { col: [255, 240, 120], juice: 2, pulp: 4 },
  tomato: { col: [215, 45, 35], juice: 14, pulp: 10 }, grapes: { col: [120, 40, 120], juice: 14, pulp: 6 },
  carrot: { col: [255, 128, 30], juice: 8, pulp: 14 }, mushroom: { col: [150, 120, 95], juice: 4, pulp: 10 },
  cabbage: { col: [150, 60, 170], juice: 10, pulp: 10 }, egg: { col: [255, 214, 90], juice: 10, pulp: 4 },
  rawegg: { col: [255, 214, 90], juice: 10, pulp: 4 }, friedegg: { col: [255, 240, 200], juice: 4, pulp: 8 },
  cheese: { col: [255, 220, 110], juice: 4, pulp: 12 }, cookie: { col: [150, 95, 50], juice: 0, pulp: 12 },
  choc: { col: [110, 65, 35], juice: 6, pulp: 6 }, icecream: { col: [150, 95, 60], juice: 0, pulp: 4, milk: 20 },
  mint: { col: [150, 225, 190], juice: 0, pulp: 4, milk: 20 }, candy: { col: [230, 80, 120], juice: 4, pulp: 2 },
  butter: { col: [255, 229, 138], juice: 0, pulp: 2, oil: 16 }, mallow: { col: [255, 250, 250], juice: 2, pulp: 2 },
  kernel: { col: [240, 200, 120], juice: 0, pulp: 6 }, popcorn: { col: [250, 240, 210], juice: 0, pulp: 8 },
  sponge: { col: [255, 214, 80], juice: 0, pulp: 8 }, shell: { col: [255, 250, 240], juice: 0, pulp: 3 }, ice: { col: [220, 240, 255], juice: 0, pulp: 0 },
  bread: { col: [235, 210, 160], juice: 0, pulp: 14 }, croissant: { col: [240, 200, 130], juice: 0, pulp: 12 },
  donut: { col: [230, 180, 120], juice: 0, pulp: 12 }, cupcake: { col: [255, 170, 200], juice: 0, pulp: 12 },
  strawberry: { col: [220, 40, 60], juice: 10, pulp: 6 }, broccoli: { col: [80, 150, 60], juice: 6, pulp: 12 },
  corn: { col: [240, 210, 80], juice: 4, pulp: 14 }, pear: { col: [230, 225, 170], juice: 12, pulp: 8 },
  pineapple: { col: [250, 210, 90], juice: 14, pulp: 8 }, avocado: { col: [170, 200, 90], juice: 4, pulp: 16 },
  cherries: { col: [130, 20, 40], juice: 10, pulp: 4 },
  mash: { col: [200, 200, 150], juice: 4, pulp: 12 }
};
// Too hard to blend: clunk, stall the blades, and get thrown back up.
const HARD = { rock: 0.8, coin: 0.3, magnet: 0.6, whisk: 0.6, spoon: 0.4, duck: 0 };

let motor = null;
function updateMotorSound() {
  const a = actx;
  if (!a) return;
  if (blade.spin > 0.05 && !muted) {
    if (!motor) {
      const osc = a.createOscillator(), lp = a.createBiquadFilter(), g = a.createGain();
      osc.type = 'sawtooth'; lp.type = 'lowpass'; lp.frequency.value = 900; g.gain.value = 0;
      osc.connect(lp).connect(g).connect(a.destination); osc.start();
      motor = { osc, g };
    }
    motor.osc.frequency.value = 60 + blade.spin * 90 - (blade.chopping > 0 ? 25 : 0);
    motor.g.gain.value = 0.04 * blade.spin;
  } else if (motor) { try { motor.osc.stop(); } catch (e) {} motor = null; }
}

function updateBlender(dt) {
  blade.h = clamp(blade.h + (blender ? dt * 2 : -dt * 1.5), 0, 1);
  const frozen = pot.T < 0;
  blade.jam = Math.max(0, blade.jam - dt);
  blade.chopping = Math.max(0, blade.chopping - dt);
  const want = blender && blade.h > 0.85 && !frozen && blade.jam <= 0 ? 1 : 0;
  if (blender && frozen && blade.h > 0.85) sfx('knock');
  blade.spin = lerp(blade.spin, want, Math.min(1, dt * (want ? 3 : 2.5)));
  blade.angle += blade.spin * dt * 70;
  updateMotorSound();
  if (blade.spin < 0.2) return;
  // Very strong mixing.
  agit += blade.spin * dt * 40;
  if (pot.cake > 0) { const m = Math.min(pot.cake, blade.spin * 8 * dt); pot.cake -= m; pot.sand += m * 0.3; pot.pulp += m * 0.5; }
  const lay = potLayers(), aqL = lay.L.find(l => l.kind === 'aq');
  if (aqL && Math.random() < blade.spin * 0.8) {
    particles.push({ k: 'vortex', a: rand(0, Math.PI * 2), r: rand(0.15, 0.9), y: rand(aqL.top + 6, aqL.bottom - 6), va: rand(5, 9) * blade.spin, vy: rand(-40, 40),
                     life: 1.2, max: 1.2, s: 3, col: '#FFFFFF', top: aqL.top, bottom: aqL.bottom });
  }
}

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function scoopInto(c, dt) {
  const lay = potLayers(), aqL = lay.L.find(l => l.kind === 'aq');
  const cap = OBJ[c.type].cup;
  if (!aqL || pot.T < 0 || (c.fill || 0) >= cap || c.y + c.r * 0.9 < aqL.top) return;
  const taken = takeAq(Math.min(cap - (c.fill || 0), 90 * dt), true);
  if (taken <= 0) return;
  c.fill = (c.fill || 0) + taken;
  c.col = pot.disp.slice();
  c.drink = drinkName();
  if (taken > 0.05) sfx('bubble');
  logEvent('scoop', c.type);
}
// A rough name for what's in the pot, for a cup's label.
function drinkName() {
  const aq = aqueous() || 1;
  if (pot.egg > 0) return 'egg';
  if (pot.milk / aq > 0.4) return pot.jw > 5 || pot.dr + pot.dy + pot.db > 3 ? 'shake' : 'milk';
  if (pot.jw > 5) return 'juice';
  if (pot.lemon > 3) return 'lemonade';
  if (pot.cola / aq > 0.3) return 'cola';
  if (pot.T > 60) return 'soup';
  return 'water';
}
function blendBody(b) {
  const r = BLEND[b.type === 'mash' ? b.src : b.type];
  if (!r) return;
  logEvent('blend', b.type);
  const k = b.r / OBJ[b.type].r;
  if (b.type === 'ice') { pot.water += b.mass0; pot.T = Math.max(pot.T - b.mass0 * 0.25, 0.5); }
  else {
    pot.water += r.juice * k; pot.pulp += r.pulp * k;
    const w = (r.juice + r.pulp) * k;
    pot.jr += r.col[0] * w; pot.jg += r.col[1] * w; pot.jb += r.col[2] * w; pot.jw += w;
  }
  if (r.milk) pot.milk += r.milk * b.melt;
  if (r.oil) pot.oil += r.oil * b.melt;
  if (b.type === 'lemon') pot.lemon += b.juice + 4;
  if (b.type === 'pineapple') pot.lemon += 8;                        // pineapple is acidic too
  if (b.type === 'cupcake' || b.type === 'donut') pot.sugarS += 4;
  if (b.type === 'cabbage') pot.ind += b.dye;
  if (b.type === 'candy' || b.type === 'mallow') pot.sugarS += 6;
  if (b.type === 'sponge') pot.water += b.water;
  if (b.type === 'kernel') pot.flourDry += 4;
  const lay = potLayers(), aqL = lay.L.find(l => l.kind === 'aq');
  const css = `rgb(${r.col.join(',')})`;
  for (let i = 0; i < 18; i++) {
    if (aqL) particles.push({ k: 'vortex', a: rand(0, Math.PI * 2), r: rand(0.1, 0.8), y: rand(aqL.top + 6, aqL.bottom - 6), va: rand(4, 8), vy: rand(-60, 60), life: rand(1.2, 2.4), max: 2.4, s: rand(5, 9), col: css, top: aqL.top, bottom: aqL.bottom });
    else spark(BLADE.x + rand(-40, 40), BLADE.y, css);
  }
}
let bodies = [], particles = [], pourers = [];
const holds = new Map();   // pointerId -> { body } | { pourer } | { stir }
let nextId = 1, agit = 0, time = 0;

function makeBody(type, x, y) {
  const o = OBJ[type];
  const b = { id: nextId++, type, x, y, vx: 0, vy: 0, r: o.r, d: o.d, held: false, squash: 0, rot: rand(-0.2, 0.2), vr: 0,
              mass0: 30, water: 0, puff: 1, toast: 0, cook: 0, popAt: 0, melt: 1, soak: 0, juice: o.juice || 0, dye: o.dye || 0, impact: 0,
              place: section === 'oven' ? 'oven' : 'counter' };
  if (LAB === 'chem' && type === 'coin') b.tarnish = 1;
  if (bodies.length >= 45) { const old = bodies.findIndex(x => !x.held); if (old >= 0) bodies.splice(old, 1); }
  bodies.push(b);
  return b;
}

// ---------------------------------------------------------------------------
// Pot contents
// ---------------------------------------------------------------------------
const AQ_KEYS = ['water', 'vinegar', 'soap', 'milk', 'lemon', 'cola'];
function aqueous() { return pot.water + pot.vinegar + pot.soap + pot.milk + pot.lemon + pot.cola; }

// Remove liquid evenly from everything watery. Spills also carry dissolved stuff
// away; boiling leaves it behind.
function takeAq(amount, spill) {
  const aq = aqueous();
  if (aq <= 0 || amount <= 0) return 0;
  const t = Math.min(aq, amount), f = (aq - t) / aq;
  for (const k of AQ_KEYS) pot[k] *= f;
  if (spill) for (const k of ['saltD', 'sugarD', 'sodaD', 'ind', 'dr', 'dy', 'db', 'turb', 'emul', 'carb', 'pulp', 'jr', 'jg', 'jb', 'jw', 'egg', 'perox', 'glue', 'act', 'starch', 'yeast']) pot[k] *= f;
  return t;
}

// Enough sand in water makes mud: one thick, opaque layer instead of water over sand.
function isMud() { const aq = aqueous(); return aq > 5 && pot.sand > aq * 0.35; }

function potLayers() {
  const aq = aqueous();
  const batterWater = pot.flour > 0 ? Math.min(aq, pot.flour * 1.2) : 0;
  const free = Math.max(0, aq - batterWater) + pot.emul;
  const mud = isMud();
  const L = [];
  let y = POT.bottom;
  const add = (kind, h) => { if (h > 0.01) { L.push({ kind, bottom: y, top: y - h }); y -= h; } };
  add('crys', pot.saltS + pot.sugarS + pot.sodaS);
  if (!mud) add('sand', pot.sand);
  add('cake', pot.cake);
  add('honey', pot.honey);
  add('batter', pot.flour + batterWater);
  if (mud) add('mud', pot.sand + free); else add('aq', free);
  add('oil', pot.oil);
  add('flourTop', pot.flourDry);
  const solidTop = L.filter(l => l.kind === 'crys' || l.kind === 'sand' || l.kind === 'cake')
                    .reduce((m, l) => Math.min(m, l.top), POT.bottom);
  const surface = y;
  add('foam', pot.foam);
  const aqL = L.find(l => l.kind === 'aq');
  return { L, solidTop, surface, free, batterWater, aqTop: aqL ? aqL.top : surface, total: POT.bottom - surface };
}

function waterDensity() {
  const aq = aqueous();
  if (aq < 0.01) return 1;
  return 1 + 0.25 * Math.min(1, pot.saltD / (aq * 0.36)) + 0.12 * Math.min(1, pot.sugarD / aq) + 0.03 * pot.milk / aq;
}

function dyeColor() {
  const tot = pot.dr + pot.dy + pot.db;
  if (tot < 0.01) return null;
  const m = Math.max(pot.dr, pot.dy, pot.db), r = pot.dr / m, y = pot.dy / m, b = pot.db / m;
  // Red/yellow/blue mix the way paint does: blend over the corners of an RYB cube.
  const C = { w: [255,255,255], r: [230,40,50], y: [255,215,0], o: [255,135,20], b: [30,110,240], p: [130,50,160], g: [40,170,70], k: [90,55,25] };
  const wgt = (a, on) => (on ? a : 1 - a);
  const out = [0, 0, 0];
  for (const [cr, cy, cb, key] of [[0,0,0,'w'],[1,0,0,'r'],[0,1,0,'y'],[1,1,0,'o'],[0,0,1,'b'],[1,0,1,'p'],[0,1,1,'g'],[1,1,1,'k']]) {
    const w = wgt(r, cr) * wgt(y, cy) * wgt(b, cb);
    for (let i = 0; i < 3; i++) out[i] += C[key][i] * w;
  }
  return { rgb: out, strength: Math.min(1, tot / (aqueous() * 0.12 + 4)) };
}

// Red cabbage juice: pink in acid, purple when neutral, blue to green in base.
function indicatorColor() {
  const aq = aqueous();
  const acid = pot.vinegar + pot.lemon * 1.5 + pot.cola * 0.5;
  const base = (pot.sodaD + pot.sodaS) * 2;
  const r = (acid - base) / (acid + base + aq * 0.03 + 1);
  const stops = [[-1, [40, 170, 110]], [-0.4, [60, 110, 225]], [0, [120, 60, 170]], [0.35, [200, 60, 160]], [1, [235, 60, 120]]];
  for (let i = 1; i < stops.length; i++) {
    if (r <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; return lerp3(ca, cb, (r - a) / (b - a)); }
  }
  return stops[stops.length - 1][1];
}

function targetWaterRGB() {
  const aq = aqueous();
  if (aq < 0.5) return BASE_WATER;
  let c = BASE_WATER;
  c = lerp3(c, [228, 236, 240], Math.min(1, (pot.vinegar + pot.lemon) / aq) * 0.6);
  c = lerp3(c, [90, 46, 26], Math.min(1, pot.cola / aq * 1.6));
  c = lerp3(c, [250, 250, 245], Math.min(1, pot.milk / aq * 1.4));
  if (pot.jw > 0) c = lerp3(c, [pot.jr / pot.jw, pot.jg / pot.jw, pot.jb / pot.jw], Math.min(0.92, pot.jw / (aq * 0.2 + 5)));
  if (pot.egg > 0) c = lerp3(c, [255, 205, 70], Math.min(0.85, pot.egg * 12 / (aq + 10)));
  if (pot.starch > 0) c = lerp3(c, [246, 244, 236], Math.min(0.95, pot.starch * 1.4 / (aq + 1)));
  if (pot.glue > 0) c = lerp3(c, [244, 244, 236], Math.min(0.8, pot.glue * 1.2 / (aq + 1)));
  const d = dyeColor();
  if (d && !pot.spots.length) c = lerp3(c, d.rgb, d.strength);
  if (pot.ind > 0) c = lerp3(c, indicatorColor(), Math.min(0.9, pot.ind / (aq * 0.1 + 3)));
  if (pot.sugarD > aq * 0.5) c = lerp3(c, [235, 200, 120], 0.25);
  c = lerp3(c, [130, 90, 55], Math.min(0.85, pot.turb / (aq * 0.15 + 5)));
  c = lerp3(c, [250, 236, 170], Math.min(0.6, pot.emul / (aq * 0.25 + 5)));
  return c;
}
function waterColor(alpha) {
  const c = pot.disp;
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
}

function surfaceAt() { return potLayers().surface; }

function deposit(sub, vol, x) {
  logEvent('pour', sub);
  const aq = aqueous();
  switch (sub) {
    case 'water': case 'vinegar': case 'milk': case 'lemon': case 'oil': case 'honey':
      pot[sub] += vol; break;
    case 'peroxide': pot.water += vol; pot.perox += vol; break;
    case 'glue': pot.water += vol * 0.6; pot.glue += vol; break;
    case 'activator': pot.water += vol; pot.act += vol; break;
    case 'starch': pot.starch += vol; break;
    case 'yeast': pot.yeast += vol; break;
    case 'cabbagejuice': pot.water += vol; pot.ind += vol * 0.6; break;
    case 'fizzwater': pot.water += vol; pot.carb += vol * 0.8; break;
    case 'ojuice': pot.water += vol; pot.jr += 255 * vol * 3; pot.jg += 150 * vol * 3; pot.jb += 30 * vol * 3; pot.jw += vol * 3; break;
    case 'cola': pot.cola += vol; pot.carb += vol * 0.8; break;
    case 'soap':
      pot.soap += vol;
      // Soap breaks the water's surface tension: floating pepper rushes to the edge,
      // and food coloring sitting on milk bursts into swirls.
      if (pot.specks.length && pot.pepperFlee <= 0) { pot.pepperFlee = 1.4; sfx('swish'); }
      pot.soapSeen = true;
      if (pot.spots.length) burstSpots();
      break;
    case 'salt': pot.saltS += vol; break;
    case 'sugar': pot.sugarS += vol; break;
    case 'soda': pot.sodaS += vol; break;
    case 'sand': pot.sand += vol; if (aq > 5) pot.turb += vol * 0.8; break;
    case 'pepper':
      if (aq > 5 && !pot.soapSeen) {
        pot.pepper += vol;
        for (let i = 0; i < 3 && pot.specks.length < 160; i++) pot.specks.push({ a: rand(0, Math.PI * 2), r: Math.sqrt(Math.random()) * 0.92, f: 0 });
      } else pot.sand += vol * 0.3;
      break;
    case 'flour':
      if (potLayers().free > 5) pot.flourDry += vol; else pot.flour += vol;   // flour floats in clumps until stirred
      break;
    case 'red': case 'yellow': case 'blue': {
      const key = { red: 'dr', yellow: 'dy', blue: 'db' }[sub];
      pot[key] += vol; pot.water += vol * 0.3;
      if (aq > 5) {
        if (pot.milk / aq > 0.5 && pot.stir < 0.25 && !pot.soapSeen) {
          pot.spots.push({ a: rand(0, Math.PI * 2), r: Math.sqrt(Math.random()) * 0.75, s: rand(0.12, 0.2), col: SUB[sub].col });
        } else {
          particles.push({ k: 'cloud', x: x || 800, y: surfaceAt() + 20, vx: rand(-15, 15), vy: rand(15, 35), life: 6, max: 6, s: 14, col: SUB[sub].col });
        }
      }
      break;
    }
  }
  agit += 0.12;
}

function burstSpots() {
  logEvent('magic');
  const cx = (POT.x0 + POT.x1) / 2, R = (POT.x1 - POT.x0) / 2;
  for (const s of pot.spots) {
    for (let i = 0; i < 14; i++) {
      particles.push({ k: 'swirl', a: s.a + rand(-0.3, 0.3), r: s.r, va: rand(1.5, 3) * (Math.random() < 0.5 ? -1 : 1), vr: rand(0.15, 0.35),
                       life: rand(2.5, 4.5), max: 4.5, col: s.col, cx, R, s: rand(6, 10) });
    }
  }
  pot.spots = [];
  sfx('swish');
}

function spill(col) {
  const left = Math.random() < 0.5;
  particles.push({ k: 'drip', x: left ? POT.x0 - POT.wall - 4 : POT.x1 + POT.wall + 4, y: POT.rim + 4,
                   vx: (left ? -1 : 1) * rand(10, 60), vy: rand(0, 60), life: 3, col, s: rand(5, 9) });
}
function spark(x, y, col) {
  particles.push({ k: 'spark', x, y, vx: rand(-120, 120), vy: rand(-260, -80), life: 0.8, max: 0.8, col, s: rand(4, 8) });
}

function chemStep(dt) {
  const aq = aqueous(), frozen = pot.T < 0;
  // Elephant toothpaste: yeast breaks peroxide into water and oxygen. Soap traps the
  // oxygen into a mountain of foam. It gets warm, too.
  if (pot.perox > 0.3 && pot.yeast > 0.2 && !frozen) {
    const r = Math.min(pot.perox, dt * (3 + pot.yeast * 0.6));
    pot.perox -= r; pot.foam += r * (pot.soap > 0.5 ? 7 : 0.7); pot.T = Math.min(60, pot.T + r * 1.5);   // it gives off heat
    if (Math.random() < 0.5) particles.push({ k: 'bubble', x: rand(POT.x0 + 20, POT.x1 - 20), y: POT.bottom - 6, vy: -rand(90, 160), top: POT.rim, life: 3, s: 4 });
    if (pot.soap > 0.5 && pot.foam > 40) logEvent('toothpaste');
  }
  // Slime: glue plus contact-lens solution links up into one stretchy blob.
  if (pot.glue > 6 && pot.act > 1.5 && !frozen) {
    const sl = makeBody('slime', 800, POT.bottom - 60);
    sl.r = Math.max(24, Math.min(60, 16 + pot.glue * 0.55));
    const dc = pot.dr + pot.dy + pot.db > 0.5 ? dyeColor() : [150, 220, 255];
    sl.col = dc; sl.place = section === 'oven' ? 'oven' : 'counter';
    pot.water = Math.max(0, pot.water - pot.glue * 0.6 - pot.act * 0.8); pot.glue = 0; pot.act = 0;
    sfx('plop'); logEvent('slime');
  }
  // Oobleck: about one and a half parts cornstarch to one part water.
  const ratio = aq > 1 ? pot.starch / aq : 0;
  const was = pot.oobleck;
  pot.oobleck = aq > 8 && ratio > 0.8 && ratio < 3.5 && !frozen;
  if (pot.oobleck && !was) logEvent('oobleck');
  // Milk plastic: warm milk plus vinegar separates into curds and whey.
  if (pot.milk > 5 && pot.T > 45) logEvent('warm');
  if (aq > 10 && pot.T > 60) logEvent('hot');
  if (pot.milk > 5 && pot.vinegar + pot.lemon > 3 && pot.T > 45) {
    const c = Math.min(pot.milk, dt * 25);
    pot.milk -= c; pot.water += c * 0.85; pot.curdAcc += c;
    while (pot.curdAcc > 10) { pot.curdAcc -= 10; const cd = makeBody('curd', rand(680, 920), POT.bottom - 50); cd.vy = -60; logEvent('curds'); }
  }
  // Cabbage juice shows acid (pink) and base (green).
  if (pot.ind > 2) {
    const acid = pot.vinegar + pot.lemon * 1.5 + pot.cola * 0.5, base = (pot.sodaD + pot.sodaS) * 2;
    const r = (acid - base) / (acid + base + aq * 0.03 + 1);
    if (r > 0.35) logEvent('ph-acid');
    if (r < -0.4) logEvent('ph-base');
  }
  // Density tower: honey, water and oil in layers.
  if (pot.honey > 5 && aq > 15 && pot.oil > 5 && pot.stir < 0.3) logEvent('tower');
}

function updatePot(dt) {
  chemStep(dt);
  const aqNow = aqueous();
  // Whisking: milk froths up; a raw egg in the pot beats into a smooth yellow mix.
  if (time - (pot.whiskLast ?? -9) < 0.25) {
    // (fast enough to build past the foam's "basically gone" floor every frame)
    if (aqNow > 5 && pot.milk / aqNow > 0.4 && pot.T < 70) { pot.foam += dt * 30; if (pot.foam > 24) logEvent('whip'); }
    for (const b of bodies) if (b.type === 'rawegg' && inPotX(b.x) && b.y > POT.rim) { pot.egg += 1; bodies.splice(bodies.indexOf(b), 1); logEvent('beat', 'egg'); sfx('plop'); break; }
  }
  // Beaten egg cooks into soft scrambled pieces.
  if (pot.egg > 0 && pot.T > 70) {
    pot.eggCook += dt * (1 + pot.stir);
    if (pot.eggCook > 2.5) {
      for (let i = 0; i < 3; i++) { const p = makeBody('friedegg', rand(680, 920), POT.bottom - 40); p.r = 15; p.scrambled = true; p.vy = -200; }
      pot.egg = Math.max(0, pot.egg - 1); pot.eggCook = 0; sfx('sizzle'); logEvent('scramble');
    }
  }
  if (pot.T < 0 && aqNow > 15) logEvent('freeze');
  if (pot.flour > 8 && pot.stir > 0.15) logEvent('batter');
  if (pot.T >= 99.5 && aqueous() > 5) logEvent('boil');
  if (pot.stir > 0.45) logEvent('stir');
  const aq = aqueous();
  const frozen = pot.T < 0;

  // How hard the pot is being stirred right now (hands, tools, things moving, pouring).
  pot.stir = lerp(pot.stir, Math.min(3, agit / Math.max(dt, 1e-3) * 0.08), Math.min(1, dt * 4));
  const foamFromAgit = agit;
  agit = 0;
  const heatK = 1 + Math.max(0, pot.T - 20) / 40;   // warm liquid dissolves faster
  const k = (0.35 + pot.stir * 2.5) * heatK;

  if (!frozen) {
    // Dissolving takes time; stirring and heat speed it up. Extra stays on the bottom.
    const settle = (dKey, sKey, cap) => {
      const tot = pot[dKey] + pot[sKey];
      const target = Math.min(tot, cap);
      pot[dKey] = target < pot[dKey] ? target : pot[dKey] + (target - pot[dKey]) * Math.min(1, k * dt);
      pot[sKey] = tot - pot[dKey];
    };
    settle('saltD', 'saltS', aq * 0.36);
    settle('sugarD', 'sugarS', aq * 2.0);
    settle('sodaD', 'sodaS', aq * 0.15);

    // Honey sits on the bottom until stirred in.
    if (pot.honey > 0 && aq > 2) {
      const m = pot.honey * Math.min(1, (0.006 + pot.stir * 0.5) * heatK * dt);
      pot.honey -= m; pot.sugarD += m * 0.8; pot.water += m * 0.2;
    }
    // Flour clumps on the surface until stirred into batter.
    if (pot.flourDry > 0) {
      const lay = potLayers();
      const c = lay.free > 2 ? pot.flourDry * Math.min(1, (0.02 + pot.stir * 2.2) * dt) : pot.flourDry;
      pot.flourDry -= c; pot.flour += c;
    }
    // Stirred sand clouds the water, then settles.
    if (pot.sand > 1 && aq > 5) pot.turb += pot.stir * Math.min(pot.sand, 60) * 0.6 * dt;
    pot.turb -= pot.turb * 0.4 * dt;
    // Stirred oil breaks into droplets; it separates again, slowly if there's soap.
    if (pot.oil > 0 && aq > 5) { const e = pot.oil * Math.min(1, pot.stir * 0.9 * dt); pot.oil -= e; pot.emul += e; }
    const back = pot.emul * Math.min(1, (pot.soap > 2 ? 0.04 : 0.3) * dt);
    pot.emul -= back; pot.oil += back;
  }

  // Acid + baking soda: fizz and foam.
  const soda = pot.sodaD + pot.sodaS, acid = pot.vinegar + pot.lemon;
  if (!frozen && acid > 0.05 && soda > 0.05) {
    const r = Math.min(acid, soda, (0.6 + (acid + soda) * 0.9) * (1 + pot.stir) * dt);
    const fromV = Math.min(pot.vinegar, r); pot.vinegar -= fromV; pot.lemon -= (r - fromV);
    const fromD = Math.min(pot.sodaD, r); pot.sodaD -= fromD; pot.sodaS -= (r - fromD);
    pot.water += r * 0.7;
    pot.foam += r * 11 * (1 + Math.min(pot.soap, 10) * 0.08);
    pot.fizz = 1.2; logEvent('fizz');
    sfx('fizz');
    if (Math.random() < 0.6) spark(rand(POT.x0 + 30, POT.x1 - 30), surfaceAt(), '#FFFFFF');
  }
  pot.fizz = Math.max(0, pot.fizz - dt);

  // Cola stays fizzy for a while; stirring or heat lets the bubbles out faster.
  if (pot.carb > 0.1 && !frozen) {
    const rel = pot.carb * Math.min(1, (0.012 + pot.stir * 0.3 + Math.max(0, pot.T - 30) * 0.004) * dt);
    pot.carb -= rel; pot.foam += rel * 1.5;
    const lay = potLayers(), aqL = lay.L.find(l => l.kind === 'aq');
    if (aqL && Math.random() < Math.min(0.9, pot.carb * 0.02)) particles.push({ k: 'bubble', x: rand(POT.x0 + 14, POT.x1 - 14), y: aqL.bottom - 4, vy: -rand(70, 140), top: aqL.top, life: 3, s: 3 });
  }

  // Soap + stirring: foam.
  if (!frozen && pot.soap > 0.05 && aq > 1) pot.foam += foamFromAgit * Math.min(pot.soap, 12) * 0.5;
  pot.foam = Math.min(pot.foam, 260);
  pot.foam -= pot.foam * (pot.fizz > 0 ? 0.03 : (pot.soap > 0 ? 0.05 : 0.18)) * dt;
  if (pot.foam < 0.2) pot.foam = 0;

  // Pepper rushing away from soap, then sinking.
  if (pot.pepperFlee > 0) {
    pot.pepperFlee -= dt;
    for (const s of pot.specks) s.f = Math.min(1, s.f + dt * 1.6);
    if (pot.pepperFlee <= 0) { pot.sand += pot.pepper * 0.3; pot.pepper = 0; pot.specks = []; }
  }
  // Coloring sitting on milk mixes in once it's stirred.
  if (pot.spots.length && pot.stir > 0.3) pot.spots = [];

  // Temperature.
  const target = heat;
  const lay = potLayers();
  const mass = 30 + lay.total * 0.4;
  pot.T += (target - pot.T) * Math.min(1, dt * 40 / mass);
  const wet = aqueous();
  if (wet > 0.3 && pot.T > 100) pot.T = 100;
  if (heat > 100 && wet > 0.3 && pot.T >= 99.5) {
    takeAq((1 + 6 * (heat - 100) / 30) * dt, false);   // hotter setting, faster boil
    if (Math.random() < 0.7) particles.push({ k: 'steam', x: rand(POT.x0 + 20, POT.x1 - 20), y: lay.surface, vx: rand(-20, 20), vy: rand(-90, -60), life: 2.2, max: 2.2, s: rand(16, 28) });
    if (Math.random() < 0.5) sfx('bubble');
  }
  if (pot.T > 90 && lay.free > 2 && !frozen && Math.random() < (pot.T - 90) / 15) {
    const aqL = lay.L.find(l => l.kind === 'aq');
    if (aqL) particles.push({ k: 'bubble', x: rand(POT.x0 + 14, POT.x1 - 14), y: aqL.bottom - 4, vy: -rand(90, 160), top: aqL.top, life: 3, s: 5 });
  }
  if (pot.oil > 2 && pot.T > 90 && Math.random() < 0.3) sfx('sizzle');

  // Batter bakes into cake.
  if (pot.flour > 0.5 && lay.batterWater > 0.5 && pot.T > 85) {
    pot.bakeT += dt;
    if (pot.bakeT > 3) {
      const used = takeAq(pot.flour * 1.2, false);
      pot.cake += (pot.flour + used) * 1.4; logEvent('bake', 'cake');
      pot.flour = 0; pot.bakeT = 0;
      sfx('boing'); for (let i = 0; i < 12; i++) spark(rand(POT.x0, POT.x1), lay.surface, '#FFD27A');
    }
  }
  if (pot.sugarS > 0.5 && wet < 0.3 && pot.T > 110 && !pot.caramel) { pot.caramel = true; sfx('sizzle'); }

  // Too full: spill over the rim.
  const L2 = potLayers();
  let excess = L2.total - CAP;
  if (excess > 0) {
    const takeOil = Math.min(pot.oil, excess); pot.oil -= takeOil; excess -= takeOil;
    for (let i = 0; i < takeOil; i += 1.5) spill('#F5C542');
    if (excess > 0) {
      const mud = isMud();
      if (mud) { const ts = Math.min(pot.sand, excess * pot.sand / (pot.sand + aqueous())); pot.sand -= ts; excess -= ts; }
      const t = takeAq(excess, true); excess -= t;
      for (let i = 0; i < t; i += 1.5) spill(mud ? '#6E482A' : waterColor(0.85));
    }
    for (const key of ['flourDry', 'sand', 'flour', 'honey']) if (excess > 0) { const t = Math.min(pot[key], excess); pot[key] -= t; excess -= t; }
  }
  const foamTop = L2.surface - pot.foam;
  if (foamTop < POT.rim - 10) {
    const t = Math.min(pot.foam, ((POT.rim - 10) - foamTop) * 0.5 + 0.5);
    pot.foam -= t;
    const col = pot.dr + pot.dy + pot.db + pot.cola > 0 ? waterColor(1) : '#FFFFFF';
    for (let i = 0; i < t; i += 1.2) {
      const left = Math.random() < 0.5;
      particles.push({ k: 'foam', x: left ? POT.x0 - 6 : POT.x1 + 6, y: POT.rim - 10, vx: (left ? -1 : 1) * rand(30, 120), vy: rand(-80, 20), life: 4, s: rand(10, 20), col });
    }
  }

  // The water's color drifts toward what's in it; stirring mixes it quickly.
  pot.disp = lerp3(pot.disp, targetWaterRGB(), Math.min(1, (0.25 + pot.stir * 3) * dt));
}

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------
const CAPSULES = [
  { ax: POT.x0 - POT.wall / 2, ay: POT.rim, bx: POT.x0 - POT.wall / 2, by: POT.bottom + POT.wall / 2, r: POT.wall / 2 },
  { ax: POT.x1 + POT.wall / 2, ay: POT.rim, bx: POT.x1 + POT.wall / 2, by: POT.bottom + POT.wall / 2, r: POT.wall / 2 },
  { ax: POT.x0 - POT.wall / 2, ay: POT.bottom + POT.wall / 2, bx: POT.x1 + POT.wall / 2, by: POT.bottom + POT.wall / 2, r: POT.wall / 2 }
];
const MAX_SPEED = 1800, MAX_SPEED_WET = 650;

function noteImpact(b, speed) {
  if (speed > b.impact) b.impact = speed;
  if (speed > 250) { b.squash = Math.min(0.3, speed / 2500); sfx(speed > 600 ? 'clink' : 'plop'); }
}

function collideCapsule(b, c) {
  const dx = c.bx - c.ax, dy = c.by - c.ay;
  const t = clamp(((b.x - c.ax) * dx + (b.y - c.ay) * dy) / (dx * dx + dy * dy), 0, 1);
  const px = c.ax + dx * t, py = c.ay + dy * t;
  let nx = b.x - px, ny = b.y - py;
  const dist = Math.hypot(nx, ny), min = b.r + c.r;
  if (dist >= min || dist === 0) return;
  nx /= dist; ny /= dist;
  b.x = px + nx * min; b.y = py + ny * min;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= 1.25 * vn * nx; b.vy -= 1.25 * vn * ny; noteImpact(b, -vn); }
}

function inPotX(x) { return x > POT.x0 && x < POT.x1; }

function fluidLayers(lay, frozen) {
  const rhoW = waterDensity();
  return lay.L.filter(l => ['aq', 'oil', 'foam', 'batter', 'honey', 'flourTop', 'mud'].includes(l.kind))
    .map(l => ({ l, rho: l.kind === 'aq' ? (frozen ? 0 : rhoW) : { oil: 0.92, foam: 0.2, batter: 1.5, honey: 1.42, flourTop: 0.6, mud: frozen ? 0 : 1.65 }[l.kind] }));
}

// Hands that are stirring push things gently, like a real hand in water.
function handColliders() {
  const out = [];
  for (const h of holds.values()) if (h.stir) out.push(h.stir);
  return out;
}

function stepBodies(dt) {
  chopCheck(dt);
  const lay = potLayers();
  const frozen = pot.T < 0;
  const fluids = fluidLayers(lay, frozen);
  const magnets = bodies.filter(b => b.type === 'magnet');
  const hands = handColliders();

  for (const b of bodies) {
    const inside = inPotX(b.x) && b.y + b.r > POT.rim;
    let wet = false;
    // Food on a fork rides on its tines.
    if (b.stuck != null) {
      const f = bodies.find(x => x.id === b.stuck);
      if (f && f.held) { b.x = f.x; b.y = f.y + f.r * 0.9 + b.r * 0.5; b.vx = f.vx; b.vy = f.vy; b.place = f.place; continue; }
      b.stuck = null;
    }
    // Dragging a plate carries whatever is sitting on it.
    if (b.type === 'plate') {
      const dx = b.x - (b.lx ?? b.x), dy = b.y - (b.ly ?? b.y);
      if (dx || dy) for (const r of bodies) if (r.onPlate === b.id && !r.held && r.stuck == null) { r.x += dx; r.y += dy; r.vx = 0; r.vy = Math.min(r.vy, 0); }
      b.lx = b.x; b.ly = b.y;
    }
    // A cup dipped into the pot scoops up the liquid.
    if (b.held && CUPS.has(b.type) && inside) scoopInto(b, dt);
    if (b.held) {
      if (b.type === 'slime' && Math.hypot(b.vx, b.vy) > 600) logEvent('stretch');
      // A whisk moving fast inside the pot is whisking, liquid or not (a cracked egg alone counts).
      if (b.type === 'whisk' && inside && Math.hypot(b.vx, b.vy) > 400) pot.whiskLast = time;
      // Held tools and objects stir whatever liquid they're moving through.
      if (inside && fluids.some(f => b.y + b.r > f.l.top && b.y - b.r < f.l.bottom && f.l.kind !== 'foam')) {
        const tool = OBJ[b.type].tool || 0.5;
        agit += Math.min(1500, Math.hypot(b.vx, b.vy)) * dt * 0.004 * tool;
      }
      continue;
    }
    let ay = G, damp = 0;
    if (inside) {
      for (const f of fluids) {
        const overlap = Math.max(0, Math.min(b.y + b.r, f.l.bottom) - Math.max(b.y - b.r, f.l.top));
        const frac = overlap / (2 * b.r);
        if (frac <= 0) continue;
        if ((f.l.kind === 'aq' || f.l.kind === 'mud') && frozen) { b.vx = 0; b.vy = 0; b.locked = true; continue; }
        wet = true;
        if (f.l.kind === 'batter' || f.l.kind === 'honey' || f.l.kind === 'mud') { damp += frac * (f.l.kind === 'mud' ? 9 : 12); ay -= G * frac * (f.rho / b.d); continue; }
        if (f.l.kind === 'aq' && pot.oobleck) {
          damp += frac * 10;
          if (b.vy > 350 && b.y - b.r < f.l.top + 4 && !b.held) { b.vy = -b.vy * 0.35; b.y = f.l.top - b.r * 0.6; sfx('thud'); logEvent('oobleck-solid'); }
        }
        ay -= G * frac * (f.rho / b.d);
        damp += frac * (f.l.kind === 'foam' ? 1 : 3);
      }
    }
    if (b.locked && !(inside && frozen)) b.locked = false;
    if (b.locked) continue;

    if (OBJ[b.type].metal) {
      for (const m of magnets) {
        const dx = m.x - b.x, dy = m.y - b.y, d = Math.hypot(dx, dy);
        if (d < 260 && d > 1) {
          const touch = m.r + b.r + 1;
          if (d <= touch + 2) { b.x = m.x - dx / d * touch; b.y = m.y - dy / d * touch; b.vx = m.vx; b.vy = m.vy; ay = 0; damp = 0; break; }
          const a = Math.min(4200, 9e6 / (d * d));
          b.vx += dx / d * a * dt; b.vy += dy / d * a * dt;
        }
      }
    }

    // Spinning blades: liquid pulls things down the middle and throws them up the sides;
    // anything that reaches the blades gets chopped, or clunks if it's too hard.
    if (blade.spin > 0.2 && inside) {
      const dx = b.x - BLADE.x;
      if (wet) { b.vx += -dx * 2.2 * blade.spin * dt * 3; ay += (Math.abs(dx) < 110 ? 2600 : -700) * blade.spin; }
      const d = Math.hypot(dx, b.y - BLADE.y);
      if (d < BLADE.reach + b.r) {
        if (b.type in HARD) {
          b.vy = -rand(700, 1000); b.vx = rand(-300, 300); b.vr = rand(-10, 10);
          if (HARD[b.type] > 0 && blade.jam <= 0) { blade.jam = HARD[b.type]; blade.spin *= 0.3; sfx('clunk'); } else sfx('boing');
        } else if (BLEND[b.type]) {
          b.blend = (b.blend || 0) + dt * 1.4 * blade.spin / Math.max(0.6, b.r / 30);
          b.vy -= rand(200, 600) * dt * 10; b.vx += rand(-300, 300) * dt * 10; b.squash = 0.25 * Math.sin(time * 60);
          blade.chopping = 0.15; sfx('chop');
        }
      }
    }
    b.vy += ay * dt;
    const kd = Math.exp(-damp * dt);
    b.vx *= kd; b.vy *= kd;
    const sp = Math.hypot(b.vx, b.vy), cap = wet ? MAX_SPEED_WET : MAX_SPEED;
    if (sp > cap) { b.vx *= cap / sp; b.vy *= cap / sp; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.rot += b.vr * dt; b.vr *= Math.exp(-2 * dt);
    if (!['coin', 'popcorn', 'kernel', 'apple', 'orange', 'tomato', 'grapes'].includes(b.type)) b.rot = lerp(b.rot, 0, Math.min(1, dt * 2.5));

    for (const c of CAPSULES) collideCapsule(b, c);
    if (inPotX(b.x) && b.y + b.r > lay.solidTop && b.y > POT.rim) {
      b.y = lay.solidTop - b.r;
      if (b.vy > 0) noteImpact(b, b.vy);
      b.vy = -b.vy * 0.2; b.vx *= 0.85;
    }
    const floor = floorAt(b), rr = OBJ[b.type].flat || b.r;      // a plate sits flat on its underside
    if (b.y + rr > floor) {
      if (b.vy > 0) noteImpact(b, b.vy);
      b.y = floor - rr; b.vy = -b.vy * (b.naked ? 0.6 : 0.25); b.vx *= OBJ[b.type].flat ? 0.5 : 0.82; b.vr = OBJ[b.type].flat ? 0 : b.vx / b.r * 0.6;
      const p = plateUnder(b);
      if (p && b.onPlate !== p.id) { b.onPlate = p.id; logEvent('serve', serveKey(b)); sfx('click'); }
    } else if (b.onPlate != null && b.y + rr < floor - 30) b.onPlate = null;
    // Into the pot: worth noting for recipes. Things in the pot go wherever the pot goes.
    if (inPotX(b.x) && b.y > POT.rim + b.r * 0.5) { if (!b.inPot) { b.inPot = true; logEvent('inpot', b.type === 'mash' ? 'mash-' + b.src : b.type); } }
    else if (b.y < POT.rim - b.r * 2 || !inPotX(b.x)) b.inPot = false;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.4; }
    if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.4; }
    if (b.y < -300) b.y = -300;
    b.squash *= Math.exp(-10 * dt);
    if (wet) agit += Math.hypot(b.vx, b.vy) * dt * 0.002;

    // Gentle push from stirring hands.
    for (const hnd of hands) {
      const dx = b.x - hnd.x, dy = b.y - hnd.y, d = Math.hypot(dx, dy), min = b.r + hnd.r;
      if (d >= min || d === 0) continue;
      const push = Math.min(min - d, 5);
      b.x += dx / d * push; b.y += dy / d * push;
      b.vx += (hnd.vx * 0.15 + dx / d * 60) * Math.min(1, dt * 30);
      b.vy += (hnd.vy * 0.15 + dy / d * 60) * Math.min(1, dt * 30);
    }
  }

  // Bodies ease apart. A dragged object pushes others firmly but never flings them.
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], c = bodies[j];
      if (a.place !== c.place && !(a.inPot && c.inPot)) continue;   // the counter and the oven are different places
      if (a.type === 'plate' || c.type === 'plate') continue;          // plates are flat: things sit on them (see floorAt)
      if ((a.held && BLADES.has(a.type)) || (c.held && BLADES.has(c.type))) continue;   // a blade goes into food, not shoves it
      if (a.stuck != null || c.stuck != null) continue;
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy), min = a.r + c.r;
      if (d >= min || d === 0) continue;
      const nx = dx / d, ny = dy / d, over = Math.min(min - d, 6);
      const pinA = a.held || a.locked, pinC = c.held || c.locked;
      if (pinA && pinC) continue;
      const ma = pinA ? 1e9 : a.d * a.r * a.r, mc = pinC ? 1e9 : c.d * c.r * c.r;
      const wa = mc / (ma + mc), wc = ma / (ma + mc);
      a.x -= nx * over * wa; a.y -= ny * over * wa;
      c.x += nx * over * wc; c.y += ny * over * wc;
      const rv = Math.max(-500, (c.vx - a.vx) * nx + (c.vy - a.vy) * ny);
      if (rv < 0) {
        const imp = -1.2 * rv;
        if (!pinA) { a.vx -= imp * nx * wa; a.vy -= imp * ny * wa; }
        if (!pinC) { c.vx += imp * nx * wc; c.vy += imp * ny * wc; }
      }
    }
  }

  // Stirring hands mix the pot.
  for (const hnd of hands) if (hnd.inFluid) agit += Math.min(1500, Math.hypot(hnd.vx, hnd.vy)) * dt * 0.006;
}

// Heat, cold, water, and bumps change things.
// Spreading: butter touching toast melts onto it.
function spreadCheck() {
  for (const bu of bodies) {
    if (bu.type !== 'butter' || bu.held) continue;
    const toast = bodies.find(t => t.type === 'bread' && t.toast > 0.5 && !t.buttered && t.place === bu.place && Math.hypot(t.x - bu.x, t.y - bu.y) < t.r + bu.r + 4);
    if (toast) { toast.buttered = true; bodies.splice(bodies.indexOf(bu), 1); sfx('sizzle'); logEvent('spread', 'butter'); return; }
  }
}
// Food settled on a plate, or on top of other food on it, is on the plate (and served).
function plateCheck() {
  for (const p of bodies) {
    if (p.type !== 'plate') continue;
    for (const b of bodies) {
      if (b === p || b.held || b.stuck != null || b.type === 'plate' || b.place !== p.place) continue;
      const over = Math.abs(b.x - p.x) < p.r * 1.3 && b.y < p.y && b.y > p.y - 160 && Math.abs(b.vy) < 80;
      if (over && b.onPlate !== p.id) { b.onPlate = p.id; logEvent('serve', serveKey(b)); }
      else if (!over && b.onPlate === p.id && (Math.abs(b.x - p.x) > p.r * 1.6 || b.y < p.y - 220)) b.onPlate = null;
    }
  }
}
function updateObjects(dt) {
  spreadCheck();
  plateCheck();
  for (const b of bodies) if (b.toast > 0.5 && !b.toastLogged) { b.toastLogged = true; logEvent('toast', b.type); }
  const lay = potLayers();
  const frozen = pot.T < 0;
  const aqL = lay.L.find(l => l.kind === 'aq');
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];
    const inside = inPotX(b.x) && b.y > POT.rim - b.r * 0.5 && !b.held;
    const T = inside ? pot.T : 20;
    const inWater = inside && aqL && !frozen && b.y + b.r > aqL.top && b.y - b.r < aqL.bottom;
    const remove = () => { bodies.splice(i, 1); };

    // A hard landing cracks an egg. Water cushions the fall.
    if (b.blend >= 1) { blendBody(b); remove(); continue; }

    if (b.type === 'egg' && b.naked && b.impact > 300) { logEvent('bounce'); }
    if (b.type === 'egg' && b.impact > 950 && !b.naked) {
      remove(); sfx('crack'); logEvent('crack', 'egg');
      [-1, 1].forEach(s => { const sh = makeBody('shell', b.x + s * 14, b.y - 6); sh.vx = s * rand(120, 260); sh.vy = -rand(200, 380); sh.vr = s * rand(3, 6); });
      const raw = makeBody('rawegg', b.x, b.y);
      raw.vy = 40;
      if (!inside) { splat(b.x, '#FFD24A', true); splat(b.x + 10, '#FFF8EC', true); }
      continue;
    }
    b.impact = 0;

    switch (b.type) {
      case 'ice':
        if (!(inside && frozen)) {
          const rate = inside ? Math.max(0.3, (T + 5) * 0.12) * (1 + pot.stir) : 0.5;
          const m = Math.min(b.mass0, rate * dt);
          b.mass0 -= m;
          if (inside) pot.water += m;
          else if (Math.random() < 0.05) particles.push({ k: 'drip', x: b.x, y: b.y + b.r, vx: 0, vy: 20, life: 2, col: '#BFE6FF', s: 4 });
          b.r = 12 + b.mass0 * 0.6;
          if (b.mass0 <= 0.2) { remove(); continue; }
        }
        break;
      case 'sponge':
        if (inWater && b.water < 70) { const t = takeAq(Math.min(28 * dt, 70 - b.water), false); b.water += t; }
        if (b.held && b.water > 0 && Math.random() < 0.5) {
          const t = Math.min(b.water, 0.9); b.water -= t;
          particles.push({ k: 'pour', sub: 'water', vol: t, x: b.x + rand(-b.r * 0.6, b.r * 0.6), y: b.y + b.r, vx: rand(-10, 10), vy: 40, life: 4, s: 5 });
        }
        b.r = 30 + b.water * 0.22; b.d = 0.18 + b.water * 0.012;
        break;
      case 'lemon': case 'orange':
        // Squeeze: hold a cut half over the pot and wiggle it, and juice drips in.
        if (b.held && (b.cut || 0) >= 1 && b.juice > 0 && inPotX(b.x) && b.y < POT.rim && Math.hypot(b.vx, b.vy) > 150 && Math.random() < 0.6) {
          const t = Math.min(b.juice, 0.6); b.juice -= t;
          particles.push({ k: 'pour', sub: b.type === 'lemon' ? 'lemon' : 'ojuice', vol: t, x: b.x + rand(-8, 8), y: b.y + b.r * 0.8, vx: 0, vy: 30, life: 4, s: 4 });
          logEvent('squeeze', b.type);
        }
        break;
      case 'butter': case 'cheese':
        if (inside && T > (b.type === 'butter' ? 35 : 65)) {
          const m = Math.min(b.melt, dt * (T - 30) * (b.type === 'butter' ? 0.01 : 0.005));
          b.melt -= m; pot.oil += m * 18; if (b.type === 'cheese') pot.dy += m * 1.5;
          if (b.melt < 0.6) logEvent('melt', b.type);
          b.r = 10 + (OBJ[b.type].r - 10) * b.melt;
          if (b.melt <= 0.02) { remove(); sfx('sizzle'); continue; }
        }
        break;
      case 'choc':
        if (inside && T > 35) {
          const m = Math.min(b.melt, dt * (T - 30) * 0.01);
          b.melt -= m; pot.dr += m * 3; pot.dy += m * 3; pot.db += m * 3; pot.water += m * 4; b.r = 10 + 18 * b.melt;
          if (b.melt < 0.6) logEvent('melt', 'choc');
          if (b.melt <= 0.02) { remove(); continue; }
        }
        break;
      case 'icecream': case 'mint': {
        // Melts a little on the counter, quickly in warm water.
        const rate = (inside ? Math.max(0, T - 5) * 0.006 + (inWater ? 0.04 : 0) : 0.012) * (1 + pot.stir * (inside ? 1 : 0));
        const m = Math.min(b.melt, rate * dt);
        b.melt -= m; b.r = 10 + 18 * b.melt;
        if (inside) {
          pot.milk += m * 22;
          if (b.type === 'icecream') { pot.dr += m * 2; pot.dy += m * 2; pot.db += m * 2; } else { pot.dy += m * 1.5; pot.db += m * 1.2; }
        } else if (Math.random() < m * 40) splat(b.x + rand(-10, 10), b.type === 'icecream' ? '#7A4A2A' : '#9BE3C4', true);
        if (b.melt <= 0.02) { remove(); continue; }
        break;
      }
      case 'cookie':
        if (inWater) { b.soak += dt * (1 + pot.stir); if (b.soak > 5) { remove(); pot.sand += 8; pot.turb += 25; sfx('plop'); continue; } }
        break;
      case 'cabbage':
        // Red cabbage colors the water; hot water pulls the color out much faster.
        if (inWater && b.dye > 0) { const m = Math.min(b.dye, (T > 60 ? 4 : 0.4) * (1 + pot.stir) * dt); b.dye -= m; pot.ind += m; }
        break;
      case 'candy':
        // Candy in fizzy cola: a geyser.
        if (inWater && pot.carb > 5) {
          const burst = pot.carb;
          pot.carb = 0; pot.foam += burst * 4;
          const top = lay.surface;
          for (let n = 0; n < Math.min(220, burst * 4); n++) {
            particles.push({ k: 'drip', x: b.x + rand(-30, 30), y: top, vx: rand(-260, 260), vy: -rand(1500, 2600), life: 3, col: Math.random() < 0.5 ? '#FFFFFF' : waterColor(1), s: rand(6, 11) });
          }
          sfx('geyser'); logEvent('geyser'); remove(); continue;
        }
        break;
      case 'mallow':
        if (inside) {
          if (T > 60 && b.puff < 1.9) { b.puff = Math.min(1.9, b.puff + dt * 0.35); b.r = 24 * b.puff; }
          if (T > 100) b.toast = Math.min(1, b.toast + dt * 0.25);
        }
        break;
      case 'banana':
        if (inside && T > 80) b.toast = Math.min(1, b.toast + dt * 0.08);
        break;
      case 'bread': case 'croissant': case 'donut': case 'cupcake':
        // Soaks up water, swells, gets soggy and sinks, then falls apart into mush.
        if (inWater) {
          const t = takeAq(Math.min(18 * dt, 40 - b.water), false);
          b.water += t; b.soak += dt * (1 + pot.stir);
          b.d = OBJ[b.type].d + (1.05 - OBJ[b.type].d) * Math.min(1, b.water / 30);
          b.r = OBJ[b.type].r * (1 + 0.25 * Math.min(1, b.water / 40));
          if (b.soak > 8) {
            const r = BLEND[b.type];
            pot.water += b.water * 0.5; pot.pulp += 10; pot.turb += 15;
            pot.jr += r.col[0] * 10; pot.jg += r.col[1] * 10; pot.jb += r.col[2] * 10; pot.jw += 10;
            sfx('plop'); remove(); continue;
          }
        } else if (inside && T > 105) b.toast = Math.min(1, b.toast + dt * 0.12);   // toasts in a hot, dry pot
        break;
      case 'strawberry': case 'cherries':
        // Cooks down into jam.
        if (inside && T > 85) {
          const m = Math.min(b.melt, dt * 0.06);
          const r = BLEND[b.type];
          b.melt -= m; b.r = OBJ[b.type].r * (0.4 + 0.6 * b.melt);
          pot.sugarD += m * 6; pot.water += m * 4; pot.jr += r.col[0] * m * 14; pot.jg += r.col[1] * m * 14; pot.jb += r.col[2] * m * 14; pot.jw += m * 14;
          if (b.melt <= 0.02) { remove(); continue; }
        }
        break;
      case 'broccoli':
        if (inWater && T > 95) b.toast = Math.min(1, b.toast + dt * 0.15);   // turns bright green
        break;
      case 'kernel':
        if (inside && T > 90) {
          if (!b.popAt) b.popAt = time + rand(0.5, 2.5);
          if (time > b.popAt) {
            remove();
            const p = makeBody('popcorn', b.x, b.y - 10); logEvent('pop', 'kernel');
            p.vx = rand(-500, 500); p.vy = rand(-1500, -1000); p.vr = rand(-8, 8); p.squash = 0.3;
            sfx('pop'); for (let s = 0; s < 8; s++) spark(b.x, b.y, '#FFE680');
            continue;
          }
        }
        break;
      case 'raisin':
        // Bubbles cling to a raisin and lift it; at the top they pop and it sinks again.
        if (inWater && pot.carb > 0.3) {
          const aqL = potLayers().L.find(l => l.kind === 'aq');
          b.bub = Math.min(1, (b.bub || 0) + dt * rand(0.2, 0.6) * Math.min(1, pot.carb / 8));
          const floating = b.y + b.r < aqL.bottom - 3;
          if (aqL && floating && b.y - b.r < aqL.top + 6) { if (b.bub > 0.3) logEvent('dance'); b.bub = 0; }
        } else b.bub = 0;
        b.d = OBJ.raisin.d - (b.bub || 0) * 0.5;
        break;
      case 'tablet':
        // A fizzy tablet in water: bubbles, and colored water blobs that rise through oil.
        if (inWater) {
          b.fizzLeft = (b.fizzLeft ?? 1) - dt * 0.04;
          b.r = Math.max(4, OBJ.tablet.r * Math.max(0.3, b.fizzLeft));
          const lay = potLayers(), aqL = lay.L.find(l => l.kind === 'aq'), oilL = lay.L.find(l => l.kind === 'oil');
          if (Math.random() < 0.5) particles.push({ k: 'bubble', x: b.x + rand(-8, 8), y: b.y, vy: -rand(90, 150), top: (oilL || aqL || { top: POT.rim }).top, life: 3, s: 3 });
          if (oilL && aqL && Math.random() < 0.08) {
            particles.push({ k: 'blob', x: rand(POT.x0 + 40, POT.x1 - 40), y: aqL.top, vy: -rand(30, 55), top: oilL.top + 8, floor: aqL.top, phase: 'up', life: 14, s: rand(9, 15), col: waterColor(1) });
            logEvent('lava');
          }
          if (b.fizzLeft <= 0) { remove(); continue; }
        }
        break;
      case 'stick':
        // Rock candy: a stick in very sugary water grows crystals as the water cools.
        if (inWater && T < 35 && pot.sugarD > aqueous() * 0.35) {
          b.crystal = Math.min(1, (b.crystal || 0) + dt * 0.07);
          pot.sugarD -= dt * 0.6;
          if (b.crystal > 0.6) logEvent('crystals');
        }
        break;
      case 'paper':
        // Secret message: lemon juice soaks in invisibly; warming the dry paper turns it brown.
        if (inWater && pot.lemon > 2) { if (!b.ink) logEvent('ink'); b.ink = 1; }
        if (b.ink && !inWater && b.place === 'oven' && section === 'oven' && heat >= 100) {
          b.reveal = Math.min(1, (b.reveal || 0) + dt * 0.25);
          if (b.reveal > 0.8) logEvent('secret');
        }
        break;
      case 'coin':
        // A dull penny in vinegar (or lemon) with salt comes out shiny.
        if (b.tarnish > 0 && inWater && pot.vinegar + pot.lemon > 2 && pot.saltD > 1) {
          b.tarnish = Math.max(0, b.tarnish - dt * 0.15);
          if (Math.random() < 0.1) particles.push({ k: 'bubble', x: b.x, y: b.y, vy: -rand(40, 80), top: POT.rim, life: 2, s: 2 });
          if (b.tarnish < 0.05) logEvent('shiny');
        }
        break;
      case 'egg':
        // Naked egg: vinegar slowly dissolves the shell (sped up), leaving a rubbery egg.
        if (inWater && !b.boiled && !b.naked && pot.vinegar + pot.lemon > 3) {
          b.shell = (b.shell ?? 1) - dt * 0.06;
          if (Math.random() < 0.2) particles.push({ k: 'bubble', x: b.x + rand(-b.r, b.r), y: b.y, vy: -rand(40, 90), top: POT.rim, life: 2, s: 2 });
          if (b.shell <= 0) { b.naked = true; sfx('ding'); logEvent('nakedegg'); }
        }
        // Floating egg: salty water is denser than an egg.
        if (inWater && waterDensity() > OBJ.egg.d + 0.02) {
          const aqL = potLayers().L.find(l => l.kind === 'aq');
          if (aqL && b.y - b.r < aqL.top + 6) logEvent('floategg');
        }
        // A whole egg in boiling water hard-boils in its shell.
        if (inWater && T > 95 && !b.boiled) { b.boil = (b.boil || 0) + dt; if (b.boil > 5) { b.boiled = true; sfx('ding'); logEvent('boil', 'egg'); } }
        break;
      case 'rawegg':
        if (inside && T > 70) { b.cook += dt; if (b.cook > 1.5) { remove(); makeBody('friedegg', b.x, b.y - 6).vy = -150; sfx('sizzle'); continue; } }
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Pouring and particles
// ---------------------------------------------------------------------------
function pourerSpout(p) {
  const a = p.tilt, sx = -22 * 1.25, sy = -46 * 1.25;
  return { x: p.x + sx * Math.cos(a) - sy * Math.sin(a), y: p.y + sx * Math.sin(a) + sy * Math.cos(a) };
}

function updatePourers(dt) {
  for (let i = pourers.length - 1; i >= 0; i--) {
    const p = pourers[i];
    if (p.returning) {
      p.x = lerp(p.x, p.homeX, Math.min(1, dt * 10)); p.y = lerp(p.y, p.homeY, Math.min(1, dt * 10));
      p.tilt = lerp(p.tilt, 0, Math.min(1, dt * 10)); p.alpha -= dt * 3;
      if (p.alpha <= 0) pourers.splice(i, 1);
      continue;
    }
    const pouring = p.y > 340;
    p.tilt = lerp(p.tilt, pouring ? -2.1 : 0, Math.min(1, dt * 8));
    if (!pouring || p.tilt > -1.2) continue;
    const s = SUB[p.type];
    p.acc += s.rate * dt;
    const per = s.drop ? 1 : (s.liquid ? 0.8 : 0.5);
    while (p.acc >= per) {
      p.acc -= per;
      const sp = pourerSpout(p);
      particles.push({ k: 'pour', sub: p.type, vol: per, x: sp.x + rand(-3, 3), y: sp.y, vx: rand(-25, 25) - 40, vy: rand(20, 80),
                       life: 4, s: s.drop ? 8 : s.thick ? rand(8, 11) : s.liquid ? rand(6, 9) : rand(3, 5) });
      if (s.drop) sfx('bubble');
    }
  }
}

function updateParticles(dt) {
  const lay = potLayers();
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    switch (p.k) {
      case 'pour': {
        p.vy += G * dt * (SUB[p.sub].thick ? 0.7 : 1); p.x += p.vx * dt; p.y += p.vy * dt;
        // Poured straight into a cup, glass, mug or bowl standing below.
        const cupHit = bodies.find(c => CUPS.has(c.type) && Math.abs(p.x - c.x) < c.r * 0.75 && p.y >= c.y - c.r * 0.6 && p.y <= c.y + c.r && (c.fill || 0) < OBJ[c.type].cup);
        if (cupHit) {
          const rgb = hexRgb(SUB[p.sub].col), f0 = cupHit.fill || 0;
          cupHit.col = cupHit.col ? cupHit.col.map((v, k) => (v * f0 + rgb[k] * p.vol) / (f0 + p.vol)) : rgb;
          cupHit.fill = f0 + p.vol;
          cupHit.drink = f0 > 2 && cupHit.drink && cupHit.drink !== nameOf('sub', p.sub).toLowerCase() ? 'mix' : nameOf('sub', p.sub).toLowerCase();
          logEvent('fillcup', p.sub);
          particles.splice(i, 1);
          continue;
        }
        if (inPotX(p.x) && p.y > POT.rim) {
          if (p.y >= lay.surface || p.y >= POT.bottom) {
            deposit(p.sub, p.vol, p.x);
            if (SUB[p.sub].liquid) sfx('splash');
            particles.splice(i, 1);
          }
          continue;
        }
        if (p.x > POT.x0 - POT.wall - 2 && p.x < POT.x1 + POT.wall + 2 && p.y > POT.rim) { p.k = 'drip'; p.col = SUB[p.sub].col; break; }
        if (p.y >= COUNTER) { splat(p.x, SUB[p.sub].col, SUB[p.sub].liquid); particles.splice(i, 1); }
        break;
      }
      case 'drip':
        p.vy += G * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (inPotX(p.x) && p.y > lay.surface && p.vy > 0 && p.y < POT.bottom) { pot.water += 0.4; particles.splice(i, 1); break; }  // geyser rain falls back in
        if (p.y >= COUNTER) { splat(p.x, p.col, true); particles.splice(i, 1); }
        break;
      case 'foam':
        p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-1.5 * dt);
        if (p.y > COUNTER - p.s) { p.y = COUNTER - p.s; p.vy = 0; p.vx *= 0.9; }
        break;
      case 'steam': p.x += p.vx * dt; p.y += p.vy * dt; p.s += 14 * dt; break;
      case 'blob':
        p.y += p.vy * dt; p.x += rand(-10, 10) * dt; p.life -= dt;
        if (p.phase === 'up' && p.y <= p.top) { p.phase = 'down'; p.vy = rand(25, 45); }
        if ((p.phase === 'down' && p.y >= p.floor) || p.life <= 0) particles.splice(i, 1);
        break;
      case 'bubble': p.y += p.vy * dt; p.x += rand(-20, 20) * dt; if (p.y < p.top) particles.splice(i, 1); break;
      case 'spark': p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; break;
      case 'snow':
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx += rand(-40, 40) * dt;
        if (inPotX(p.x) && p.y > lay.surface) particles.splice(i, 1);
        break;
      case 'cloud':
        // Food coloring sinking and spreading through still water; stirring breaks it up.
        p.x += p.vx * dt; p.y += p.vy * dt; p.s += 10 * dt; p.vx += rand(-10, 10) * dt;
        p.life -= pot.stir * dt * 2.5;
        if (!lay.L.some(l => l.kind === 'aq') || pot.T < 0) particles.splice(i, 1);
        break;
      case 'swirl': p.a += p.va * dt; p.r = Math.min(0.95, p.r + p.vr * dt); break;
      case 'vortex': p.a += p.va * dt; p.y = clamp(p.y + p.vy * dt, p.top + 4, p.bottom - 4); break;
      case 'puddle': break;
      case 'puff': p.s += 60 * dt; break;
    }
  }
  if (particles.length > 1800) particles.splice(0, particles.length - 1800);
  if (freezer && Math.random() < 0.3 + 0.6 * (5 - heat) / 30) particles.push({ k: 'snow', x: rand(POT.x0 - 20, POT.x1 + 20), y: 395, vx: rand(-20, 20), vy: rand(70, 120), life: 4, s: rand(3, 6) });
}

function splat(x, col, liquid) {
  const near = particles.find(p => p.k === 'puddle' && Math.abs(p.x - x) < 18 && p.col === col);
  if (near) { near.s = Math.min(46, near.s + (liquid ? 1.2 : 0.6)); near.life = Math.max(near.life, 6); return; }
  particles.push({ k: 'puddle', x, y: COUNTER, s: liquid ? 8 : 6, col, life: 8, max: 8, liquid });
}

// ---------------------------------------------------------------------------
// Hands stirring (called by the input layer every frame for each stirring hand)
// ---------------------------------------------------------------------------
// Returns 'ok', 'hot' (pull back), or 'blocked' (frozen).
function updateStir(st, x, y, dt) {
  const lay = potLayers();
  const inPot = inPotX(x) && y > lay.surface - 4;
  // A hot pot is hot all over (walls and steam too): no hands inside it at all.
  if (inPotX(x) && y > POT.rim && pot.T >= HOT_HANDS) return 'hot';
  if (inPotX(x) && y > POT.rim && blade.spin > 0.2) return 'blades';
  // Oobleck: a fast hand bounces off the surface; a slow one sinks in.
  if (pot.oobleck && inPotX(x)) {
    const aqL = potLayers().L.find(l => l.kind === 'aq');
    if (aqL && y > aqL.top - 10 && st.y <= aqL.top + 6 && Math.hypot(x - st.x, y - st.y) / Math.max(dt, 1e-3) > 500) {
      st.x = x; st.y = aqL.top - 12; st.vx = st.vy = 0; sfx('thud'); logEvent('oobleck-solid'); return 'solid';
    }
  }
  // A hot oven is hot everywhere inside; a lit burner is hot around the pot's base.
  if (section === 'oven' && heat >= 60 && y > 120) return 'hot';
  if (section === 'counter' && TOASTER.busy && x > TOASTER.x0 - 10 && x < TOASTER.x1 + 10 && y > TOASTER.top - 30) return 'hot';
  if (section === 'counter' && stove > 0 && !inPotX(x) && Math.abs(x - 800) < 300 && y > POT.bottom - 30) return 'hot';
  const frozenTop = (lay.L.find(l => l.kind === 'aq' || l.kind === 'mud') || { top: lay.aqTop }).top;
  if (inPot && pot.T < 0 && y > frozenTop) { y = Math.min(y, frozenTop); if (Math.random() < 0.1) sfx('knock'); }
  st.vx = (x - st.x) / Math.max(dt, 1e-3); st.vy = (y - st.y) / Math.max(dt, 1e-3);
  st.x = x; st.y = y;
  st.inFluid = inPot && pot.T >= 0;
  if (st.inFluid && Math.hypot(st.vx, st.vy) > 300) sfx('swish');
  // The hand picks up the color of what it's in.
  if (st.inFluid) {
    const l = lay.L.find(q => y >= q.top && y <= q.bottom);
    if (l) st.coat = { aq: pot.disp, batter: [255, 236, 200], honey: [232, 163, 23], oil: [245, 197, 66], foam: [255, 255, 255], sand: [138, 90, 51], mud: [110, 72, 42], flourTop: [255, 246, 232] }[l.kind] || st.coat;
    if (l && l.kind === 'mud' && Math.hypot(st.vx, st.vy) > 200) sfx('plop');
  }
  return 'ok';
}

// ---------------------------------------------------------------------------
// Counter buttons
// ---------------------------------------------------------------------------
function press(id) {
  sfx('click');
  switch (id) {
    // Older presets, kept for scripts: off, low, high; and freezing cold.
    case 'stove': setHeat(stove === 0 ? 78 : stove === 1 ? 130 : HEAT_OFF); break;
    case 'freeze': setHeat(freezer ? HEAT_OFF : HEAT_MIN); break;
    case 'blend': blender = !blender; break;
    case 'sound': muted = !muted; updateMotorSound(); break;
    case 'empty': {
      const lay = potLayers();
      for (const l of lay.L) {
        const col = l.kind === 'aq' ? waterColor(0.9) : { oil: '#F5C542', sand: '#8A5A33', mud: '#6E482A', batter: '#FFECC8', cake: '#E9A84E', foam: '#FFFFFF', honey: '#E8A317', flourTop: '#FFF6E8' }[l.kind] || '#F4F8FF';
        const n = Math.min(80, (l.bottom - l.top) * 0.8);
        for (let i = 0; i < n; i++) particles.push({ k: 'drip', x: POT.x1 + rand(0, 20), y: POT.rim + rand(-10, 20), vx: rand(150, 650), vy: rand(-700, -200), life: 3, col, s: rand(5, 10) });
      }
      for (const b of bodies) if (inPotX(b.x) && b.y > POT.rim - b.r) { b.locked = false; b.vx = rand(250, 650); b.vy = rand(-1100, -800); b.vr = rand(-6, 6); }
      resetPot(true);
      sfx('whoosh');
      break;
    }
    case 'broom':
      bodies = bodies.filter(b => {
        const keep = b.held || (inPotX(b.x) && b.y > POT.rim - b.r) || b.place !== (section === 'oven' ? 'oven' : 'counter');
        if (!keep) for (let i = 0; i < 4; i++) particles.push({ k: 'puff', x: b.x + rand(-10, 10), y: b.y + rand(-10, 10), vx: 0, vy: 0, life: 0.5, max: 0.5, s: rand(10, 20) });
        return keep;
      });
      particles = particles.filter(p => p.k !== 'puddle' && p.k !== 'foam');
      sfx('whoosh');
      break;
  }
}
