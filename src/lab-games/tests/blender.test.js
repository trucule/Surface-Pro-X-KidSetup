const fs = require('fs');
global.window = global; global.performance = { now: () => Date.now() };
eval(fs.readFileSync(require('path').join(__dirname, '../src/sim.js'), 'utf8') + `
;global.S = { get pot(){return pot}, get bodies(){return bodies}, get particles(){return particles}, set stove(v){setHeat([20,78,130][v])}, set freezer(v){setHeat(v ? -25 : 20)},
  get blender(){return blender}, blade, holds, makeBody, deposit, potLayers, aqueous, updateStir, press, indicatorColor, targetWaterRGB, resetPot,
  step(n){ for(let i=0;i<n;i++){ const dt=1/60; time+=dt; updateBlender(dt); for(let s=0;s<2;s++) stepBodies(dt/2); updateObjects(dt); updateParticles(dt); updatePot(dt);} } };`);
const S = global.S;
const fill = (sub, amt) => { for (let i = 0; i < amt; i++) S.deposit(sub, 1, 800); };
const fresh = () => { if (S.blender) S.press('blend'); S.step(120); S.bodies.length = 0; S.particles.length = 0; S.resetPot(false); S.stove = 0; S.freezer = false; };
let pass = 0, fail = 0;
const check = (n, ok, info) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info ? '  [' + info + ']' : '')); };
const rgb = c => c.map(v => v | 0).join(',');

// Blades rise and spin; mixing is near-instant.
fresh(); fill('water', 160); S.step(30); fill('blue', 6);
S.press('blend'); S.step(30);
check('blades rise when the button is pressed', S.blade.h > 0.9, `height ${S.blade.h.toFixed(2)}`);
S.step(60);
const t = S.targetWaterRGB(), d = S.pot.disp;
check('blades spin and mix the color in fast', S.blade.spin > 0.8 && Math.hypot(t[0] - d[0], t[1] - d[1], t[2] - d[2]) < 6, `spin ${S.blade.spin.toFixed(2)}, stir ${S.pot.stir.toFixed(2)}`);

// Orange + carrot smoothie.
fresh(); fill('water', 150); S.press('blend'); S.step(40);
const o = S.makeBody('orange', 800, 520), c = S.makeBody('carrot', 760, 520);
S.step(600);
const col = S.pot.disp;
check('orange and carrot get blended away', !S.bodies.includes(o) && !S.bodies.includes(c));
check('...into an orange smoothie with pulp', col[0] > 200 && col[1] > 90 && col[1] < 190 && col[2] < 110 && S.pot.pulp > 15, `color ${rgb(col)}, pulp ${S.pot.pulp | 0}`);

// Banana + milk shake is creamy.
fresh(); fill('milk', 100); fill('water', 40); S.press('blend'); S.step(40);
S.makeBody('banana', 800, 520); S.step(600);
check('banana milkshake is creamy pale yellow', S.pot.disp[0] > 230 && S.pot.disp[1] > 215 && S.pot.disp[2] > 150, rgb(S.pot.disp));

// A rock clunks and stalls the blades but survives.
fresh(); fill('water', 150); S.press('blend'); S.step(40);
const rock = S.makeBody('rock', 800, 600); let jammed = false;
for (let i = 0; i < 240; i++) { S.step(1); if (S.blade.jam > 0) jammed = true; }
check('a rock clunks, stalls the blades, and is not blended', jammed && S.bodies.includes(rock));
const duck = S.makeBody('duck', 800, 600); S.step(300);
check('the rubber duck bounces around but survives', S.bodies.includes(duck));

// Ice -> slush, and it cools the pot.
fresh(); fill('water', 120); S.stove = 1; S.step(400); S.stove = 0; const T0 = S.pot.T;
S.press('blend'); S.step(40); S.makeBody('ice', 800, 520); S.makeBody('ice', 780, 520); S.step(400);
check('ice blends into slush and cools the pot', !S.bodies.some(b => b.type === 'ice') && S.pot.T < T0 - 8, `T ${T0 | 0} -> ${S.pot.T | 0}`);

// Lemon is acid: with cabbage juice it turns pink.
fresh(); fill('water', 150); S.press('blend'); S.step(40);
S.makeBody('cabbage', 800, 520); S.step(400); const before = S.indicatorColor();
S.makeBody('lemon', 800, 520); S.step(400); const after = S.indicatorColor();
check('blended cabbage + lemon: the indicator turns pink', after[0] > before[0] + 30 && after[0] > after[2], `before ${rgb(before)} after ${rgb(after)}`);

// Frozen: the blades can't turn.
fresh(); fill('water', 150); S.freezer = true; S.step(900); S.press('blend'); S.step(120);
check('blades cannot spin in frozen water', S.blade.spin < 0.1, `T ${S.pot.T | 0}, spin ${S.blade.spin.toFixed(2)}`);

// Hands stay out while the blades spin; blades go back down when switched off.
fresh(); fill('water', 150); S.press('blend'); S.step(60);
const res = S.updateStir({ x: 800, y: 440, vx: 0, vy: 0, r: 42 }, 800, 650, 1 / 60);
check('a hand reaching in while blades spin pulls back', res === 'blades');
S.press('blend'); S.step(120);
check('switching off stops the blades and lowers them', S.blade.spin < 0.05 && S.blade.h === 0);
check('hands can go back in once the blades stop', S.updateStir({ x: 800, y: 440, vx: 0, vy: 0, r: 42 }, 800, 650, 1 / 60) === 'ok');

// Nothing escapes the pot while blending a crowd.
fresh(); fill('water', 170); ['apple', 'banana', 'grapes', 'tomato', 'mushroom', 'cookie', 'duck'].forEach((t, i) => S.makeBody(t, 640 + i * 55, 540));
S.press('blend'); S.step(900);
const out = S.bodies.filter(b => !(b.x > 580 && b.x < 1020 && b.y > 300)).map(b => b.type);
check('blending a crowded pot keeps things in the pot', out.length === 0, out.join(',') || `left: ${S.bodies.map(b => b.type).join(',')}`);
check('floaters get pulled down and blended (only the duck is left)', S.bodies.every(b => b.type === 'duck'), S.bodies.map(b => b.type).join(','));
S.step(1200);
check('values stay finite', Object.values(S.pot).every(v => typeof v !== 'number' || isFinite(v)));
console.log(`\n${pass} passed, ${fail} failed`);
