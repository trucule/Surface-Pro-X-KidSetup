"""Checks Number Line Rocket: every level makes sound targets, closeness scoring and the level rule work, and the
rocket can be sent to right and wrong spots by tapping the line and pressing Launch through the page.
Run: python3 tools/test-number-line-rocket.py"""
import pathlib, sys
from playwright.sync_api import sync_playwright

APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'number-line-rocket.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)

GEN = r"""
(N) => {
  const H = NUMBER_LINE_ROCKET, out = { problems: [], kinds: {} }, near = (a, b) => Math.abs(a - b) < 1e-9;
  H.LEVELS.forEach((lv, i) => {
    const tag = `L${i + 1} ${lv.name}`;
    for (let k = 0; k < N; k++) {
      let t; try { t = lv.gen(); } catch (e) { out.problems.push(`${tag}: threw ${e.message}`); break; }
      out.kinds[tag] = `${t.kind} ${t.min} to ${t.max}${t.estimate ? ' estimate' : ''}${t.d ? ' fractions' : ''}`;
      const w = `${tag}: ${JSON.stringify(t)}`;
      if (!(t.value > t.min && t.value < t.max)) out.problems.push(`${w}: value not inside the line`);
      if (!t.estimate && !near(Math.round((t.value - t.min) / t.snap) * t.snap + t.min, t.value)) out.problems.push(`${w}: value is not on a mark`);
      if (t.estimate !== (t.snap === 0)) out.problems.push(`${w}: estimate flag`);
      if (t.d && (!near(t.n / t.d, t.value) || t.text !== `${t.n}/${t.d}`)) out.problems.push(`${w}: fraction`);
      if (!t.d && t.text !== String(t.value)) out.problems.push(`${w}: text`);
      if (!Number.isFinite(t.tick) || t.tick <= 0 || (t.max - t.min) / t.tick > 40) out.problems.push(`${w}: ticks`);
      if (t.kind === 'read') {
        if (!t.choices.includes(t.value) || new Set(t.choices).size !== t.choices.length || t.choices.length < 3 || t.choices.some(c => c <= t.min || c >= t.max)) out.problems.push(`${w}: choices`);
      }
      // A guess right on the value is a bullseye; a guess across the line is not right.
      const s0 = H.score(t, t.value), far = t.value - t.min > (t.max - t.min) / 2 ? t.min : t.max, s1 = H.score(t, far);
      if (s0.stars !== 3 || !s0.right || s1.right) out.problems.push(`${w}: scoring`);
    }
  });
  // Closeness bands for an estimate on 0 to 100.
  const t = { min: 0, max: 100, value: 40, estimate: true, snap: 0 };
  const bands = [[41, 3], [42, 3], [44, 2], [45, 2], [48, 1], [50, 1], [55, 0], [10, 0]];
  for (const [g, st] of bands) { const s = H.score(t, g); if (s.stars !== st || s.right !== st >= 2) out.problems.push(`estimate 40, guess ${g}: ${s.stars} stars`); }
  const e = { min: 0, max: 20, value: 7, estimate: false, snap: 1 };
  if (H.score(e, 8).stars !== 1 || H.score(e, 8).right || H.score(e, 10).stars !== 0) out.problems.push('tick scoring');
  return out;
}
"""

LADDER = r"""
() => {
  const H = NUMBER_LINE_ROCKET, P = H.state(), n = H.LEVELS.length, out = [];
  P.lv = 3; P.streak = 0; P.miss = 0;
  [true, true, true].forEach(r => H.record(r)); if (P.lv !== 3) out.push('moved up before 4');
  if (H.record(true) !== 1 || P.lv !== 4) out.push('did not move up after 4 right');
  H.record(false); if (P.lv !== 4) out.push('moved down after 1 miss');
  if (H.record(false) !== -1 || P.lv !== 3) out.push('did not move down after 2 misses');
  P.lv = n - 1; P.streak = 0; for (let i = 0; i < 4; i++) H.record(true); if (P.lv !== n - 1) out.push('went past the top');
  P.lv = 0; P.miss = 0; H.record(false); H.record(false); if (P.lv !== 0) out.push('went below the bottom');
  const saved = JSON.parse(localStorage.getItem('number-line-rocket-v1')); if (!saved || saved.lv !== 0) out.push('not saved');
  return out;
}
"""

def tap(pg, p): pg.mouse.click(p['x'], p['y']); pg.wait_for_timeout(60)
def button(pg, sel):
    box = pg.evaluate(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return {{ x: r.x + r.width / 2, y: r.y + r.height / 2 }}; }})()"); tap(pg, box)

def fly(pg, value):
    tap(pg, pg.evaluate(f'NUMBER_LINE_ROCKET.screenOfValue({value})'))
    got = pg.evaluate('NUMBER_LINE_ROCKET.picked()')
    button(pg, '#launchBtn')
    pg.wait_for_function('NUMBER_LINE_ROCKET.current().result !== undefined', timeout=60000)
    return got

def main():
    problems = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = b.new_page(viewport={'width': 1200, 'height': 800}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(APP); pg.wait_for_timeout(800)
        pg.evaluate('NUMBER_LINE_ROCKET.hold(true)')  # keep each finished question on screen for checks and screenshots
        g = pg.evaluate(GEN, 400); problems += g['problems'][:20]
        print('levels:', len(g['kinds'])); [print(' ', k, '->', v) for k, v in g['kinds'].items()]
        problems += pg.evaluate(LADDER)
        for i in range(len(g['kinds'])):
            t = pg.evaluate(f'NUMBER_LINE_ROCKET.setLevel({i})'); pg.wait_for_timeout(300)
            if t['kind'] == 'read':
                pg.wait_for_function("document.querySelectorAll('#dock .choice').length > 0", timeout=60000)
                wrong = next(c for c in t['choices'] if c != t['value'])
                button(pg, f'#dock .choice[data-v="{wrong}"]')
                if pg.evaluate('NUMBER_LINE_ROCKET.current().done'): problems.append(f'L{i+1}: a wrong reading won')
                button(pg, f'#dock .choice[data-v="{t["value"]}"]')
                if not pg.evaluate('NUMBER_LINE_ROCKET.current().done'): problems.append(f'L{i+1}: the right reading did not win')
                pg.wait_for_timeout(500); pg.screenshot(path=str(SHOTS / f'number-line-rocket-L{i+1}.png'))
                continue
            # Wrong: fly to the far end of the line.
            stars = pg.evaluate('NUMBER_LINE_ROCKET.state().stars')
            far = t['min'] if t['value'] - t['min'] > (t['max'] - t['min']) / 2 else t['max']
            fly(pg, far); r = pg.evaluate('NUMBER_LINE_ROCKET.current().result')
            if r['right'] or pg.evaluate('NUMBER_LINE_ROCKET.state().stars') != stars: problems.append(f'L{i+1}: a far guess won')
            # Right: tap the target's spot.
            t = pg.evaluate(f'NUMBER_LINE_ROCKET.setLevel({i})'); pg.wait_for_timeout(300)
            got = fly(pg, t['value']); r = pg.evaluate('NUMBER_LINE_ROCKET.current().result')
            if not t['estimate'] and abs(got - t['value']) > 1e-9: problems.append(f'L{i+1}: tapping {t["value"]} picked {got}')
            if not r['right'] or not pg.evaluate('NUMBER_LINE_ROCKET.current().done'): problems.append(f'L{i+1}: flying to {t["value"]} did not win ({r})')
            pg.wait_for_timeout(500); pg.screenshot(path=str(SHOTS / f'number-line-rocket-L{i+1}.png'))
        # On a tick level a near miss gets another try with the same number.
        t = pg.evaluate('NUMBER_LINE_ROCKET.setLevel(2)'); pg.wait_for_timeout(300)
        fly(pg, t['value'] + 1 if t['value'] < 20 else t['value'] - 1)
        pg.wait_for_function('NUMBER_LINE_ROCKET.flying() === false && !document.getElementById("launchBtn").disabled', timeout=60000)
        if pg.evaluate('NUMBER_LINE_ROCKET.current().value') != t['value']: problems.append('a near miss on a tick level did not give another try')
        pg.screenshot(path=str(SHOTS / 'number-line-rocket-retry.png'))
        problems += [f'page error: {e}' for e in errs]
        b.close()
    print('\n'.join(problems) if problems else 'ALL OK')
    sys.exit(1 if problems else 0)

main()
