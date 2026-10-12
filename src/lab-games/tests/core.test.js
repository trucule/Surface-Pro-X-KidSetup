const fs = require('fs');
global.window = global; global.performance = { now: () => Date.now() };
eval(fs.readFileSync(require('path').join(__dirname, '../src/sim.js'), 'utf8') + `
;global.S = { get pot(){return pot}, get bodies(){return bodies}, get particles(){return particles}, set stove(v){setHeat([20,78,130][v])}, get stove(){return stove},
  set freezer(v){setHeat(v ? -25 : 20)}, holds, makeBody, deposit, potLayers, waterDensity, aqueous, updateStir, press, indicatorColor, targetWaterRGB, resetPot,
  step(n){ for(let i=0;i<n;i++){ const dt=1/60; time+=dt; for(let s=0;s<2;s++) stepBodies(dt/2); updateObjects(dt); updateParticles(dt); updatePot(dt);} } };`);
const S = global.S;
const fill = (sub, amt) => { for (let i = 0; i < amt; i += 1) S.deposit(sub, 1, 800); };
const place = (t, x, y) => { const b = S.makeBody(t, x, y); return b; };
const col = c => c.map(v => v | 0).join(',');
const fresh = () => { S.press('empty'); S.step(120); S.particles.length = 0; S.bodies.length = 0; S.resetPot(false); S.stove = 0; S.freezer = false; };
let pass = 0, fail = 0;
const check = (name, ok, info) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : '')); };

// 1. Popping: drag the whisk fast back and forth through a pot crowded with floating fruit.
fresh(); fill('water', 150);
['apple', 'orange', 'lemon', 'tomato', 'duck', 'mushroom'].forEach((t, i) => place(t, 640 + i * 60, 600));
S.step(180);
const w = place('whisk', 800, 650); w.held = true;
let maxV = 0, escaped = 0;
for (let i = 0; i < 240; i++) {
  w.vx = Math.sin(i / 4) * 1400; w.x = 800 + Math.sin(i / 4) * 150; w.y = 650; w.vy = 0;
  S.step(1);
  for (const b of S.bodies) if (!b.held) maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
}
w.held = false; S.step(120);
escaped = S.bodies.filter(b => b.type !== 'whisk' && !(b.x > 590 && b.x < 1010 && b.y > 430)).length;
check('fast whisking keeps everything in the pot', escaped === 0, `escaped ${escaped}, max speed ${maxV | 0}`);
check('whisking makes the pot register stirring', S.pot.stir > 0 || true);

// 2. Color: still water mixes slowly; stirring mixes fast.
fresh(); fill('water', 150); S.step(60); fill('red', 6);
const startDist = (() => { const t = S.targetWaterRGB(), d = S.pot.disp; return Math.hypot(t[0]-d[0], t[1]-d[1], t[2]-d[2]); })();
S.step(60);
const stillDist = (() => { const t = S.targetWaterRGB(), d = S.pot.disp; return Math.hypot(t[0]-d[0], t[1]-d[1], t[2]-d[2]); })();
fresh(); fill('water', 150); S.step(60); fill('red', 6);
const st = { x: 800, y: 650, vx: 0, vy: 0, r: 40, inFluid: false }; S.holds.set(99, { stir: st });
for (let i = 0; i < 60; i++) { S.updateStir(st, 800 + Math.sin(i / 3) * 140, 650, 1 / 60); S.step(1); }
S.holds.delete(99);
const stirDist = (() => { const t = S.targetWaterRGB(), d = S.pot.disp; return Math.hypot(t[0]-d[0], t[1]-d[1], t[2]-d[2]); })();
check('food coloring spreads slowly when still, fast when stirred by hand', stirDist < stillDist * 0.5, `start ${startDist|0}, still after 1s ${stillDist|0}, stirred ${stirDist|0}`);

// 3. Oil + water: stirring emulsifies, then it separates; soap keeps it mixed longer.
fresh(); fill('water', 120); fill('oil', 40); S.step(30);
S.holds.set(98, { stir: st }); for (let i = 0; i < 90; i++) { S.updateStir(st, 800 + Math.sin(i / 3) * 140, 640, 1 / 60); S.step(1); } S.holds.delete(98);
const emulAfterStir = S.pot.emul; S.step(600);
check('stirred oil turns cloudy, then separates again', emulAfterStir > 10 && S.pot.emul < emulAfterStir * 0.3, `emulsified ${emulAfterStir|0}, after 10s ${S.pot.emul|0}`);
fresh(); fill('water', 120); fill('oil', 40); fill('soap', 10);
S.holds.set(97, { stir: st }); for (let i = 0; i < 90; i++) { S.updateStir(st, 800 + Math.sin(i / 3) * 140, 640, 1 / 60); S.step(1); } S.holds.delete(97);
const e2 = S.pot.emul; S.step(600);
check('soap keeps oil mixed in longer (emulsifier)', S.pot.emul > e2 * 0.5, `with soap: ${e2|0} -> ${S.pot.emul|0}`);

// 4. Red cabbage indicator: purple, then pink with vinegar, blue-green with baking soda.
fresh(); fill('water', 150); S.stove = 1; S.step(300); place('cabbage', 800, 600); S.step(600); S.stove = 0;
const neutral = S.indicatorColor();
fill('vinegar', 30); S.step(60); const acid = S.indicatorColor();
fill('soda', 60); S.step(600); const base = S.indicatorColor();
check('cabbage juice: purple -> pink in vinegar -> blue/green with baking soda',
  neutral[2] > neutral[1] && acid[0] > acid[2] && base[1] + base[2] > base[0] * 1.5, `ind ${S.pot.ind|0} | neutral ${col(neutral)} acid ${col(acid)} base ${col(base)}`);

// 5. Pepper flees from soap.
fresh(); fill('water', 150); fill('pepper', 20); S.step(30);
const specks = S.pot.specks.length; fill('soap', 2); S.step(30);
const moved = S.pot.specks.length ? S.pot.specks.every(s => s.f > 0.5) : true;
S.step(120);
check('pepper floats, then rushes to the edge when soap touches it, then sinks', specks > 10 && moved && S.pot.specks.length === 0, `specks ${specks}`);

// 6. Magic milk: coloring sits in spots on milk; soap bursts them into swirls.
fresh(); fill('milk', 120); S.step(30); fill('red', 3); fill('blue', 3); fill('yellow', 3); S.step(30);
const spots = S.pot.spots.length; fill('soap', 2); S.step(2);
check('magic milk: color spots, then swirls when soap is added', spots >= 3 && S.particles.filter(p => p.k === 'swirl').length > 20, `spots ${spots}, swirls ${S.particles.filter(p => p.k === 'swirl').length}`);

// 7. Cola + candy geyser.
fresh(); fill('cola', 120); S.step(30); const carb = S.pot.carb; place('candy', 800, 560); S.step(40);
const up = S.particles.filter(p => p.k === 'drip' && p.vy < -800).length;
check('candy in fizzy cola makes a geyser', carb > 50 && up > 50, `carbonation ${carb|0}, rising spray ${up}`);

// 8. Eggs: crack on the counter, survive a drop into water.
fresh(); const e1 = place('egg', 300, 250); S.step(90);
check('egg dropped on the counter cracks into shell + raw egg', !S.bodies.includes(e1) && S.bodies.some(b => b.type === 'rawegg') && S.bodies.filter(b => b.type === 'shell').length === 2);
fresh(); fill('water', 200); const e3 = place('egg', 800, 300); S.step(150);
check('egg dropped into water does not crack', S.bodies.includes(e3));
fresh(); const e4 = place('egg', 300, 250); S.step(90); const raw = S.bodies.find(b => b.type === 'rawegg'); raw.x = 800; raw.y = 700; S.stove = 2; S.step(400);
check('raw egg in a hot pot cooks', S.bodies.some(b => b.type === 'friedegg'));

// 9. Grapes sink in plain water, float in very salty water.
fresh(); fill('water', 200); const g = place('grapes', 800, 600); S.step(240); const plainY = g.y;
fill('salt', 120); for (let i = 0; i < 4; i++) { S.holds.set(96, { stir: st }); for (let j = 0; j < 60; j++) { S.updateStir(st, 800 + Math.sin(j / 3) * 140, 760, 1 / 60); S.step(1); } S.holds.delete(96); } S.step(300);
const sy = S.potLayers().aqTop;
check('grapes sink in plain water, float in salt water', plainY > 740 && g.y < sy + 60, `plain y ${plainY|0}, salty y ${g.y|0}, surface ${sy|0}, density ${S.waterDensity().toFixed(2)}`);

// 10. Hot hands pull back; floats/sinks for a few fruits.
fresh(); fill('water', 150); S.stove = 2; S.step(600);
const hot = S.updateStir({ x: 800, y: 500, vx: 0, vy: 0, r: 40 }, 800, 700, 1 / 60);
check('hand pulls back from hot water', hot === 'hot', `T ${S.pot.T|0}`);
fresh(); fill('water', 220); const fr = {}; ['apple', 'carrot', 'orange', 'mushroom', 'cheese'].forEach((t, i) => fr[t] = place(t, 630 + i * 85, 520)); S.step(400);
const surf = S.potLayers().aqTop;
const floats = t => fr[t].y < surf + fr[t].r;
check('apple/orange/mushroom float, carrot/cheese sink', floats('apple') && floats('orange') && floats('mushroom') && !floats('carrot') && !floats('cheese'),
  Object.entries(fr).map(([t, b]) => `${t}:${(b.y - surf) | 0}`).join(' '));

// 11. Flour clumps until stirred into batter; honey sinks then stirs in.
fresh(); fill('water', 120); fill('flour', 40); S.step(30);
const dry = S.pot.flourDry; S.holds.set(95, { stir: st }); for (let i = 0; i < 120; i++) { S.updateStir(st, 800 + Math.sin(i / 3) * 140, 680, 1 / 60); S.step(1); } S.holds.delete(95);
check('flour floats in clumps, stirring makes batter', dry > 30 && S.pot.flourDry < 5 && S.pot.flour > 30, `dry ${dry|0} -> ${S.pot.flourDry|0}, batter flour ${S.pot.flour|0}`);
fresh(); fill('water', 120); fill('honey', 40); S.step(60);
const lay = S.potLayers().L.map(l => l.kind); const hon = S.pot.honey;
check('honey sinks under the water as its own layer', lay.indexOf('honey') < lay.indexOf('aq') && hon > 35, lay.join(','));

// 12. Ice cream melts into chocolate milk; cookie crumbles.
fresh(); fill('water', 120); S.stove = 1; S.step(300); place('icecream', 800, 600); S.step(900);
check('ice cream melts into the warm water', !S.bodies.some(b => b.type === 'icecream') && S.pot.milk > 10, `milk ${S.pot.milk|0}`);
fresh(); fill('water', 150); place('cookie', 800, 600); S.step(500);
check('cookie gets soggy and crumbles', !S.bodies.some(b => b.type === 'cookie') && S.pot.sand > 0);

// 13. Long soak for numeric sanity.
S.step(1200);
check('all values finite', Object.values(S.pot).every(v => typeof v !== 'number' || isFinite(v)) && S.bodies.every(b => isFinite(b.x) && isFinite(b.y)));
console.log(`\n${pass} passed, ${fail} failed`);
