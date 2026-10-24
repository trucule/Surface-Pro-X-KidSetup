"""Checks Fraction Pizza Kitchen: every level makes sound orders, the level rule works, and every kind of order can
be answered right and wrong through the page. Run: python3 tools/test-fraction-pizza.py"""
import pathlib, sys
from playwright.sync_api import sync_playwright

APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'fraction-pizza.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)

GEN = r"""
(N) => {
  const H = FRACTION_PIZZA, out = { problems: [], kinds: {} }, eq = (a, b) => Math.abs(a - b) < 1e-9;
  const val = s => { const [n, d] = s.split('/').map(Number); return n / d; };
  const DEN = [2, 3, 4, 6, 8, 12];
  H.LEVELS.forEach((lv, i) => {
    const tag = `L${i + 1} ${lv.name}`;
    for (let k = 0; k < N; k++) {
      let t; try { t = lv.gen(); } catch (e) { out.problems.push(`${tag}: threw ${e.message}`); break; }
      out.kinds[tag] = t.kind; const w = `${tag}: ${JSON.stringify(t)}`;
      if (t.kind === 'cut') { if (![2, 3, 4].includes(t.d) || t.answer !== t.d) out.problems.push(w); }
      else if (t.kind === 'serve') {
        if (!DEN.includes(t.cut) || t.cut % t.d) out.problems.push(`${w}: cut`);
        if (!Number.isInteger(t.answer) || t.answer < 1 || t.answer > t.cut) out.problems.push(`${w}: answer`);
        if (!eq(t.answer / t.cut, t.n / t.d)) out.problems.push(`${w}: slices do not match order`);
        if (t.add) { const s = t.add[0][0] / t.add[0][1] + t.add[1][0] / t.add[1][1]; if (!eq(s, t.n / t.d) || t.add.some(f => f[0] < 1)) out.problems.push(`${w}: sum`); }
      } else if (t.kind === 'name' || t.kind === 'twin') {
        const strs = t.choices.map(c => c.join('/'));
        if (new Set(strs).size !== strs.length || strs.length < 3) out.problems.push(`${w}: choices`);
        if (strs.filter(s => s === t.answer).length !== 1) out.problems.push(`${w}: answer not a choice`);
        if (strs.filter(s => eq(val(s), t.n / t.d)).length !== 1) out.problems.push(`${w}: not exactly one choice with the right value`);
        if (!eq(val(t.answer), t.n / t.d)) out.problems.push(`${w}: answer value`);
        if (t.kind === 'twin' && t.answer === `${t.n}/${t.d}`) out.problems.push(`${w}: twin is the same fraction`);
      } else if (t.kind === 'line') { if (t.n < 1 || t.n / t.d > t.max || t.answer !== t.n) out.problems.push(w); }
      else if (t.kind === 'compare') {
        const [A, B] = t.pair, a = A[0] / A[1], b = B[0] / B[1];
        if (eq(a, b) || t.answer !== (a > b ? 0 : 1) || A[0] < 1 || B[0] < 1) out.problems.push(w);
      } else out.problems.push(`${w}: unknown kind`);
    }
  });
  return out;
}
"""

LADDER = r"""
() => {
  const H = FRACTION_PIZZA, P = H.state(), n = H.LEVELS.length, out = [];
  P.lv = 3; P.streak = 0; P.miss = 0;
  [true, true, true].forEach(r => H.record(r)); if (P.lv !== 3) out.push('moved up before 4');
  if (H.record(true) !== 1 || P.lv !== 4) out.push('did not move up after 4 right');
  H.record(false); if (P.lv !== 4) out.push('moved down after 1 miss');
  if (H.record(false) !== -1 || P.lv !== 3) out.push('did not move down after 2 misses');
  H.record(true); H.record(false); H.record(true); H.record(false); if (P.lv !== 3) out.push('mixed answers moved the level');
  P.lv = n - 1; P.streak = 0; for (let i = 0; i < 4; i++) H.record(true); if (P.lv !== n - 1) out.push('went past the top');
  P.lv = 0; P.miss = 0; H.record(false); H.record(false); if (P.lv !== 0) out.push('went below the bottom');
  const saved = JSON.parse(localStorage.getItem('fraction-pizza-v1')); if (!saved || saved.lv !== 0) out.push('not saved');
  return out;
}
"""

def button(pg, sel):
    """Taps a button by its spot on screen (a plain finger tap, no waiting on animations)."""
    box = pg.evaluate(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return {{ x: r.x + r.width / 2, y: r.y + r.height / 2 }}; }})()")
    pg.mouse.click(box['x'], box['y'])

def solve(pg, right):
    """Answers the current order through the page: taps slices, buttons, ticks or plates like she would."""
    t = pg.evaluate('FRACTION_PIZZA.current()'); k = t['kind']
    tg = pg.evaluate('FRACTION_PIZZA.targets()')
    if k == 'cut':
        want = t['d'] if right else t['d'] + 1
        for _ in range(want - 1): button(pg, '#cutBtn')
        button(pg, '#doneBtn')
    elif k == 'serve':
        want = t['answer'] if right else (t['answer'] + 1 if t['answer'] < t['cut'] else t['answer'] - 1)
        for s in tg['slices'][:want]: pg.mouse.click(s['x'], s['y'])
        got = pg.evaluate('FRACTION_PIZZA.servedCount()')
        if got != want: return f'tapped {want} slices, {got} served'
        button(pg, '#serveBtn')
    elif k in ('name', 'twin'):
        vals = [b.get_attribute('data-v') for b in pg.query_selector_all('#dock .choice')]
        v = t['answer'] if right else next(x for x in vals if x != t['answer'])
        button(pg, f'#dock .choice[data-v="{v}"]')
    elif k == 'line':
        i = t['answer'] if right else (t['answer'] + 1)
        p = tg['ticks'][i]; pg.mouse.click(p['x'], p['y'])
        # The flag flies to the tick first; the answer counts when it lands.
        pg.wait_for_function('FRACTION_PIZZA.current().tries > 0 || FRACTION_PIZZA.current().done', timeout=30000)
    elif k == 'compare':
        i = t['answer'] if right else 1 - t['answer']
        p = tg['pies'][i]; pg.mouse.click(p['x'], p['y'])
    pg.wait_for_timeout(120)
    return None

def main():
    problems = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = b.new_page(viewport={'width': 1200, 'height': 800}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(APP); pg.wait_for_timeout(800)
        pg.evaluate('FRACTION_PIZZA.hold(true)')  # keep each finished question on screen for checks and screenshots
        g = pg.evaluate(GEN, 400); problems += g['problems'][:20]
        print('levels:', len(g['kinds'])); [print(' ', k, '->', v) for k, v in g['kinds'].items()]
        problems += pg.evaluate(LADDER)
        n = len(g['kinds'])
        for i in range(n):
            for trial in range(2 if i in (1, 4, 7) else 1):
                pg.evaluate(f'FRACTION_PIZZA.setLevel({i})'); pg.wait_for_timeout(250)
                e = solve(pg, False)
                t = pg.evaluate('FRACTION_PIZZA.current()')
                if e: problems.append(f'L{i+1} wrong: {e}')
                if t['done'] and pg.evaluate('FRACTION_PIZZA.state().lv') == i: problems.append(f'L{i+1}: a wrong answer won ({t["kind"]})')
                pg.evaluate(f'FRACTION_PIZZA.setLevel({i})'); pg.wait_for_timeout(250)
                e = solve(pg, True)
                t = pg.evaluate('FRACTION_PIZZA.current()')
                if e: problems.append(f'L{i+1} right: {e}')
                if not t['done']: problems.append(f'L{i+1}: a right answer did not win ({t["kind"]} {t})')
                if trial == 0:
                    pg.wait_for_timeout(500); pg.screenshot(path=str(SHOTS / f'fraction-pizza-L{i+1}.png'))
        # A full climb through the page: four right first try moves her up one level.
        pg.evaluate('FRACTION_PIZZA.hold(false)'); pg.evaluate('FRACTION_PIZZA.setLevel(1)')
        for _ in range(4):
            pg.wait_for_timeout(200); solve(pg, True); pg.wait_for_function('FRACTION_PIZZA.current().done === false', timeout=20000)
        if pg.evaluate('FRACTION_PIZZA.state().lv') != 2: problems.append('four right through the page did not level up')
        pg.screenshot(path=str(SHOTS / 'fraction-pizza-levelup.png'))
        problems += [f'page error: {e}' for e in errs]
        b.close()
    print('\n'.join(problems) if problems else 'ALL OK')
    sys.exit(1 if problems else 0)

main()
