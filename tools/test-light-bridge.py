"""Checks Light Bridge: every level makes boards whose stored answer is valid and which a separate solver can solve,
many times, the level rule works, drawing bridges by dragging works, full answers win and partial ones do not, hints
and skips count as misses, and the page has no errors. Run: python3 tools/test-light-bridge.py"""
import pathlib, sys
from playwright.sync_api import sync_playwright

APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'light-bridge.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)
problems = []

GEN = r"""
(N) => {
  const R = LIGHT_BRIDGE, out = { problems: [], counts: {}, nodes: {} };
  R.LEVELS.forEach((L, i) => {
    const tag = `L${i + 1} ${L.name} ${L.n}x${L.n}`; out.counts[tag] = 0; let worst = 0;
    for (let k = 0; k < N; k++) {
      let pz; try { pz = R.generate(i); } catch (e) { out.problems.push(`${tag}: threw ${e.message}`); break; }
      out.counts[tag]++;
      if (pz.n !== L.n || pz.k !== L.k || pz.ends.length !== L.k) out.problems.push(`${tag}: size or colors`);
      const ends = pz.ends.flat(); if (new Set(ends).size !== ends.length) out.problems.push(`${tag}: orbs share a square`);
      if (pz.solution.some(p => p.length < 3)) out.problems.push(`${tag}: a bridge shorter than 3`);
      if (!R.validSolution(pz, pz.solution)) out.problems.push(`${tag}: stored answer is not valid`);
      // Solve again from scratch with only the orbs, so the check does not lean on the stored answer.
      const bare = { n: pz.n, k: pz.k, ends: pz.ends.map(e => e.slice()) }, s = R.solve(bare, 400000);
      if (!s.solution || !R.validSolution(bare, s.solution)) out.problems.push(`${tag}: solver found no answer`);
      worst = Math.max(worst, s.nodes);
      // Broken answers must be caught.
      const cut = pz.solution.map(p => p.slice()); cut[0].pop();
      if (R.validSolution(pz, cut)) out.problems.push(`${tag}: short bridge passed`);
      const swap = pz.solution.map(p => p.slice()); if (swap.length > 1) { [swap[0], swap[1]] = [swap[1], swap[0]]; if (R.validSolution(pz, swap)) out.problems.push(`${tag}: wrong colors passed`); }
    }
    out.nodes[tag] = worst;
  });
  return out;
}
"""

LADDER = r"""
() => {
  const R = LIGHT_BRIDGE, out = [], top = R.LEVELS.length - 1;
  R.reset(); const s = R.START_LEVEL;
  if (R.LEVELS[s].n !== 5) out.push('start should be the 5x5 level, got ' + R.LEVELS[s].n);
  if (R.LEVELS[0].n !== 4 || R.LEVELS[top].n !== 9) out.push('ladder should run 4x4 to 9x9');
  for (let k = 0; k < 3; k++) R.record(true);
  if (R.P.lv !== s) out.push('moved up after 3');
  R.record(true); if (R.P.lv !== s + 1) out.push('did not move up after 4');
  R.record(true); R.record(true); R.record(true); R.record(false); R.record(true);
  if (R.P.lv !== s + 1) out.push('a miss should break the streak');
  R.record(false); if (R.P.lv !== s + 1) out.push('moved down after 1 miss');
  R.record(false); if (R.P.lv !== s) out.push('did not move down after 2 misses');
  if (JSON.parse(localStorage.getItem('light-bridge-v1')).lv !== s) out.push('not saved');
  R.P.lv = 0; R.record(false); R.record(false); if (R.P.lv !== 0) out.push('went below 0');
  R.P.lv = top; for (let k = 0; k < 4; k++) R.record(true); if (R.P.lv !== top) out.push('went past top');
  R.reset();
  return out;
}
"""

def drag(pg, cells):
    pts = [pg.evaluate("(i) => LIGHT_BRIDGE.screenOf(i)", c) for c in cells]
    pg.mouse.move(pts[0]['x'], pts[0]['y']); pg.mouse.down()
    for a, b in zip(pts, pts[1:]):
        pg.mouse.move(b['x'], b['y'], steps=3)
    pg.mouse.up()

with sync_playwright() as p:
    b = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1440, 'height': 960})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.goto(APP); pg.wait_for_timeout(1200)
    pg.screenshot(path=str(SHOTS / 'light-bridge-start.png'))

    g = pg.evaluate(GEN, 60)
    print('boards made per level:', g['counts'])
    print('most solver steps per level:', g['nodes'])
    problems += g['problems'][:20]
    lad = pg.evaluate(LADDER); print('ladder problems:', lad); problems += lad

    pg.evaluate("LIGHT_BRIDGE.speed(6)")
    # Drag every bridge by hand on a small board; the last drag should win the board.
    for lv in (0, 2):
        pg.evaluate(f"LIGHT_BRIDGE.setLevel({lv})")
        st = pg.evaluate("LIGHT_BRIDGE.state()")
        before = st['solved']
        sol = st['puzzle']['solution']
        for c, path in enumerate(sol):
            drag(pg, path)
            if c == len(sol) - 2 and lv == 2: pg.screenshot(path=str(SHOTS / 'light-bridge-drawing.png'))
            if not pg.evaluate(f"LIGHT_BRIDGE.state().linked[{c}]"): problems.append(f'L{lv+1}: dragging bridge {c} did not link it')
        if pg.evaluate("LIGHT_BRIDGE.state().solved") != before + 1: problems.append(f'L{lv+1}: dragged answer did not win')
        if pg.evaluate("LIGHT_BRIDGE.P.st.streak") < 1: problems.append(f'L{lv+1}: win not recorded as right')
        pg.wait_for_function("(b) => !LIGHT_BRIDGE.state().solvedFlag", arg=0, timeout=20000)

    # Dragging into another color's orb is blocked, and drawing over a bridge cuts it.
    pg.evaluate("LIGHT_BRIDGE.setLevel(3)")
    st = pg.evaluate("LIGHT_BRIDGE.state()"); sol = st['puzzle']['solution']
    drag(pg, sol[0])
    if not pg.evaluate("LIGHT_BRIDGE.state().linked[0]"): problems.append('first bridge did not link')
    other = sol[1]
    pg.evaluate("(p) => LIGHT_BRIDGE.setPaths(LIGHT_BRIDGE.state().paths.map((q, c) => c === 1 ? p : q))", other)
    if pg.evaluate("LIGHT_BRIDGE.state().filled") != len(sol[0]) + len(other): problems.append('two bridges did not fill their squares')

    for i in range(len(pg.evaluate("LIGHT_BRIDGE.LEVELS"))):
        pg.evaluate(f"LIGHT_BRIDGE.setLevel({i})")
        st = pg.evaluate("LIGHT_BRIDGE.state()"); before = st['solved']; sol = st['puzzle']['solution']
        # Wrong: every bridge but the last one, and a last bridge one square short.
        part = [s for s in sol]; part = part[:-1] + [sol[-1][:-1]]
        pg.evaluate("(ps) => LIGHT_BRIDGE.setPaths(ps)", part)
        if pg.evaluate("LIGHT_BRIDGE.state().solved") != before: problems.append(f'L{i+1}: unfinished board won')
        if i in (5, 9): pg.screenshot(path=str(SHOTS / f'light-bridge-L{i+1}.png'))
        pg.evaluate("(ps) => LIGHT_BRIDGE.setPaths(ps)", sol)
        if pg.evaluate("LIGHT_BRIDGE.state().solved") != before + 1: problems.append(f'L{i+1}: full answer did not win')
        if i == 9: pg.wait_for_timeout(150); pg.screenshot(path=str(SHOTS / 'light-bridge-win.png'))
        pg.wait_for_function("() => !LIGHT_BRIDGE.state().solvedFlag", timeout=20000)

    # A hint lays one correct bridge and counts as a miss; a skip counts as a miss too.
    pg.evaluate("LIGHT_BRIDGE.reset(); LIGHT_BRIDGE.setLevel(4)")
    pg.click('#hint')
    st = pg.evaluate("LIGHT_BRIDGE.state()")
    if not st['missed'] or sum(st['linked']) != 1: problems.append('hint did not lay one bridge or count a miss')
    if pg.evaluate("LIGHT_BRIDGE.P.st.miss") != 1: problems.append('hint miss not recorded')
    # The same board counts once, so a skip after a hint is still one miss; a second missed board moves down.
    pg.click('#skip')
    if pg.evaluate("LIGHT_BRIDGE.P.lv") != 4 or pg.evaluate("LIGHT_BRIDGE.P.st.miss") != 1: problems.append('one board counted as two misses')
    pg.click('#skip')
    if pg.evaluate("LIGHT_BRIDGE.P.lv") != 3: problems.append('two missed boards in a row did not move down')
    b.close()

problems += [f'page error: {e}' for e in errors]
if problems:
    print('PROBLEMS:'); [print(' ', x) for x in problems]; sys.exit(1)
print('ALL OK')
