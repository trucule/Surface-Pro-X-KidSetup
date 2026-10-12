const fs = require('fs');
global.window = global; global.performance = { now: () => Date.now() };
eval(fs.readFileSync(require('path').join(__dirname, '../src/sim.js'), 'utf8') + `
;global.S = { get pot(){return pot}, get bodies(){return bodies}, get heat(){return heat}, get stove(){return stove}, get freezer(){return freezer},
  setHeat, press, makeBody, deposit, potLayers, aqueous, isMud, indicatorColor, resetPot, updateStir, holds, OBJ, INV, STORAGE, toggleBasket, setSection, get section(){return section},
  step(n){ for(let i=0;i<n;i++){ const dt=1/60; time+=dt; updateBlender(dt); for(let s=0;s<2;s++) stepBodies(dt/2); updateObjects(dt); updateParticles(dt); updatePot(dt);} } };`);
const fill = (sub, amt) => { for (let i = 0; i < amt; i++) S.deposit(sub, 1, 800); };
const fresh = () => { S.bodies.length = 0; S.resetPot(false); S.setHeat(20); };
let pass = 0, fail = 0;
const check = (n, ok, info) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info ? '  [' + info + ']' : '')); };

// Heat dial.
fresh(); fill('water', 150); S.setHeat(60); S.step(900);
check('pot settles near the dial setting (60)', Math.abs(S.pot.T - 60) < 4, `T ${S.pot.T.toFixed(1)}, flames level ${S.stove}`);
S.setHeat(5); S.step(900);
check('cooling to 5 brings the pot down, no freezing', Math.abs(S.pot.T - 5) < 4 && S.pot.T > 0, `T ${S.pot.T.toFixed(1)}, frost cloud ${S.freezer}`);
S.setHeat(-25); S.step(1200);
check('full cold freezes it', S.pot.T < 0);
fresh(); fill('water', 150); S.setHeat(105); S.step(900); const a = S.aqueous();
fresh(); fill('water', 150); S.setHeat(130); S.step(900); const b = S.aqueous();
check('hotter setting boils water away faster', a > b + 20, `water left at 105: ${a | 0}, at 130: ${b | 0}`);
fresh(); fill('water', 150); S.setHeat(90); S.step(1500);
check('below boiling, nothing boils away', S.aqueous() > 145, `water ${S.aqueous() | 0}, T ${S.pot.T | 0}`);

// Bread: floats, soaks, swells, sinks, falls apart.
fresh(); fill('water', 200); const br = S.makeBody('bread', 800, 520); S.step(60);
const top = S.potLayers().aqTop, floatY = br.y;
S.step(240); const soggyY = br.y, r = br.r;
check('bread floats at first, then soaks up water, swells, and sinks', floatY < top + br.r && soggyY > floatY + 40 && r > 38, `y ${floatY | 0} -> ${soggyY | 0}, size 36 -> ${r | 0}`);
S.step(400);
check('...and falls apart into mush', !S.bodies.includes(br) && S.pot.pulp > 5);
fresh(); const tb = S.makeBody('bread', 800, 700); S.setHeat(130); S.step(900);
check('bread toasts in a hot, dry pot', tb.toast > 0.5, `toast ${tb.toast.toFixed(2)}`);

// Jam, cooked broccoli, pineapple acid.
fresh(); fill('water', 80); S.setHeat(110); S.step(300);
['strawberry', 'strawberry', 'cherries'].forEach((t, i) => S.makeBody(t, 740 + i * 60, 600)); S.step(1500);
check('strawberries and cherries cook down into jam', !S.bodies.some(x => x.type === 'strawberry' || x.type === 'cherries') && S.pot.sugarD > 10 && S.pot.disp[0] > S.pot.disp[2], `color ${S.pot.disp.map(v => v | 0)}`);
fresh(); fill('water', 200); S.setHeat(130); S.step(600); const bro = S.makeBody('broccoli', 800, 600); S.step(400);
check('broccoli turns bright green as it boils', bro.toast > 0.5);
fresh(); fill('water', 150); S.setHeat(80); S.step(300); S.makeBody('cabbage', 800, 600); S.step(500); S.setHeat(20);
const before = S.indicatorColor(); S.makeBody('pineapple', 800, 520);
S.press('blend'); S.step(900); S.press('blend');
const after = S.indicatorColor();
check('blended pineapple is acidic (cabbage indicator goes pink)', after[0] > before[0] + 30, `before ${before.map(v => v | 0)} after ${after.map(v => v | 0)}`);

// Mud.
fresh(); fill('water', 150); fill('sand', 15); S.step(20);
check('a little sand clouds the water as it falls in', S.pot.turb > 5 && !S.isMud(), `cloudiness ${S.pot.turb | 0}`);
S.step(600);
check('...then settles to the bottom', S.pot.turb < 2 && S.potLayers().L.some(l => l.kind === 'sand'));
fill('sand', 60); S.step(30);
const kinds = S.potLayers().L.map(l => l.kind);
check('a lot of sand turns the pot into mud', S.isMud() && kinds.includes('mud') && !kinds.includes('aq'), kinds.join(','));
const duck = S.makeBody('duck', 800, 480), rock = S.makeBody('rock', 740, 480), apple = S.makeBody('apple', 860, 480);
const v0 = [];
for (let i = 0; i < 120; i++) { S.step(1); const top = S.potLayers().L.find(l => l.kind === 'mud').top; if (rock.y - rock.r > top + 5) v0.push(Math.abs(rock.vy)); }
S.step(300);
const mudTop = S.potLayers().L.find(l => l.kind === 'mud').top;
check('things move slowly in mud; light things sit on top', v0.length > 0 && Math.max(...v0.slice(10)) < 250 && duck.y < mudTop + duck.r && apple.y < mudTop + apple.r, `rock speed inside mud ${Math.max(...v0.slice(10)) | 0} (in air it reaches ~500), duck ${(duck.y - mudTop) | 0} from top`);
const st = { x: 800, y: 600, vx: 0, vy: 0, r: 42, inFluid: false, coat: null };
for (let i = 0; i < 30; i++) S.updateStir(st, 800 + Math.sin(i / 3) * 100, 650, 1 / 60);
check('a hand in mud comes out muddy', st.coat && st.coat[0] < 150 && st.coat[2] < 80, `coat ${st.coat}`);
S.setHeat(-25); S.step(1500);
check('mud freezes solid too', duck.locked || rock.locked || apple.locked);

// Kitchen areas and the counter tray.
const all = Object.values(S.STORAGE).flatMap(a => [...a.subs.map(t => 'sub:' + t), ...a.objs.map(t => 'obj:' + t), ...(a.freezer || []).map(t => 'obj:' + t)]);
const objTypes = Object.keys(S.OBJ).filter(t => !['popcorn', 'friedegg', 'rawegg', 'shell', 'mash', 'raisin', 'tablet', 'paper', 'stick', 'slime', 'curd'].includes(t));
check('every object and bottle lives in exactly one storage area', all.length === new Set(all).size && all.filter(x => x.startsWith('obj:')).length === objTypes.length && all.filter(x => x.startsWith('sub:')).length === 16,
  `${all.length} items, ${new Set(all).size} unique`);
check('the basket starts with just water', S.INV.subs.join() === 'water' && S.INV.objs.length === 0);
objTypes.forEach(t => S.toggleBasket('obj', t));
check('the basket holds as many different things as she likes', S.INV.objs.length === objTypes.length, `${S.INV.objs.length} things`);
fresh(); S.setHeat(-25); S.setSection('oven');
check('going to the oven turns cold back to off', S.heat === 20 && S.section === 'oven');
S.setHeat(-10);
check('the oven dial cannot go below off', S.heat === 20);
fill('water', 150); S.setHeat(130); S.step(900);
check('the oven heats the pot', S.pot.T > 95, `T ${S.pot.T | 0}`);
S.setSection('counter'); S.setHeat(-25);
check('back at the counter, cold works again', S.heat === -25);
console.log(`\n${pass} passed, ${fail} failed`);
