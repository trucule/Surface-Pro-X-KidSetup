"""Checks Robot Path: every level makes boards that pass their checks many times, the level rule works, right
programs win and wrong ones do not through the page, cards entered by tapping work, and the page has no errors.
Run: python3 tools/test-robot-path.py"""
import pathlib, sys
from playwright.sync_api import sync_playwright

APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'robot-path.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)
problems = []

GEN = r"""
(N) => {
  const R = ROBOT_PATH, out = { problems: [], counts: {} };
  R.LEVELS.forEach((L, i) => {
    const tag = `L${i + 1} ${L.name}`; out.counts[tag] = 0;
    for (let k = 0; k < N; k++) {
      let p; try { p = R.generate(i); } catch (e) { out.problems.push(`${tag}: threw ${e.message}`); break; }
      out.counts[tag]++;
      const c = R.check(p), r = R.simulate(p, p.intended);
      if (!c.ok) out.problems.push(`${tag}: ${c.why.join(', ')}`);
      if (!r.win) out.problems.push(`${tag}: planned program does not win`);
      if (p.w !== L.w || p.h !== L.h) out.problems.push(`${tag}: size`);
      if (L.kind === 'loop' && !(p.limit && c.fewest > p.limit)) out.problems.push(`${tag}: loop limit not needed`);
      if (L.kind === 'if' && (!p.pink.size || !JSON.stringify(p.intended).includes('"if"'))) out.problems.push(`${tag}: no pink or no If`);
      if (L.kind === 'fewest' && p.moveLimit !== c.fewest) out.problems.push(`${tag}: move limit ${p.moveLimit} vs ${c.fewest}`);
      if (L.kind === 'arrows' && p.gems.length !== Math.min(L.gems, p.intended.length)) out.problems.push(`${tag}: gem count`);
      // A program one move short of the plan never wins.
      if (L.kind === 'arrows' || L.kind === 'fewest') { if (R.simulate(p, p.intended.slice(0, -1)).win) out.problems.push(`${tag}: short program wins`); }
    }
  });
  return out;
}
"""

LADDER = r"""
() => {
  const R = ROBOT_PATH, out = [], top = R.LEVELS.length - 1;
  R.reset(); const s = R.START_LEVEL;
  if (s < 1 || s > 3) out.push('start level should be about 2nd grade, got ' + s);
  for (let k = 0; k < 3; k++) R.record(true);
  if (R.P.lv !== s) out.push('moved up after 3');
  R.record(true); if (R.P.lv !== s + 1) out.push('did not move up after 4 right');
  R.record(true); R.record(true); R.record(true); R.record(false); R.record(true);
  if (R.P.lv !== s + 1) out.push('a miss should break the streak');
  R.record(false); if (R.P.lv !== s + 1) out.push('moved down after 1 miss');
  R.record(false); if (R.P.lv !== s) out.push('did not move down after 2 misses');
  const saved = JSON.parse(localStorage.getItem('robot-path-v1')); if (saved.lv !== s) out.push('not saved');
  R.P.lv = 0; R.record(false); R.record(false); if (R.P.lv !== 0) out.push('went below 0');
  R.P.lv = top; for (let k = 0; k < 4; k++) R.record(true); if (R.P.lv !== top) out.push('went past top');
  R.reset();
  return out;
}
"""

def wait_result(pg, before):
    pg.wait_for_function("(b) => ROBOT_PATH.state().solved > b || ['crash','miss'].includes(ROBOT_PATH.state().result)", arg=before, timeout=60000)
    st = pg.evaluate("ROBOT_PATH.state()")
    pg.wait_for_function("() => !ROBOT_PATH.state().running", timeout=60000)
    return st

with sync_playwright() as p:
    b = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1440, 'height': 960})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.goto(APP); pg.wait_for_timeout(1200)
    pg.screenshot(path=str(SHOTS / 'robot-path-start.png'))

    g = pg.evaluate(GEN, 150)
    print('boards made per level:', g['counts'])
    problems += g['problems'][:20]
    lad = pg.evaluate(LADDER); print('ladder problems:', lad); problems += lad

    pg.evaluate("ROBOT_PATH.speed(8)")
    for i in range(len(pg.evaluate("ROBOT_PATH.LEVELS"))):
        pg.evaluate(f"ROBOT_PATH.setLevel({i})")
        st = pg.evaluate("ROBOT_PATH.state()")
        # Wrong first: the plan without its last card (or a bump into the edge).
        wrong = pg.evaluate("""() => { const s = ROBOT_PATH.state(), p = s.puzzle, P = ROBOT_PATH.generate;
          const pz = Object.assign({}, p, { walls: new Set(p.walls), pink: new Set(p.pink) });
          let w = p.intended.slice(0, -1); if (!w.length || ROBOT_PATH.simulate(pz, w).win) w = [{ t: 'mv', d: 0 }, { t: 'mv', d: 0 }, { t: 'mv', d: 0 }, { t: 'mv', d: 0 }, { t: 'mv', d: 0 }, { t: 'mv', d: 0 }, { t: 'mv', d: 0 }].slice(0, p.limit || 7);
          if (ROBOT_PATH.simulate(pz, w).win) w = [{ t: 'mv', d: 2 }].concat(w).slice(0, p.limit || 8);
          return w; }""")
        pg.evaluate("(w) => ROBOT_PATH.setProgram(w)", wrong)
        before = st['solved']
        pg.evaluate("ROBOT_PATH.go()")
        r = wait_result(pg, before)
        if r['solved'] != before or r['result'] == 'win': problems.append(f'L{i+1}: wrong program won')
        if not r['missed']: problems.append(f'L{i+1}: wrong program not counted as a miss')
        pg.evaluate("ROBOT_PATH.setProgram(ROBOT_PATH.state().puzzle.intended)")
        if i in (3, 6, 7, 10):
            pg.wait_for_timeout(300); pg.screenshot(path=str(SHOTS / f'robot-path-L{i+1}.png'))
        pg.evaluate("ROBOT_PATH.go()")
        if i == 7:
            pg.wait_for_timeout(700); pg.screenshot(path=str(SHOTS / 'robot-path-running.png'))
        r = wait_result(pg, before)
        if r['solved'] != before + 1: problems.append(f'L{i+1}: right program did not win ({r["result"]})')

    # Tapping real cards: arrows on level 1 and a Repeat with the number picker on the Repeat level.
    pg.evaluate("ROBOT_PATH.reset(); ROBOT_PATH.setLevel(0)")
    plan = pg.evaluate("ROBOT_PATH.state().puzzle.intended")
    arrows = {0: '⬆', 1: '➡', 2: '⬇', 3: '⬅'}
    for c in plan: pg.click(f"#palette .pc.arrow:text-is('{arrows[c['d']]}')")
    if pg.evaluate("ROBOT_PATH.state().cards") != len(plan): problems.append('tapped arrows did not land in the program')
    lv0 = pg.evaluate("ROBOT_PATH.state().solved")
    pg.click('#go'); r = wait_result(pg, lv0)
    if r['solved'] != lv0 + 1: problems.append('tapped arrow program did not win')
    if pg.evaluate("ROBOT_PATH.P.st.streak") != 1: problems.append('first try win not recorded as right')

    pg.evaluate("ROBOT_PATH.setLevel(4)")
    pz = pg.evaluate("ROBOT_PATH.state().puzzle")
    rep = pz['intended'][0]
    pg.click("#palette .pc.rep")
    pg.click(f"#palette .pc.arrow:text-is('{arrows[rep['body'][0]['d']]}')")
    pg.click("#strip .rn"); pg.click(f"#picker button:text-is('{rep['n']}')")
    for k in range(4): pg.click("#palette .pc.arrow >> nth=0")
    if pg.evaluate("ROBOT_PATH.state().cards") > pz['limit']: problems.append('card limit not enforced')
    pg.screenshot(path=str(SHOTS / 'robot-path-repeat.png'))
    st = pg.evaluate("ROBOT_PATH.state()")
    prog = st['program']
    if prog[0]['t'] != 'rep' or prog[0]['n'] != rep['n'] or prog[0]['body'][0]['d'] != rep['body'][0]['d']: problems.append(f'repeat card built wrong: {prog}')
    # Remove the extra cards the limit let in, then run.
    pg.evaluate("(r) => ROBOT_PATH.setProgram([r])", rep)
    before = st['solved']; pg.click('#go'); r = wait_result(pg, before)
    if r['solved'] != before + 1: problems.append('repeat program from taps did not win')

    pg.evaluate("ROBOT_PATH.setLevel(7)")
    pg.click("#palette .pc.rep"); pg.click("#palette .pc.ifc"); pg.click("#strip .ifk .yes")
    pg.screenshot(path=str(SHOTS / 'robot-path-if.png'))
    st = pg.evaluate("ROBOT_PATH.state()")
    if st['program'][0]['t'] != 'rep' or st['program'][0]['body'][0]['t'] != 'if' or st['program'][0]['body'][0]['a'] != 1: problems.append('If card did not go inside the Repeat or did not turn')

    # The hint shows a working plan and counts as a miss.
    pg.evaluate("ROBOT_PATH.reset(); ROBOT_PATH.setLevel(9)")
    pg.click('#hint')
    st = pg.evaluate("ROBOT_PATH.state()")
    if not st['missed'] or st['cards'] == 0: problems.append('hint did not load a plan or count a miss')
    b.close()

problems += [f'page error: {e}' for e in errors]
if problems:
    print('PROBLEMS:'); [print(' ', x) for x in problems]; sys.exit(1)
print('ALL OK')
