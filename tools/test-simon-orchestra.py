"""Checks Simon Orchestra: every level makes sound tunes, the level rule works, and playing the tune back right wins
while a wrong note does not, through the page (forwards and backwards). Run: python3 tools/test-simon-orchestra.py"""
import pathlib, sys
from playwright.sync_api import sync_playwright

APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'simon-orchestra.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)

GEN = r"""
(N) => {
  const S = window.SIMON_ORCHESTRA, out = { problems: [], counts: {} };
  let prevLen = 0, prevN = 0;
  S.LEVELS.forEach((lv, i) => {
    const tag = `L${i + 1} ${lv.name}`; out.counts[tag] = 0;
    if (!(lv.n >= 3 && lv.n <= 6 && lv.len >= 2 && lv.step > 0.3)) out.problems.push(`${tag}: settings`);
    if (i && !lv.back && !S.LEVELS[i - 1].back && !(lv.len >= S.LEVELS[i - 1].len || lv.step < S.LEVELS[i - 1].step)) out.problems.push(`${tag}: not harder than the level below`);
    for (let k = 0; k < N; k++) {
      const t = lv.gen(); out.counts[tag]++;
      const where = `${tag}: ${t.seq}`;
      if (t.seq.length !== lv.len || t.n !== lv.n) out.problems.push(`${where}: length`);
      if (t.seq.some(x => !Number.isInteger(x) || x < 0 || x >= lv.n)) out.problems.push(`${where}: instrument out of range`);
      for (let j = 2; j < t.seq.length; j++) if (t.seq[j] === t.seq[j - 1] && t.seq[j] === t.seq[j - 2]) out.problems.push(`${where}: three in a row`);
      if (t.seq.length >= 3 && new Set(t.seq).size < 2) out.problems.push(`${where}: one instrument only`);
      const want = lv.back ? t.seq.slice().reverse() : t.seq;
      if (want.join() !== t.answer.join()) out.problems.push(`${where}: answer ${t.answer}`);
      if (t.back !== lv.back) out.problems.push(`${where}: backwards flag`);
    }
  });
  return out;
}
"""

def state(pg): return pg.evaluate("window.SIMON_ORCHESTRA.state()")
def wait_phase(pg, want, ms=45000): pg.wait_for_function(f"window.SIMON_ORCHESTRA.state().phase === '{want}'", timeout=ms)
def tap_pad(pg, i):
    # A real pointer press on the pad element (Playwright's click waits for animation frames, which software 3D makes slow).
    pg.evaluate(f"document.querySelector('.pad[data-i=\"{i}\"]').dispatchEvent(new PointerEvent('pointerdown', {{ bubbles: true }}))")

def log(*a): print(*a, flush=True)

def main():
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        pg = b.new_page(viewport={'width': 1440, 'height': 960})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(APP); pg.wait_for_timeout(1500)
        pg.screenshot(path=str(SHOTS / 'so-start.png'))
        pg.evaluate("localStorage.clear(); window.SIMON_ORCHESTRA.hold = true")
        if state(pg)['level'] != 3: fails.append(f'new player starts at level {state(pg)["level"] + 1}, wanted 4')
        g = pg.evaluate(GEN, 500)
        for k, v in g['counts'].items(): print(f'  {k}: {v} tunes')
        fails += g['problems'][:20]

        rule = pg.evaluate("""() => { const S = window.SIMON_ORCHESTRA, P = S.P(), out = [];
          S.setLevel(3); for (let i = 0; i < 4; i++) S.record(true); out.push(P.lv);
          S.record(false); out.push(P.lv); S.record(false); out.push(P.lv);
          S.setLevel(3); S.record(true); S.record(true); S.record(true); S.record(false); S.record(true); out.push(P.lv);
          S.setLevel(0); S.record(false); S.record(false); out.push(P.lv);
          S.setLevel(14); for (let i = 0; i < 8; i++) S.record(true); out.push(P.lv); return out; }""")
        if rule != [4, 4, 3, 3, 0, 14]: fails.append(f'level rule gave {rule}, wanted [4, 4, 3, 3, 0, 14]')

        # A real-speed round with screenshots: the tune plays, then she taps the pads.
        pg.evaluate("window.SIMON_ORCHESTRA.setLevel(5)")
        pg.wait_for_timeout(1700); pg.screenshot(path=str(SHOTS / 'so-watch.png'))
        wait_phase(pg, 'input')
        t = pg.evaluate("window.SIMON_ORCHESTRA.current()")
        for x in t['answer']: pg.click(f'.pad[data-i="{x}"]'); pg.wait_for_timeout(150)
        wait_phase(pg, 'won'); pg.wait_for_timeout(500); pg.screenshot(path=str(SHOTS / 'so-won.png'))
        if state(pg)['streak'] != 1: fails.append('a real-speed right answer did not count')

        pg.evaluate("window.SIMON_ORCHESTRA.fast = true")
        pg.set_viewport_size({'width': 1024, 'height': 700})  # software 3D in the test browser is slow; a smaller page keeps it moving
        # Every level through the page: right wins; a wrong note is a miss and plays the tune again; a win after that gives no streak.
        for lv in range(15):
            log(f'  page check L{lv + 1}')
            pg.evaluate(f"window.SIMON_ORCHESTRA.setLevel({lv})"); wait_phase(pg, 'input')
            s0 = state(pg); t = pg.evaluate("window.SIMON_ORCHESTRA.current()")
            if s0['n'] != t['n'] or pg.evaluate("document.querySelectorAll('.pad').length") != t['n']: fails.append(f'L{lv + 1}: {s0["n"]} instruments shown for {t["n"]}')
            if lv == 12: pg.screenshot(path=str(SHOTS / 'so-backwards-turn.png'))
            for x in t['answer']: tap_pad(pg, x)
            wait_phase(pg, 'won'); s1 = state(pg)
            if s1['stars'] != s0['stars'] + 1 or s1['streak'] != 1: fails.append(f'L{lv + 1}: right tune did not count {s1}')
            pg.evaluate("window.SIMON_ORCHESTRA.newRound(false)"); wait_phase(pg, 'input')
            t = pg.evaluate("window.SIMON_ORCHESTRA.current()")
            # Play the first notes right, then a wrong one.
            k = len(t['answer']) // 2
            for x in t['answer'][:k]: tap_pad(pg, x)
            wrong = (t['answer'][k] + 1) % t['n']; tap_pad(pg, wrong)
            s2 = state(pg)
            if s2['phase'] != 'oops' or not s2['missed'] or s2['miss'] != 1 or s2['streak'] != 0 or s2['stars'] != s1['stars']: fails.append(f'L{lv + 1}: wrong note handled badly {s2}')
            if lv == 2: pg.screenshot(path=str(SHOTS / 'so-oops.png'))
            # If the backwards tune were played forwards it must not win either.
            wait_phase(pg, 'input')
            if t['back'] and t['seq'] != t['answer']:
                tap_pad(pg, t['seq'][0]) if t['seq'][0] != t['answer'][0] else None
            if state(pg)['phase'] == 'oops': wait_phase(pg, 'input')
            for x in t['answer']: tap_pad(pg, x)
            wait_phase(pg, 'won'); s3 = state(pg)
            if s3['streak'] != 0 or s3['stars'] != s2['stars'] + 1: fails.append(f'L{lv + 1}: win after a miss counted as first try {s3}')
            if s3['level'] != lv: fails.append(f'L{lv + 1}: one miss changed the level')

        # Tapping during the demo does nothing to the answer.
        pg.evaluate("window.SIMON_ORCHESTRA.fast = false; window.SIMON_ORCHESTRA.setLevel(3)"); pg.wait_for_timeout(300)
        tap_pad(pg, 0); s = state(pg)
        if s['phase'] != 'watch' or s['pos'] != 0 or s['missed']: fails.append(f'tap during the demo counted {s}')
        pg.evaluate("window.SIMON_ORCHESTRA.fast = true")
        # Four right through the page moves up; two misses move down.
        pg.evaluate("window.SIMON_ORCHESTRA.setLevel(9)")
        for k in range(4):
            wait_phase(pg, 'input'); t = pg.evaluate("window.SIMON_ORCHESTRA.current()")
            for x in t['answer']: tap_pad(pg, x)
            wait_phase(pg, 'won'); pg.evaluate("window.SIMON_ORCHESTRA.newRound(false)")
        if state(pg)['level'] != 10: fails.append(f'four right did not level up: {state(pg)}')
        for k in range(2):
            wait_phase(pg, 'input'); t = pg.evaluate("window.SIMON_ORCHESTRA.current()")
            tap_pad(pg, (t['answer'][0] + 1) % t['n']); pg.evaluate("window.SIMON_ORCHESTRA.newRound(false)")
        if state(pg)['level'] != 9: fails.append(f'two misses did not level down: {state(pg)}')
        pg.reload(); pg.wait_for_timeout(1000)
        if state(pg)['level'] != 9: fails.append('level not kept after reload')
        # The instruments in the 3D scene can be tapped too.
        pg.evaluate("window.SIMON_ORCHESTRA.hold = true; window.SIMON_ORCHESTRA.fast = true; window.SIMON_ORCHESTRA.setLevel(0)"); wait_phase(pg, 'input')
        t = pg.evaluate("window.SIMON_ORCHESTRA.current()")
        for x in t['answer']:
            xy = pg.evaluate(f"""(() => {{ const o = window.SIMON_ORCHESTRA.inst()[{x}], v = o.g.position.clone(); v.y += 0.45 * o.s; v.project(Kit.camera); const r = Kit.renderer.domElement.getBoundingClientRect();
              return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }})()""")
            pg.mouse.click(xy[0], xy[1])
        if state(pg)['phase'] != 'won': fails.append(f'tapping the 3D instruments did not win {state(pg)}')
        pg.set_viewport_size({'width': 1024, 'height': 700}); pg.evaluate("window.SIMON_ORCHESTRA.setLevel(9)"); pg.wait_for_timeout(500)
        pg.screenshot(path=str(SHOTS / 'so-small.png'))
        if pg.evaluate("document.getElementById('pads').scrollWidth > innerWidth"): fails.append('pads overflow at 1024 wide')
        fails += ['page error: ' + e for e in errors]
        b.close()
    print('\n'.join(fails) if fails else 'ALL OK')
    sys.exit(1 if fails else 0)

main()
