"""Checks Pattern Machine: the rules act as a mirror and turn group should, every level makes questions with exactly
one right choice many times, the level rule works, right taps win and wrong ones do not through the page (3D taps
and rule cards), and the page has no errors. Run: python3 tools/test-pattern-machine.py"""
import pathlib, sys
from playwright.sync_api import sync_playwright

APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'pattern-machine.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)
problems = []

RULES = r"""
() => {
  const R = PATTERN_MACHINE, out = [], s = { shape: 1, color: 0, rot: 1, flip: 0, size: 1 };
  const t = r => R.apply(s, r);
  if (!R.same(R.run(s, [{ t: 'turn' }, { t: 'turn' }, { t: 'turn' }, { t: 'turn' }]), s)) out.push('four quarter turns should come back');
  if (!R.same(R.run(s, [{ t: 'turn' }, { t: 'turn' }]), t({ t: 'half' }))) out.push('two quarter turns should be a half turn');
  if (!R.same(R.run(s, [{ t: 'flip' }, { t: 'flip' }]), s)) out.push('two flips should come back');
  // A flip then a quarter turn is the same as a quarter turn the other way then a flip.
  const a = R.run(s, [{ t: 'flip' }, { t: 'turn' }]), b = R.run(s, [{ t: 'turn' }, { t: 'turn' }, { t: 'turn' }, { t: 'flip' }]);
  if (!R.same(a, b)) out.push('flip and turn do not mix like mirrors');
  if (R.apply({ ...s, size: 2 }, { t: 'grow' }) !== null || R.apply({ ...s, size: 0 }, { t: 'shrink' }) !== null) out.push('size limits');
  if (R.apply(s, { t: 'paint', c: 0 }) !== null) out.push('painting the same color should not count');
  // The eight turns and flips of each shape all look different (no symmetry), checked on the blocks themselves.
  R.SHAPES.forEach((cells, k) => {
    const seen = new Set();
    for (let f = 0; f < 2; f++) for (let r = 0; r < 4; r++) {
      let pts = cells.map(([x, y]) => [f ? -x : x, y]);
      for (let i = 0; i < r; i++) pts = pts.map(([x, y]) => [y, -x]);
      const mx = Math.min(...pts.map(p => p[0])), my = Math.min(...pts.map(p => p[1]));
      seen.add(pts.map(([x, y]) => [x - mx, y - my].join()).sort().join(';'));
    }
    if (seen.size !== 8) out.push(`shape ${k} has symmetry (${seen.size} looks)`);
  });
  return out;
}
"""

GEN = r"""
(N) => {
  const R = PATTERN_MACHINE, out = { problems: [], counts: {}, kinds: {} };
  R.LEVELS.forEach((L, i) => {
    const tag = `L${i + 1} ${L.name}`; out.counts[tag] = 0; const types = new Set();
    for (let k = 0; k < N; k++) {
      let q; try { q = R.generate(i); } catch (e) { out.problems.push(`${tag}: threw ${e.message}`); break; }
      out.counts[tag]++;
      const c = R.checkQuestion(q);
      if (!c.ok) out.problems.push(`${tag}: ${c.why.join(', ')}`);
      if (q.choices.length !== L.choices) out.problems.push(`${tag}: ${q.choices.length} choices`);
      if (q.kind !== L.kind) out.problems.push(`${tag}: kind ${q.kind}`);
      if (q.rows[0].rules.length !== L.chain) out.problems.push(`${tag}: chain ${q.rows[0].rules.length}`);
      q.rows.forEach(r => r.rules.forEach(x => { types.add(x.t); if (!L.rules.includes(x.t)) out.problems.push(`${tag}: rule ${x.t} not on this level`); }));
      if (!L.turned && q.rows.some(r => r.input.rot || r.input.flip)) out.problems.push(`${tag}: young level starts turned`);
      if (q.kind === 'infer' && q.rows.length !== 2) out.problems.push(`${tag}: infer needs 2 examples`);
    }
    out.kinds[tag] = [...types].sort().join(' ');
  });
  return out;
}
"""

LADDER = r"""
() => {
  const R = PATTERN_MACHINE, out = [], top = R.LEVELS.length - 1;
  R.reset(); const s = R.START_LEVEL;
  if (s < 1 || s > 3) out.push('start level ' + s);
  for (let k = 0; k < 3; k++) R.record(true);
  if (R.P.lv !== s) out.push('moved up after 3');
  R.record(true); if (R.P.lv !== s + 1) out.push('did not move up after 4');
  R.record(true); R.record(true); R.record(true); R.record(false); R.record(true);
  if (R.P.lv !== s + 1) out.push('a miss should break the streak');
  R.record(false); if (R.P.lv !== s + 1) out.push('moved down after 1 miss');
  R.record(false); if (R.P.lv !== s) out.push('did not move down after 2 misses');
  if (JSON.parse(localStorage.getItem('pattern-machine-v1')).lv !== s) out.push('not saved');
  R.P.lv = 0; R.record(false); R.record(false); if (R.P.lv !== 0) out.push('went below 0');
  R.P.lv = top; for (let k = 0; k < 4; k++) R.record(true); if (R.P.lv !== top) out.push('went past top');
  R.reset();
  return out;
}
"""

def tap_choice(pg, i):
    q = pg.evaluate("PATTERN_MACHINE.state().question")
    if q['kind'] == 'predict':
        pt = pg.evaluate("(i) => PATTERN_MACHINE.pedestalScreen(i)", i)
        pg.mouse.click(pt['x'], pt['y'])
    else:
        pg.click(f"#choices button >> nth={i}")

with sync_playwright() as p:
    b = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1440, 'height': 960})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.goto(APP); pg.wait_for_timeout(1200)
    pg.screenshot(path=str(SHOTS / 'pattern-machine-start.png'))

    r = pg.evaluate(RULES); print('rule problems:', r); problems += r
    g = pg.evaluate(GEN, 400)
    print('questions made per level:', g['counts'])
    print('rules seen per level:', g['kinds'])
    problems += g['problems'][:20]
    lad = pg.evaluate(LADDER); print('ladder problems:', lad); problems += lad

    pg.evaluate("PATTERN_MACHINE.speed(5)")
    for i in range(len(pg.evaluate("PATTERN_MACHINE.LEVELS"))):
        pg.evaluate(f"PATTERN_MACHINE.setLevel({i})"); pg.wait_for_timeout(200)
        st = pg.evaluate("PATTERN_MACHINE.state()"); q = st['question']; before = st['solved']
        wrong = (q['answer'] + 1) % len(q['choices'])
        tap_choice(pg, wrong); pg.wait_for_timeout(150)
        st = pg.evaluate("PATTERN_MACHINE.state()")
        if st['solved'] != before: problems.append(f'L{i+1}: wrong choice won')
        if not st['missed'] or wrong not in st['tried']: problems.append(f'L{i+1}: wrong tap not counted (tried {st["tried"]})')
        if i in (3, 8): pg.screenshot(path=str(SHOTS / f'pattern-machine-L{i+1}-wrong.png'))
        tap_choice(pg, q['answer'])
        if i == 6: pg.wait_for_timeout(500); pg.screenshot(path=str(SHOTS / 'pattern-machine-reveal.png'))
        pg.wait_for_function("(b) => PATTERN_MACHINE.state().solved > b", arg=before, timeout=20000)
        pg.wait_for_function("() => !PATTERN_MACHINE.state().busy", timeout=30000)

    # Four first-try answers move up a level through the page.
    pg.evaluate("PATTERN_MACHINE.reset(); PATTERN_MACHINE.setLevel(2)")
    for k in range(4):
        q = pg.evaluate("PATTERN_MACHINE.state().question"); before = pg.evaluate("PATTERN_MACHINE.state().solved")
        tap_choice(pg, q['answer'])
        pg.wait_for_function("(b) => PATTERN_MACHINE.state().solved > b && !PATTERN_MACHINE.state().busy", arg=before, timeout=30000)
    if pg.evaluate("PATTERN_MACHINE.P.lv") != 3: problems.append('four right through the page did not move up')
    if pg.evaluate("PATTERN_MACHINE.state().question.kind") != 'infer': problems.append('level 4 should ask for the rule')
    pg.screenshot(path=str(SHOTS / 'pattern-machine-L4.png'))
    b.close()

problems += [f'page error: {e}' for e in errors]
if problems:
    print('PROBLEMS:'); [print(' ', x) for x in problems]; sys.exit(1)
print('ALL OK')
