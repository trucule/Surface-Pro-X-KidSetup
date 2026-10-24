"""Checks Tangram City: every puzzle has a known solution that fills its target exactly with the pieces it hands
out, the level rule works, puzzles are solved by dragging, turning and flipping pieces through the page, wrong
fillings do not win, and the counting levels take right and wrong answers. Run: python3 tools/test-tangram-city.py"""
import pathlib, sys
from playwright.sync_api import sync_playwright

APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'tangram-city.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)

GEN = r"""
(N) => {
  const H = TANGRAM_CITY, out = { problems: [], kinds: {} };
  const check = (tag, t) => {
    const w = `${tag}: ${JSON.stringify(t).slice(0, 200)}`;
    if (t.kind === 'build') {
      const seen = new Set(); let overlap = false;
      for (const p of t.sol) { if (!H.ORIENTS[p.t].some(([r, f]) => H.shapeKey({ t: p.t, rot: r, flip: f }) === H.shapeKey(p))) out.problems.push(`${w}: bad pose`); for (const c of H.cellsOf(p)) { if (seen.has(c)) overlap = true; seen.add(c); } }
      if (overlap) out.problems.push(`${w}: solution pieces overlap`);
      const tgt = new Set(t.target); if (tgt.size !== seen.size || [...seen].some(c => !tgt.has(c))) out.problems.push(`${w}: solution does not fill the target exactly`);
      if (t.pieces.slice().sort().join() !== t.sol.map(p => p.t).sort().join()) out.problems.push(`${w}: pieces handed out do not match the solution`);
      const pool = H.SET.slice(); for (const p of t.pieces) { const i = pool.indexOf(p); if (i < 0) out.problems.push(`${w}: more pieces than one tangram set`); else pool.splice(i, 1); }
      // The target must be one connected shape (quarter triangles sharing edges).
      const keys = [...tgt], nb = k => { const [i, j, q] = k.split(',').map(Number); return [[i, j, (q + 1) % 4], [i, j, (q + 3) % 4], q === 0 ? [i, j - 1, 2] : q === 1 ? [i + 1, j, 3] : q === 2 ? [i, j + 1, 0] : [i - 1, j, 1]].map(a => a.join(',')); };
      const reach = new Set([keys[0]]), stack = [keys[0]]; while (stack.length) for (const n of nb(stack.pop())) if (tgt.has(n) && !reach.has(n)) { reach.add(n); stack.push(n); }
      if (reach.size !== tgt.size) out.problems.push(`${w}: target is in pieces`);
      if (t.mirror) {
        const given = new Set(t.given.flatMap(H.cellsOf)), mir = [...given].map(k => { const [i, j, q] = k.split(',').map(Number); return `${-1 - i},${j},${q === 1 ? 3 : q === 3 ? 1 : q}`; });
        if (mir.length !== tgt.size || mir.some(k => !tgt.has(k))) out.problems.push(`${w}: target is not the mirror of the given half`);
        if ([...tgt].some(k => +k.split(',')[0] < 0)) out.problems.push(`${w}: target crosses the mirror line`);
      }
    } else if (t.kind === 'count') {
      const s = new Set(t.sq.map(p => p.join(',')));
      if (s.size !== t.sq.length) out.problems.push(`${w}: repeated squares`);
      const want = t.ask === 'area' ? t.sq.length + t.halves.length / 2 : H.perimeterOf(t.sq);
      if (want !== t.answer || !Number.isInteger(t.answer)) out.problems.push(`${w}: answer ${t.answer} should be ${want}`);
      if (!t.choices.includes(t.answer) || new Set(t.choices).size !== t.choices.length || t.choices.some(c => c < 1)) out.problems.push(`${w}: choices`);
      for (const h of t.halves) if (s.has(`${h.x},${h.y}`)) out.problems.push(`${w}: half square on top of a square`);
      if (t.rect && t.sq.length !== t.rect[0] * t.rect[1]) out.problems.push(`${w}: rectangle`);
    } else out.problems.push(`${w}: unknown kind`);
  };
  H.LEVELS.forEach((lv, i) => { const tag = `L${i + 1} ${lv.name}`; for (let k = 0; k < N; k++) { let t; try { t = lv.gen(); } catch (e) { out.problems.push(`${tag}: threw ${e.message}`); break; } out.kinds[tag] = t.kind + (t.mirror ? ' mirror' : '') + (t.lines ? ' lines' : ''); check(tag, t); } });
  for (const [name, sol] of Object.entries(H.FIGURES)) { const s = sol.map(([t, rot, flip, x, y]) => ({ t, rot, flip, x, y })); const tgt = new Set(s.flatMap(H.cellsOf)); if (tgt.size !== 32) out.problems.push(`figure ${name}: covers ${tgt.size} quarter triangles, not 32`); }
  return out;
}
"""

LADDER = r"""
() => {
  const H = TANGRAM_CITY, P = H.state(), n = H.LEVELS.length, out = [];
  P.lv = 3; P.streak = 0; P.miss = 0;
  [true, true, true].forEach(r => H.record(r)); if (P.lv !== 3) out.push('moved up before 4');
  if (H.record(true) !== 1 || P.lv !== 4) out.push('did not move up after 4 right');
  H.record(false); if (P.lv !== 4) out.push('moved down after 1 miss');
  if (H.record(false) !== -1 || P.lv !== 3) out.push('did not move down after 2 misses');
  P.lv = n - 1; P.streak = 0; for (let i = 0; i < 4; i++) H.record(true); if (P.lv !== n - 1) out.push('went past the top');
  P.lv = 0; P.miss = 0; H.record(false); H.record(false); if (P.lv !== 0) out.push('went below the bottom');
  const saved = JSON.parse(localStorage.getItem('tangram-city-v1')); if (!saved || saved.lv !== 0) out.push('not saved');
  return out;
}
"""

FRAMES = 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'
def settle(pg): pg.wait_for_function('TANGRAM_CITY.idle()', timeout=60000)
def tap(pg, p): pg.mouse.click(p['x'], p['y']); pg.evaluate(FRAMES); settle(pg)
def drag(pg, a, b):
    # Moves are delivered with animation frames, so wait for frames before lifting the finger.
    pg.mouse.move(a['x'], a['y']); pg.mouse.down()
    for k in range(1, 4): pg.mouse.move(a['x'] + (b['x'] - a['x']) * k / 3, a['y'] + (b['y'] - a['y']) * k / 3); pg.evaluate(FRAMES)
    pg.mouse.up(); pg.evaluate(FRAMES); settle(pg)
def button(pg, sel):
    box = pg.evaluate(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return {{ x: r.x + r.width / 2, y: r.y + r.height / 2 }}; }})()"); tap(pg, box)

def build(pg, right):
    """Turns, flips and drags each tray piece into a solution spot, the way she would with a finger.
    For a wrong try the last piece goes one square to the side of its spot."""
    t = pg.evaluate('TANGRAM_CITY.current()'); sol = t['sol']; used = set()
    count = len(pg.evaluate('TANGRAM_CITY.pieces()'))
    for idx in range(count):
        pc = pg.evaluate('TANGRAM_CITY.pieces()')[idx]
        j = next(k for k, s in enumerate(sol) if s['t'] == pc['t'] and k not in used); used.add(j); s = dict(sol[j])
        want = pg.evaluate('(s) => TANGRAM_CITY.shapeKey(s)', s)
        for flip in (0, 1):
            for _ in range(4):
                if pg.evaluate('TANGRAM_CITY.pieces()')[idx]['key'] == want: break
                tap(pg, pg.evaluate('TANGRAM_CITY.pieces()')[idx]['screen'])
            if pg.evaluate('TANGRAM_CITY.pieces()')[idx]['key'] == want: break
            button(pg, '#flipBtn')  # flips the piece touched last, which is this one
        pc = pg.evaluate('TANGRAM_CITY.pieces()')[idx]
        if pc['key'] != want: return f'could not turn {pc["t"]} to fit'
        if not right and idx == count - 1: s['x'] += 1
        drag(pg, pc['screen'], pg.evaluate('(s) => TANGRAM_CITY.spot(s)', s))
    settle(pg)
    return None

def main():
    problems = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = b.new_page(viewport={'width': 1200, 'height': 800}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(APP); pg.wait_for_timeout(800)
        pg.evaluate('TANGRAM_CITY.hold(true)')  # keep each finished question on screen for checks and screenshots
        g = pg.evaluate(GEN, 150); problems += g['problems'][:20]
        print('levels:', len(g['kinds'])); [print(' ', k, '->', v) for k, v in g['kinds'].items()]
        problems += pg.evaluate(LADDER)
        n = len(g['kinds'])
        for i in range(n):
            kind = pg.evaluate(f'TANGRAM_CITY.setLevel({i}).kind'); pg.wait_for_timeout(300)
            if kind == 'build':
                e = build(pg, False)
                st = pg.evaluate('TANGRAM_CITY.current()')
                if e: problems.append(f'L{i+1} wrong: {e}')
                if st['done'] or pg.evaluate('TANGRAM_CITY.solved()'): problems.append(f'L{i+1}: a wrong filling won')
                pg.evaluate(f'TANGRAM_CITY.setLevel({i})'); pg.wait_for_timeout(300)
                e = build(pg, True)
                st = pg.evaluate('TANGRAM_CITY.current()')
                if e: problems.append(f'L{i+1} right: {e}')
                if not st['done']: problems.append(f'L{i+1}: the solution did not win ({st.get("title")})')
                pg.wait_for_timeout(400); pg.screenshot(path=str(SHOTS / f'tangram-city-L{i+1}.png'))
            else:
                t = pg.evaluate('TANGRAM_CITY.current()')
                wrong = next(c for c in t['choices'] if c != t['answer'])
                button(pg, f'#dock .choice[data-v="{wrong}"]')
                if pg.evaluate('TANGRAM_CITY.current().done'): problems.append(f'L{i+1}: a wrong count won')
                button(pg, f'#dock .choice[data-v="{t["answer"]}"]')
                if not pg.evaluate('TANGRAM_CITY.current().done'): problems.append(f'L{i+1}: the right count did not win')
                pg.wait_for_timeout(1100); pg.screenshot(path=str(SHOTS / f'tangram-city-L{i+1}.png'))
        # A hint counts as a miss and moves one piece into place.
        pg.evaluate('TANGRAM_CITY.setLevel(2)'); pg.wait_for_timeout(300)
        before = pg.evaluate('TANGRAM_CITY.state().miss'); button(pg, '#hintBtn'); pg.wait_for_timeout(500)
        if pg.evaluate('TANGRAM_CITY.state().miss') != before + 1: problems.append('a hint did not count as a miss')
        placed = pg.evaluate("""() => { const t = TANGRAM_CITY.current(), tg = new Set(t.target); return TANGRAM_CITY.pieces().filter(p => TANGRAM_CITY.cellsOf(p.pose).every(c => tg.has(c))).length; }""")
        if placed < 1: problems.append('a hint did not place a piece')
        pg.screenshot(path=str(SHOTS / 'tangram-city-hint.png'))
        problems += [f'page error: {e}' for e in errs]
        b.close()
    print('\n'.join(problems) if problems else 'ALL OK')
    sys.exit(1 if problems else 0)

main()
