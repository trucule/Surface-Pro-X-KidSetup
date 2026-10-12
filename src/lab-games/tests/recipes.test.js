const fs = require('fs');
global.window = global; global.performance = { now: () => Date.now() };
global.setTimeout = (f) => 0;
eval(fs.readFileSync(require('path').join(__dirname, '../src/sim.js'), 'utf8') + `
;global.S = { get pot(){return pot}, get bodies(){return bodies}, get pourers(){return pourers}, get heat(){return heat}, get section(){return section},
  setHeat, press, makeBody, deposit, potLayers, aqueous, resetPot, updateStir, OBJ, INV, STORAGE, toggleBasket, inBasket, whereIs, BOARD, onBoard, floorAt,
  RECIPES, recipe, startRecipe, updateRecipe, events, setSection, NAMES, nameOf, dangers, holds, TOASTER, bodyName, RECIPE_CATS, hints, potLayers, get blender(){return blender}, get time(){return time},
  step(n){ for(let i=0;i<n;i++){ const dt=1/60; time+=dt; updatePourers(dt); updateBlender(dt); for(let s=0;s<2;s++) stepBodies(dt/2); updateObjects(dt); updateParticles(dt); updatePot(dt); updateRecipe(); } } };`);
let pass = 0, fail = 0;
const check = (n, ok, info) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info ? '  [' + info + ']' : '')); };
const fresh = () => { if (S.blender) S.press('blend'); S.step(80); S.bodies.length = 0; S.pourers.length = 0; S.resetPot(false); S.setSection('counter'); S.setHeat(20); S.step(5); };
const pour = (type, frames) => { const q = { type, x: 800, y: 400, tilt: 0, acc: 0, homeX: 800, homeY: 1200, alpha: 1, tx: 800, ty: 400 }; S.pourers.push(q); S.step(frames || 60); q.returning = true; S.step(30); };
const dropIn = (type, y) => { const b = S.makeBody(type, 800 + (Math.random() - 0.5) * 60, y || 380); S.step(60); return b; };
const chopOnBoard = (type, times) => {
  const b = S.makeBody(type, 320, S.BOARD.top - S.OBJ[type].r - 4); S.step(40);
  for (let n = 0; n < (times || 1); n++) {
    const target = S.bodies.filter(x => x.type === type && S.onBoard(x)).sort((a, c) => c.r - a.r)[0];
    const k = S.makeBody('knife', target.x, target.y - target.r - 90); k.held = true;
    for (let i = 0; i < 12; i++) { k.y += 18; k.vy = 1080; S.step(1); }
    S.bodies.splice(S.bodies.indexOf(k), 1); S.step(30);
  }
  return S.bodies.filter(x => x.type === type);
};
const stir = (frames) => { const st = { x: 800, y: 650, vx: 0, vy: 0, r: 42, inFluid: false, coat: null }; for (let i = 0; i < frames; i++) { S.updateStir(st, 800 + Math.sin(i / 3) * 120, 640 + Math.cos(i / 3) * 40, 1 / 60); S.step(1); } };
const moveToPot = (type) => { S.bodies.filter(x => x.type === type).forEach((b, i) => { b.x = 760 + i * 30; b.y = 400; b.vy = 0; }); S.step(80); };
const plateAt = (x) => { const p = S.makeBody('plate', x, 700); S.step(40); return p; };
const scoopWith = (type) => { const c = S.makeBody(type, 800, 300); c.held = true; for (let i = 0; i < 40; i++) { c.y = Math.min(785, c.y + 12); c.vy = 0; S.step(1); } S.step(20); c.y = 300; c.held = false; c.x = 1450; S.step(60); return c; };
const forkUp = (b) => { const f = S.makeBody('fork', b.x, b.y - 140); f.held = true; for (let i = 0; i < 30 && f.carry == null; i++) { f.y += 6; f.vy = 360; S.step(1); } return f; };
const forkTo = (f, x, y) => { for (let i = 0; i < 30; i++) { f.x += (x - f.x) * 0.2; f.y += (y - f.y) * 0.2; S.step(1); } f.held = false; S.step(60); };
const onPlate = (b, p) => { b.x = p.x; b.y = p.y - 150; b.vx = b.vy = 0; S.step(60); };

// --- Basket
check('basket starts with water', S.INV.subs.join() === 'water' && S.INV.objs.length === 0);
S.toggleBasket('obj', 'banana'); S.toggleBasket('sub', 'milk');
check('tapping in storage puts it in the basket', S.inBasket('obj', 'banana') && S.inBasket('sub', 'milk'));
S.toggleBasket('obj', 'banana');
check('tapping again puts it back', !S.inBasket('obj', 'banana'));
check('the basket knows where things live', S.whereIs('obj', 'banana') === 'pantry' && S.whereIs('sub', 'milk') === 'fridge' && S.whereIs('obj', 'knife') === 'cabinets');

// --- Cutting board and knife
fresh();
const onB = S.makeBody('apple', 320, 500), offB = S.makeBody('apple', 1450, 500); S.step(90);
check('the cutting board is a surface things rest on', Math.abs(onB.y + onB.r - S.BOARD.top) < 3 && Math.abs(offB.y + offB.r - 840) < 3, `on board ${(onB.y + onB.r) | 0}, counter ${(offB.y + offB.r) | 0}`);
fresh();
let pieces = chopOnBoard('apple', 1);
check('a knife stroke cuts an apple on the board in two', pieces.length === 2 && pieces.every(p => p.r < S.OBJ.apple.r * 0.85), pieces.map(p => p.r.toFixed(1)).join(', '));
pieces = chopOnBoard('apple', 2);
check('pieces can be cut again, smaller each time', S.bodies.filter(x => x.type === 'apple').length >= 4);
fresh();
const rock = S.makeBody('rock', 320, 600); S.step(40);
const k = S.makeBody('knife', 320, 600 - 120); k.held = true;
for (let i = 0; i < 12; i++) { k.y += 18; k.vy = 1080; S.step(1); }
check('a rock cannot be cut', S.bodies.filter(x => x.type === 'rock').length === 1);
fresh();
const slow = S.makeBody('apple', 320, 600); S.step(40);
const k2 = S.makeBody('knife', 320, 480); k2.held = true;
for (let i = 0; i < 30; i++) { k2.y += 3; k2.vy = 180; S.step(1); }
check('resting the knife gently does not cut', S.bodies.filter(x => x.type === 'apple').length === 1);
fresh();
const offBoard = S.makeBody('apple', 1200, 600); S.step(40);
const k3 = S.makeBody('knife', 1200, 640); k3.held = true;
for (let i = 0; i < 12; i++) { k3.y += 18; k3.vy = 1080; S.step(1); }
check('cutting only happens on the cutting board', S.bodies.filter(x => x.type === 'apple').length === 1);

// --- Places: the counter and the oven are separate
fresh();
const c1 = S.makeBody('apple', 1450, 600);
S.setSection('oven'); const o1 = S.makeBody('orange', 1450, 600); S.setSection('counter');
S.step(120);
check('things on the counter and in the oven do not bump each other', c1.place === 'counter' && o1.place === 'oven' && Math.abs(c1.x - o1.x) < 20, `dx ${Math.abs(c1.x - o1.x) | 0}`);

// --- Every recipe can be finished with the real simulation
const run = (id, fn) => { fresh(); S.startRecipe(id); fn(); return S.recipe.complete; };
const steps = () => S.recipe.active.steps.map((s, i) => (S.recipe.done[i] ? '✓' : '✗') + s.text).join(' | ');
check('recipe: smoothie', run('smoothie', () => { dropIn('banana'); dropIn('strawberry'); pour('milk', 90); S.press('blend'); S.step(900); S.press('blend'); S.step(60); scoopWith('glass'); }), steps());
check('recipe: cake (baked in the oven)', run('cake', () => {
  pour('flour', 60); pour('sugar', 40);
  const egg = S.makeBody('egg', 560, 300); egg.held = true;            // knock it on the rim
  for (let i = 0; i < 20 && S.bodies.includes(egg); i++) { egg.y += 12; egg.x += 1; egg.vx = 60; egg.vy = 720; S.step(1); }
  S.step(60); pour('milk', 120); stir(240);
  S.setSection('oven'); S.setHeat(130); S.step(60 * 40); }), steps());
check('recipe: popcorn', run('popcorn', () => { pour('oil', 40); dropIn('kernel'); dropIn('kernel'); S.setHeat(130); S.step(60 * 30); }), steps());
check('recipe: lemonade', run('lemonade', () => { chopOnBoard('lemon', 1); pour('water', 120); moveToPot('lemon'); pour('sugar', 40); stir(200); scoopWith('cup'); }), steps());
check('recipe: volcano', run('volcano', () => { pour('soda', 60); pour('red', 30); pour('vinegar', 90); S.step(60); }), steps());
check('recipe: magic milk', run('magic', () => { pour('milk', 150); S.step(30); pour('red', 45); pour('blue', 45); pour('yellow', 45); S.step(30); pour('soap', 40); S.step(30); }), steps());
check('recipe: veggie soup', run('soup', () => { chopOnBoard('carrot', 1); chopOnBoard('tomato', 1); pour('water', 150); moveToPot('carrot'); moveToPot('tomato'); dropIn('broccoli'); S.setHeat(130); S.step(60 * 20); scoopWith('bowl'); }), steps());
check('recipe: toast (in the oven)', run('toast', () => { chopOnBoard('bread', 1); moveToPot('bread'); S.setSection('oven'); S.setHeat(130); S.step(60 * 25); const p = plateAt(1150); const br = S.bodies.find(b => b.type === 'bread' && b.inPot); const f = forkUp(br); forkTo(f, p.x, p.y - 120); }), steps());
check('recipe: fruit salad', run('fruitsalad', () => { chopOnBoard('apple', 1); chopOnBoard('banana', 1); chopOnBoard('strawberry', 1); const p = plateAt(1450); for (const t of ['apple', 'banana', 'strawberry']) onPlate(S.bodies.find(b => b.type === t), p); }), steps());
check('recipe ingredients all exist in storage', S.RECIPES.every(r => r.need.every(([k, t]) => S.whereIs(k, t))), S.RECIPES.flatMap(r => r.need.filter(([k, t]) => !S.whereIs(k, t)).map(x => x.join(':'))).join(','));
fresh();
const e2 = S.makeBody('egg', 560, 300); e2.held = true;
for (let i = 0; i < 20 && S.bodies.includes(e2); i++) { e2.y += 12; e2.vx = 0; e2.vy = 720; S.step(1); }
S.step(60);
check('knocking an egg on the rim cracks it into the pot', !S.bodies.includes(e2) && S.bodies.some(b => b.type === 'rawegg' && b.x > 590 && b.x < 1010), S.bodies.map(b => b.type + '@' + (b.x | 0)).join(' '));
fresh();
const e3 = S.makeBody('egg', 800, 300); e3.held = true;
for (let i = 0; i < 20; i++) { e3.y += 2; e3.vy = 120; S.step(1); }
check('holding an egg gently over the pot does not crack it', S.bodies.includes(e3));
fresh();
const tip = { type: 'red', x: 300, y: 400, tilt: 0, acc: 0, homeX: 300, homeY: 1200, alpha: 1, tx: 300, ty: 400 }; S.pourers.push(tip); S.startRecipe('volcano'); S.step(60);
check('pouring that misses the pot does not count as a recipe step', !S.events.some(e => e.kind === 'pour' && e.type === 'red' && e.t >= S.recipe.since));
fresh(); S.startRecipe('cake'); S.step(5);
check('a recipe does not count things done before it started', !S.recipe.done.some(Boolean));

// --- Dangerous touches
fresh(); S.setSection('oven'); S.setHeat(130); S.step(5);
const hand = () => ({ x: 800, y: 300, vx: 0, vy: 0, r: 42, inFluid: false, coat: null });
check('reaching into a hot oven burns', S.updateStir(hand(), 900, 600, 1 / 60) === 'hot');
S.setHeat(20); S.step(5);
check('reaching into a cool oven is fine', S.updateStir(hand(), 900, 600, 1 / 60) !== 'hot');
S.setSection('counter'); S.setHeat(130); S.step(5);
check('touching the lit burner beside the pot burns', S.updateStir(hand(), 520, 810, 1 / 60) === 'hot');
S.setHeat(20); S.step(5);
check('the burner is fine when the stove is off', S.updateStir(hand(), 520, 810, 1 / 60) !== 'hot');
fresh();
const st = hand(); st.x = 320; st.y = S.BOARD.top - 30; S.holds.set(77, { stir: st });
const kn = S.makeBody('knife', 320, S.BOARD.top - 200); kn.held = true;
for (let i = 0; i < 12; i++) { kn.y += 16; kn.vy = 960; S.step(1); }
check('chopping onto her own hand on the board: ouch', S.dangers.some(d => d.id === 77 && d.why === 'knife'));
S.dangers.length = 0; S.holds.clear();
const st2 = hand(); st2.x = 1200; st2.y = 700; S.holds.set(78, { stir: st2 });
const kn2 = S.makeBody('knife', 320, S.BOARD.top - 200); kn2.held = true;
for (let i = 0; i < 12; i++) { kn2.y += 16; kn2.vy = 960; S.step(1); }
check('the knife does not hurt a hand that is nowhere near it', S.dangers.length === 0);
S.holds.clear();
const allObjs = Object.keys(S.OBJ), allSubs = Object.values(S.STORAGE).flatMap(a => a.subs);
check('every item has a name', allObjs.every(t => S.NAMES.obj[t]) && allSubs.every(t => S.NAMES.sub[t]),
  [...allObjs.filter(t => !S.NAMES.obj[t]), ...allSubs.filter(t => !S.NAMES.sub[t])].join(','));


// --- Knife: a slow, steady, finger-speed stroke cuts (and does not shove the food away)
fresh();
const ap2 = S.makeBody('apple', 320, S.BOARD.top - 40); S.step(40); const x0 = ap2.x;
const kn3 = S.makeBody('knife', ap2.x, ap2.y - ap2.r - 120); kn3.held = true;
for (let i = 0; i < 70; i++) { kn3.y += 3; kn3.vy = 180; S.step(1); }
const apples = S.bodies.filter(b => b.type === 'apple');
check('knife: a slow, steady stroke cuts the apple', apples.length === 2, `${apples.length} pieces`);
check('knife: the blade goes into the food instead of pushing it away', Math.abs(apples[0].x - x0) < 70, `moved ${Math.abs(apples[0].x - x0) | 0}`);
S.bodies.splice(S.bodies.indexOf(kn3), 1);
fresh();
const ap3 = S.makeBody('apple', 1450, 700); S.step(40);
const kn4 = S.makeBody('knife', 1450, ap3.y - ap3.r - 120); kn4.held = true;
for (let i = 0; i < 70; i++) { kn4.y += 3; kn4.vy = 180; S.step(1); }
check('knife: cutting off the board shows "Put it on the cutting board!"', S.hints.includes('board') && S.bodies.filter(b => b.type === 'apple').length === 1);
S.hints.length = 0;
// --- Fork
fresh();
const ch = S.makeBody('cheese', 1450, 700); S.step(40);
const f1 = forkUp(ch);
check('fork: poking food picks it up on the fork', f1.carry === ch.id && ch.stuck === f1.id);
for (let i = 0; i < 30; i++) { f1.y -= 8; f1.vy = -480; S.step(1); }
check('fork: the food rides along on the fork', Math.abs(ch.x - f1.x) < 2 && ch.y < 640);
f1.held = false; S.step(60);
check('fork: letting go drops the food', ch.stuck == null && Math.abs(ch.y + ch.r - 840) < 4);
fresh(); pour('water', 150); const he = dropIn('egg'); S.setHeat(130); S.step(60 * 25);
const f2 = forkUp(he);
check('fork: takes a boiled egg out of a hot pot (no ouch for a fork)', f2.carry === he.id && he.boiled);
// --- Cups
fresh(); pour('water', 150); const w0 = S.pot.water; const gl = scoopWith('glass');
check('cups: dipping a glass in the pot scoops up the liquid', gl.fill > 20 && S.pot.water < w0 - 20, `glass ${gl.fill | 0}, pot ${w0 | 0} -> ${S.pot.water | 0}`);
check('cups: it is named for what is in it', S.bodyName(gl) === 'Glass of water', S.bodyName(gl));
fresh(); const g2 = S.makeBody('glass', 1450, 700); S.step(40);
const pq = { type: 'milk', x: 1450 + 30, y: 600, tilt: 0, acc: 0, homeX: 1450, homeY: 1200, alpha: 1, tx: 1480, ty: 600 }; S.pourers.push(pq); S.step(120); pq.returning = true; S.step(30);
check('cups: pouring a bottle straight into a glass fills it', g2.fill > 5 && S.bodyName(g2) === 'Glass of milk', `${g2.fill | 0} ${S.bodyName(g2)}`);
// --- Plates
fresh(); const pl = plateAt(1450); const cookie = S.makeBody('cookie', 1450, 500); S.step(80);
check('plates: food rests on the plate', Math.abs(cookie.y + cookie.r - (pl.y - 8)) < 4 && cookie.onPlate === pl.id, `cookie bottom ${(cookie.y + cookie.r) | 0}, plate top ${(pl.y - 8) | 0}`);
check('plates: putting food on a plate counts as serving it', S.events.some(e => e.kind === 'serve' && e.type === 'cookie'));
pl.held = true; for (let i = 0; i < 40; i++) { pl.x -= 5; pl.vx = -300; S.step(1); } pl.held = false; S.step(30);
check('plates: dragging the plate carries the food on it', Math.abs(cookie.x - pl.x) < 10, `plate ${pl.x | 0}, cookie ${cookie.x | 0}`);

// --- Preparation methods

const knockEgg = () => { const egg = S.makeBody('egg', 560, 300); egg.held = true; for (let i = 0; i < 20 && S.bodies.includes(egg); i++) { egg.y += 12; egg.x += 1; egg.vx = 60; egg.vy = 720; S.step(1); } S.step(40); return egg; };
const spoonStir = (frames) => { const w = S.makeBody('spoon', 800, 760); w.held = true; for (let i = 0; i < frames; i++) { const a = i / 4; w.x = 800 + Math.cos(a) * 110; w.y = S.potLayers().L.find(l => l.kind === 'aq') ? 775 : 760; w.vx = -Math.sin(a) * 110 * 15; w.vy = 0; S.step(1); } S.bodies.splice(S.bodies.indexOf(w), 1); };
const whiskIt = (frames) => { const w = S.makeBody('whisk', 800, 760); w.held = true; for (let i = 0; i < frames; i++) { const s2 = i % 8 < 4 ? 1 : -1; w.x = 800 + s2 * 90; w.vx = s2 * 700; w.vy = 0; w.y = 760; S.step(1); } S.bodies.splice(S.bodies.indexOf(w), 1); };
const squeezeIt = (type, frames) => { const h = S.bodies.find(b => b.type === type && (b.cut || 0) >= 1); h.held = true; for (let i = 0; i < frames; i++) { const s2 = i % 6 < 3 ? 1 : -1; h.x = 800 + s2 * 40; h.y = 380; h.vx = s2 * 400; h.vy = 0; S.step(1); } h.held = false; S.step(20); };
const toastIt = () => { const b = S.makeBody('bread', S.TOASTER.slot, 600); S.step(45); const inT = !!b.inToaster; S.step(60 * 5); return { b, inT }; };
const mashIt = (type) => {
  const o = S.makeBody(type, 320, S.BOARD.top - S.OBJ[type].r - 4); S.step(40);
  for (let n = 0; n < 3; n++) { const t = S.bodies.find(x => x.type === type && S.onBoard(x)); if (!t) break; const m = S.makeBody('masher', t.x, t.y - t.r - 90); m.held = true; for (let i = 0; i < 12; i++) { m.y += 16; m.vy = 960; S.step(1); } S.bodies.splice(S.bodies.indexOf(m), 1); S.step(20); }
  return S.bodies.find(b => b.type === 'mash' && b.src === type);
};

fresh(); const tt = toastIt();
check('toaster: bread dropped on it goes in the slot', tt.inT);
check('toaster: the toast lands beside it, not back in the slot', !tt.b.inToaster && tt.b.x < S.TOASTER.slot - 30, `x ${tt.b.x | 0}`);
check('toaster: it pops up toasted with a ding', !tt.b.inToaster && tt.b.toast > 0.9 && S.events.some(e => e.kind === 'toaster' && e.type === 'bread'), `toast ${tt.b.toast.toFixed(2)}`);
check('toaster: its name is now Toast', S.bodyName(tt.b) === 'Toast');
fresh(); const bt = S.makeBody('bread', S.TOASTER.slot, 600); S.step(30);
check('toaster: touching it while it is on burns', S.updateStir({ x: 1260, y: 700, vx: 0, vy: 0, r: 42 }, 1255, S.TOASTER.top - 10, 1 / 60) === 'hot');
S.step(60 * 5);
check('toaster: fine to touch once it pops', S.updateStir({ x: 1260, y: 700, vx: 0, vy: 0, r: 42 }, 1255, S.TOASTER.top - 10, 1 / 60) !== 'hot');
fresh(); const mash = mashIt('avocado');
check('masher: three presses turn an avocado into mash', !!mash && !S.bodies.some(b => b.type === 'avocado') && S.bodyName(mash) === 'Mashed avocado', mash ? S.bodyName(mash) : 'no mash');
fresh(); const rk = S.makeBody('rock', 320, 700); S.step(40); const mm = S.makeBody('masher', 320, 560); mm.held = true; for (let i = 0; i < 12; i++) { mm.y += 16; mm.vy = 960; S.step(1); }
check('masher: a rock does not mash', S.bodies.some(b => b.type === 'rock') && !S.bodies.some(b => b.type === 'mash'));
fresh(); chopOnBoard('orange', 1); const jw0 = S.pot.jw; squeezeIt('orange', 120);
check('squeeze: a cut orange wiggled over the pot drips orange juice', S.pot.jw > jw0 + 5 && S.pot.water > 3 && S.events.some(e => e.kind === 'squeeze' && e.type === 'orange'), `juice ${S.pot.jw.toFixed(1)}`);
fresh(); const whole = S.makeBody('orange', 800, 380); whole.held = true; for (let i = 0; i < 90; i++) { const s2 = i % 6 < 3 ? 1 : -1; whole.x = 800 + s2 * 40; whole.vx = s2 * 400; S.step(1); }
check('squeeze: a whole orange does not drip', S.pot.water < 0.5);
fresh(); pour('milk', 150); whiskIt(240);
check('whisk: whisking milk fast makes it foamy', S.pot.foam > 24 && S.events.some(e => e.kind === 'whip'), `foam ${S.pot.foam | 0}`);
fresh(); knockEgg(); whiskIt(120);
check('whisk: a cracked egg beats into the pot', S.pot.egg > 0 && !S.bodies.some(b => b.type === 'rawegg' && b.inPot));
S.setHeat(130); S.step(60 * 20);
check('...and cooks into scrambled egg', S.bodies.some(b => b.type === 'friedegg' && b.scrambled) && S.bodyName(S.bodies.find(b => b.scrambled)) === 'Scrambled egg');
fresh(); pour('water', 150); const eg = dropIn('egg'); S.setHeat(130); S.step(60 * 25);
check('boil: a whole egg in boiling water hard-boils', eg.boiled && S.bodyName(eg) === 'Boiled egg');
S.setHeat(20); S.step(120);
const hb = S.bodies.find(b => b.type === 'egg' && b.boiled); hb.held = true; hb.x = 560; hb.y = 300; for (let i = 0; i < 20; i++) { hb.y += 12; hb.vy = 720; S.step(1); }
check('boil: a boiled egg does not crack open on the rim', S.bodies.includes(hb));
fresh(); pour('water', 150); S.setHeat(-25); S.step(60 * 20);
check('freeze: cold turns water into ice', S.pot.T < 0 && S.events.some(e => e.kind === 'freeze'));
fresh(); S.setHeat(130); S.step(60 * 4); dropIn('butter'); S.step(60 * 8);
check('melt: butter melts in a hot pot', S.events.some(e => e.kind === 'melt' && e.type === 'butter'));
fresh(); const tb = toastIt().b; tb.x = 1450; tb.y = 700; tb.vx = tb.vy = 0; S.step(40); const bu = S.makeBody('butter', 1450, 600); S.step(60);
check('spread: butter on toast melts onto it', tb.buttered && !S.bodies.includes(bu) && S.bodyName(tb) === 'Buttered toast');
fresh(); const plain = S.makeBody('bread', 1450, 700); S.step(30); const bu2 = S.makeBody('butter', 1450, 600); S.step(60);
check('spread: butter does not spread on untoasted bread', !plain.buttered && S.bodies.includes(bu2));

// --- The new recipes, finished with the real simulation
check('recipe: buttered toast', run('buttertoast', () => { const b = toastIt().b; b.x = 1450; b.y = 700; b.vx = b.vy = 0; S.step(30); S.makeBody('butter', 1450, 600); S.step(60); const p = plateAt(1100); onPlate(b, p); }), steps());
check('recipe: guacamole', run('guac', () => { const m = mashIt('avocado'); m.x = 800; m.y = 400; S.step(60); chopOnBoard('tomato', 1); moveToPot('tomato'); pour('water', 40); chopOnBoard('lemon', 1); squeezeIt('lemon', 120); spoonStir(200); }), steps());
check('recipe: orange juice', run('oj', () => { chopOnBoard('orange', 1); squeezeIt('orange', 120); scoopWith('glass'); }), steps());
check('recipe: scrambled eggs', run('scrambled', () => { S.setHeat(130); S.step(60 * 4); dropIn('butter'); S.step(60 * 8); S.setHeat(20); S.step(60 * 6); knockEgg(); whiskIt(120); S.setHeat(130); S.step(60 * 20); const p = plateAt(1450); const sc = S.bodies.find(b => b.scrambled); const f = forkUp(sc); forkTo(f, p.x, p.y - 120); }), steps());
check('recipe: boiled egg', run('boiledegg', () => { pour('water', 150); const e = dropIn('egg'); S.setHeat(130); S.step(60 * 25); const p = plateAt(1450); const f = forkUp(e); forkTo(f, p.x, p.y - 120); }), steps());
check('recipe: hot cocoa', run('cocoa', () => { pour('milk', 150); dropIn('choc'); S.setHeat(90); S.step(60 * 15); spoonStir(200); S.setHeat(20); dropIn('mallow'); scoopWith('mug'); }), steps());
check('recipe: fruit ice pop', run('icepop', () => { dropIn('strawberry'); dropIn('banana'); pour('water', 150); S.press('blend'); S.step(900); S.press('blend'); S.step(60); S.setHeat(-25); S.step(60 * 25); }), steps());
check('recipe: banana milkshake', run('milkshake', () => { dropIn('banana'); dropIn('icecream'); pour('milk', 150); S.press('blend'); S.step(900); S.press('blend'); S.step(60); scoopWith('glass'); }), steps());
check('recipe: milk foam', run('foam', () => { pour('milk', 150); whiskIt(240); scoopWith('mug'); }), steps());
check('recipe: cola slushie', run('slushie', () => { dropIn('ice'); dropIn('ice'); pour('cola', 150); S.press('blend'); S.step(900); S.press('blend'); S.step(60); scoopWith('cup'); }), steps());
check('recipe: cheese toast', run('cheesetoast', () => { dropIn('bread', 380); dropIn('cheese', 380); S.setSection('oven'); S.setHeat(130); S.step(60 * 30); const p = plateAt(1150); const br = S.bodies.find(b => b.type === 'bread'); const f = forkUp(br); forkTo(f, p.x, p.y - 120); }), steps());
check('all 20 recipes are in the book, each in a group', S.RECIPES.length === 20 && S.RECIPES.every(r => S.RECIPE_CATS.some(c => c[0] === r.cat)));
check('every recipe ingredient can be found in storage', S.RECIPES.every(r => r.need.every(([k, t]) => S.whereIs(k, t))), S.RECIPES.flatMap(r => r.need.filter(([k, t]) => !S.whereIs(k, t)).map(x => x.join(':'))).join(','));
console.log(`\n${pass} passed, ${fail} failed`);
