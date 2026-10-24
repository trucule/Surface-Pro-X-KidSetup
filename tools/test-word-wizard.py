"""Checks Word Wizard: every level makes sound words with a spell, every spell runs without errors, the level rule
works, and right answers win while wrong ones do not, through the page. Run: python3 tools/test-word-wizard.py"""
import pathlib, sys
from playwright.sync_api import sync_playwright

APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'word-wizard.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)

GEN = r"""
(N) => {
  const WW = window.WORD_WIZARD, out = { problems: [], counts: {}, spells: {} };
  const LEN = { 0: 3, 1: 3, 2: 4, 3: 5 }, DECOYS = { 0: 0, 1: 2, 2: 1, 3: 2 };
  WW.LEVELS.forEach((lv, i) => {
    const tag = `L${i + 1} ${lv.name}`; out.counts[tag] = 0;
    for (let k = 0; k < N; k++) {
      let t; try { t = lv.gen(); } catch (e) { out.problems.push(`${tag}: threw ${e.message}`); break; }
      out.counts[tag]++; const where = `${tag}: ${t.word}`;
      if (!t.units.length || t.units.some(u => !/^[a-z]+$/.test(u))) out.problems.push(`${where}: units ${t.units}`);
      if (t.groups.reduce((a, b) => a + b, 0) !== t.units.length) out.problems.push(`${where}: groups`);
      const need = t.units.filter((u, j) => !t.fixed.includes(j)), pool = t.tiles.slice();
      for (const u of need) { const j = pool.indexOf(u); if (j < 0) out.problems.push(`${where}: missing tile ${u}`); else pool.splice(j, 1); }
      if (t.units.join('') !== t.word.replace(' ', '')) out.problems.push(`${where}: units do not spell the word`);
      if (/undefined|null|NaN|\u2014/.test(t.prompt + t.word + t.emoji)) out.problems.push(`${where}: bad text ${t.prompt}`);
      if (!WW.spellKind(t)) out.problems.push(`${where}: no spell`);
      if (LEN[i] && t.word.length !== LEN[i]) out.problems.push(`${where}: length ${t.word.length}`);
      if (DECOYS[i] !== undefined && t.tiles.length - t.units.length !== DECOYS[i]) out.problems.push(`${where}: decoys`);
      if (i === 4 && t.word.split(' ').length !== 2) out.problems.push(`${where}: not two words`);
      if ((i === 5 || i === 6 || i === 7) && t.kind !== 'chunks') out.problems.push(`${where}: not chunks`);
      if (i === 5 && !(t.fixed.length === 1 && ['s', 'er', 'est'].includes(t.units[1]))) out.problems.push(`${where}: ending`);
      if (i === 6 && !['un', 're'].includes(t.units[0])) out.problems.push(`${where}: beginning`);
      if (new Set(t.tiles).size !== t.tiles.length && t.kind === 'chunks') out.problems.push(`${where}: repeated chunk tiles`);
      out.spells[t.spell] = t;
    }
  });
  return out;
}
"""

# Run every distinct spell, with its stage setup, and collect any error.
CAST_ALL = r"""
async (spells) => {
  const WW = window.WORD_WIZARD, errs = [], sleep = ms => new Promise(r => setTimeout(r, ms));
  let k = 0;
  for (const t of spells) {
    try { if (t.setup) WW.setup(t.setup); WW.cast(t).catch(e => errs.push(t.spell + ': ' + e.message)); } catch (e) { errs.push(t.spell + ': ' + e.message); }
    await sleep(250);
    if (++k % 5 === 0) { await sleep(1500); Kit.clear(true); }
  }
  await sleep(3000); return errs;
}
"""

# Tap the tiles for the current word, right or wrong.
SOLVE = r"""
async (right) => {
  const WW = window.WORD_WIZARD, t = WW.current(), used = new Set();
  const need = t.units.filter((u, j) => !t.fixed.includes(j));
  let order = need.slice();
  if (!right) {
    if (need.length === 1) order = [t.tiles.find(x => x !== need[0])];
    else { order = need.slice().reverse(); if (order.join() === need.join()) { const d = t.tiles.find(x => !need.includes(x)); order[0] = d || order[0]; if (!d) order = [need[1], need[0], ...need.slice(2)]; } }
    if (order.join() === need.join()) return 'cannot make it wrong';
  }
  for (const u of order) { const i = t.tiles.findIndex((x, j) => x === u && !used.has(j)); if (i < 0) return 'no tile ' + u; used.add(i); WW.tap(i); await new Promise(r => setTimeout(r, 40)); }
  return 'ok';
}
"""

def wait_phase(pg, want, ms=15000):
    pg.wait_for_function(f"window.WORD_WIZARD.state().phase === '{want}'", timeout=ms)

def log(*a): print(*a, flush=True)

def main():
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        pg = b.new_page(viewport={'width': 1440, 'height': 960})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(APP); pg.wait_for_timeout(1500)
        pg.evaluate("localStorage.clear(); window.WORD_WIZARD.hold = true")

        st = pg.evaluate("window.WORD_WIZARD.state()")
        if st['level'] != 3: fails.append(f'new player starts at level {st["level"] + 1}, wanted 4')
        g = pg.evaluate(GEN, 400)
        for k, v in g['counts'].items(): print(f'  {k}: {v} words')
        fails += g['problems'][:20]
        print(f'  distinct spells: {len(g["spells"])}')
        log('  casting every spell'); pg.set_viewport_size({'width': 480, 'height': 360})
        errs = pg.evaluate(CAST_ALL, list(g['spells'].values()))
        pg.set_viewport_size({'width': 1440, 'height': 960}); pg.evaluate("Kit.clear(true)"); pg.wait_for_timeout(500)
        fails += ['spell error: ' + e for e in errs[:20]]
        pg.screenshot(path=str(SHOTS / 'ww-all-spells.png'))

        # The level rule, straight on record().
        rule = pg.evaluate("""() => { const WW = window.WORD_WIZARD, P = WW.P(), out = [];
          WW.setLevel(3); for (let i = 0; i < 4; i++) WW.record(true); out.push(P.lv);
          WW.record(false); out.push(P.lv); WW.record(false); out.push(P.lv);
          WW.setLevel(3); WW.record(true); WW.record(true); WW.record(true); WW.record(false); WW.record(true); out.push(P.lv);
          WW.setLevel(0); WW.record(false); WW.record(false); out.push(P.lv);
          WW.setLevel(9); for (let i = 0; i < 8; i++) WW.record(true); out.push(P.lv); return out; }""")
        if rule != [4, 4, 3, 3, 0, 9]: fails.append(f'level rule gave {rule}, wanted [4, 4, 3, 3, 0, 9]')

        pg.set_viewport_size({'width': 1024, 'height': 700})  # software 3D in the test browser is slow; a smaller page keeps it moving
        # Through the page: right answers win on every level; a wrong first try is a miss and does not win.
        for lv in range(10):
            log(f'  page check L{lv + 1}')
            pg.evaluate(f"window.WORD_WIZARD.setLevel({lv})"); pg.wait_for_timeout(150)
            if lv in (0, 4, 6, 8): pg.screenshot(path=str(SHOTS / f'ww-L{lv + 1}-ask.png'))
            s0 = pg.evaluate("window.WORD_WIZARD.state()")
            r = pg.evaluate(SOLVE, True)
            if r != 'ok': fails.append(f'L{lv + 1}: right solve {r}'); continue
            wait_phase(pg, 'won')
            s1 = pg.evaluate("window.WORD_WIZARD.state()")
            if s1['stars'] != s0['stars'] + 1 or s1['streak'] != 1: fails.append(f'L{lv + 1}: right answer did not count {s0} {s1}')
            if lv in (3, 4, 5, 6, 7): pg.wait_for_timeout(2600); pg.screenshot(path=str(SHOTS / f'ww-L{lv + 1}-spell.png'))
            # Wrong first.
            pg.evaluate("window.WORD_WIZARD.newRound(false)"); pg.wait_for_timeout(150)
            r = pg.evaluate(SOLVE, False)
            if r != 'ok': fails.append(f'L{lv + 1}: wrong solve {r}'); continue
            wait_phase(pg, 'play')
            s2 = pg.evaluate("window.WORD_WIZARD.state()")
            if s2['phase'] != 'play' or not s2['missed'] or s2['streak'] != 0 or s2['miss'] != 1 or s2['stars'] != s1['stars']:
                fails.append(f'L{lv + 1}: wrong answer handled badly {s2}')
            if lv == 2: pg.screenshot(path=str(SHOTS / 'ww-wrong.png'))
            if s2['level'] != lv: fails.append(f'L{lv + 1}: one miss changed the level')
            # Fix it: a win after a miss gives a star but no streak.
            r = pg.evaluate(SOLVE, True)
            if r != 'ok': fails.append(f'L{lv + 1}: fix solve {r}'); continue
            wait_phase(pg, 'won')
            s3 = pg.evaluate("window.WORD_WIZARD.state()")
            if s3['streak'] != 0 or s3['stars'] != s2['stars'] + 1: fails.append(f'L{lv + 1}: win after a miss counted as first try {s3}')

        # Four right in a row through the page moves up a level.
        pg.evaluate("window.WORD_WIZARD.setLevel(2)")
        for k in range(4):
            pg.evaluate("window.WORD_WIZARD.newRound(false)"); pg.wait_for_timeout(100); pg.evaluate(SOLVE, True); wait_phase(pg, 'won')
        if pg.evaluate("window.WORD_WIZARD.state().level") != 3: fails.append('four right through the page did not level up')
        # Two misses in a row moves down.
        for k in range(2):
            pg.evaluate("window.WORD_WIZARD.newRound(false)"); pg.wait_for_timeout(100); pg.evaluate(SOLVE, False); pg.wait_for_timeout(300); wait_phase(pg, 'play')
        if pg.evaluate("window.WORD_WIZARD.state().level") != 2: fails.append('two misses through the page did not level down')
        saved = pg.evaluate("JSON.parse(localStorage.getItem('word-wizard-v1')).lv")
        if saved != 2: fails.append(f'saved level {saved}')
        pg.reload(); pg.wait_for_timeout(1200)
        if pg.evaluate("window.WORD_WIZARD.state().level") != 2: fails.append('level not kept after reload')

        # Small screen.
        pg.set_viewport_size({'width': 1024, 'height': 700}); pg.evaluate("window.WORD_WIZARD.setLevel(8)"); pg.wait_for_timeout(600)
        pg.screenshot(path=str(SHOTS / 'ww-small.png'))
        over = pg.evaluate("[...document.querySelectorAll('#tray, #slots, header')].some(e => e.scrollWidth > e.clientWidth + 2 || e.getBoundingClientRect().right > innerWidth)")
        if over: fails.append('layout overflows at 1024x700')
        fails += ['page error: ' + e for e in errors]
        b.close()
    print('\n'.join(fails) if fails else 'ALL OK')
    sys.exit(1 if fails else 0)

main()
