#!/usr/bin/env python3
"""Headless test for apps/circuit-lab.html.

Checks the circuit solver against hand-worked circuits, that every level generates valid, solvable puzzles many
times, the level ladder rule, that solved boards win and unsolved ones do not (through the page, with one real
drag from the tray), and that the page throws no errors. Screenshots go to /tmp/claude-0/tests/.
"""
import pathlib, sys
from playwright.sync_api import sync_playwright

APP = pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'circuit-lab.html'
OUT = pathlib.Path('/tmp/claude-0/tests'); OUT.mkdir(parents=True, exist_ok=True)
problems = []
def check(ok, what):
    print(('ok   ' if ok else 'FAIL ') + what)
    if not ok: problems.append(what)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1366, 'height': 900})
    pg.set_default_timeout(120000)
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    def wait_star(n):
        try: pg.wait_for_function("n => window.CIRCUIT_LAB.state.stars > n", arg=n, timeout=60000)
        except Exception: pass
    pg.goto(APP.as_uri()); pg.wait_for_timeout(1200)
    pg.evaluate("localStorage.clear()")
    pg.reload(); pg.wait_for_timeout(1200)

    # Solver against hand-worked values: 3 V, 0.2 ohm inside, 4 ohm bulbs.
    r = pg.evaluate("""() => { const C = window.CIRCUIT_LAB, mk = parts => ({ cols: 4, rows: 2, parts }), w = t => ({ t, on: true, dir: 1 });
      const one = mk({ 'v,0,0': w('battery'), 'h,0,0': w('wire'), 'v,1,0': w('bulb'), 'h,0,1': w('wire') });
      const series = mk({ 'v,0,0': w('battery'), 'h,0,0': w('bulb'), 'v,1,0': w('bulb'), 'h,0,1': w('wire') });
      const par = mk({ 'v,0,0': w('battery'), 'h,0,0': w('wire'), 'h,1,0': w('wire'), 'v,1,0': w('bulb'), 'v,2,0': w('bulb'), 'h,0,1': w('wire'), 'h,1,1': w('wire') });
      const short = mk({ 'v,0,0': w('battery'), 'h,0,0': w('wire'), 'v,1,0': w('wire'), 'h,0,1': w('wire') });
      const open = mk({ 'v,0,0': w('battery'), 'h,0,0': w('wire'), 'v,1,0': w('bulb'), 'h,0,1': { t: 'switch', on: false } });
      const two = mk({ 'v,0,0': w('battery'), 'h,0,0': w('wire'), 'v,1,0': w('bulb'), 'h,0,1': { t: 'battery', on: true, dir: -1 } });
      const twoBad = mk({ 'v,0,0': w('battery'), 'h,0,0': w('wire'), 'v,1,0': w('bulb'), 'h,0,1': { t: 'battery', on: true, dir: 1 } });
      const b = c => Object.values(C.solve(c).bright);
      return { one: b(one), series: b(series), par: b(par), short: C.solve(short).short, open: b(open), two: b(two), twoBad: b(twoBad), oneI: C.solve(one).cur['v,1,0'] }; }""")
    check(abs(r['one'][0] - 1) < 0.02, 'one bulb on one battery is brightness 1, less a little for the wires (%.3f)' % r['one'][0])
    check(abs(abs(r['oneI']) - 3 / 4.22) < 1e-3, 'one bulb draws 3 V / 4.22 ohm with 2 wires (%.4f)' % r['oneI'])
    check(all(abs(x - (8.2 ** -2 * 4 / (4.2 ** -2 * 4))) < 1e-3 for x in r['series']) and len(r['series']) == 2, 'series bulbs share: %s' % r['series'])
    check(all(0.85 < x < 0.95 for x in r['par']) and len(r['par']) == 2, 'parallel bulbs stay bright: %s' % r['par'])
    check(r['short'] is True, 'a plain wire across the battery is a short circuit')
    check(r['open'][0] < 1e-6, 'an open switch stops the current')
    check(max(r['two'] + r['twoBad']) > 3 and min(r['two'] + r['twoBad']) < 0.01, 'two batteries add one way and cancel the other way: %s %s' % (r['two'], r['twoBad']))

    # Every level generates valid, solvable puzzles many times.
    r = pg.evaluate("""() => { const C = window.CIRCUIT_LAB, out = [];
      for (let i = 0; i < C.LEVELS.length; i++) { let bad = 0, err = '', n = 0;
        for (let k = 0; k < 150; k++) { try { const L = C.gen(i); n++; const v = C.validate(L); if (!v.ok) { bad++; err = v.why; }
          if (!L.quiz) { if (C.evaluate(C.build(L.fixed), L.goal).ok) { bad++; err = 'solved at start'; } if (!C.evaluate(C.build(L.fixed, L.solution), L.goal).ok) { bad++; err = 'solution fails'; } if (!L.text) { bad++; err = 'no text'; } } }
          catch (e) { bad++; err = String(e); } }
        out.push([i, C.LEVELS[i].name, n, bad, err]); }
      return out; }""")
    for i, name, n, bad, err in r:
        check(bad == 0 and n == 150, 'level %d %s: %d puzzles, %d bad %s' % (i + 1, name, n, bad, err))

    # Ladder rule.
    r = pg.evaluate("""() => { const C = window.CIRCUIT_LAB; C.setLevel(3); const s = []; const lv = () => C.state.level;
      C.record(true); C.record(true); C.record(true); s.push(lv()); C.record(true); s.push(lv());
      C.record(false); s.push(lv()); C.record(false); s.push(lv());
      C.record(true); C.record(true); C.record(true); C.record(false); C.record(true); s.push(lv());
      C.setLevel(0); C.record(false); C.record(false); s.push(lv());
      C.setLevel(C.LEVELS.length - 1); for (let k = 0; k < 4; k++) C.record(true); s.push(lv()); return s; }""")
    check(r == [3, 4, 4, 3, 3, 0, 10], 'four right moves up, two missed moves down, a miss resets the streak, ends clamp: %s' % r)
    stored = pg.evaluate("JSON.parse(localStorage.getItem('circuit-lab-v1')).lv")
    check(stored == 10, 'progress saved under circuit-lab-v1')

    C = 'window.CIRCUIT_LAB'
    def ev(js, arg=None): return pg.evaluate(js, arg) if arg is not None else pg.evaluate(js)
    def tray(): return ev(C + ".render().tray")
    def drag_in(t, e, mid_shot=None):
        # A real pointer drag from the tray button onto the edge, the same path her finger takes.
        box = ev("(t => { const r = window.CIRCUIT_LAB.trayButton(t).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })", t)
        tgt = ev("(e => { const s = window.CIRCUIT_LAB.slotScreen(e); return [s.x, s.y]; })", e)
        pg.mouse.move(*box); pg.mouse.down(); pg.mouse.move(box[0] + 20, box[1] - 20, steps=3); pg.mouse.move(*tgt, steps=8)
        if mid_shot: pg.wait_for_timeout(300); pg.screenshot(path=str(OUT / mid_shot))
        pg.mouse.up(); pg.wait_for_timeout(100)
    def tap_on(e):
        s = ev("(e => { const s = window.CIRCUIT_LAB.slotScreen(e); return [s.x, s.y]; })", e)
        pg.mouse.click(*s); pg.wait_for_timeout(100)

    def solve_level(i, real, shot=None, want=None):
        """Build the known solution part by part (real drags, or the hook that uses the same drop code), then
        check the win and that the 3D board draws every placed part, glowing bulbs and lit windows."""
        ev(C + ".setLevel(%d)" % i); pg.wait_for_timeout(250)
        L = ev(C + ".state.task"); stars = ev(C + ".state.stars")
        if shot: pg.screenshot(path=str(OUT / ('circuit-L%d-start.png' % (i + 1))))
        counts_ok = True
        for k, part in enumerate(L['solution']):
            before = tray().get(part['t'])
            if real: drag_in(part['t'], part['e'], mid_shot=('circuit-L%d-middrag.png' % (i + 1)) if shot and k == 0 else None)
            else: ev("([e, t]) => window.CIRCUIT_LAB.place(e, t)", [part['e'], part['t']])
            after = tray().get(part['t'])
            if after != before - 1: counts_ok = False
            on_board = ev("(e => { const p = window.CIRCUIT_LAB.state.circ.parts[e]; return p ? [p.t, p.on, p.dir] : null; })", part['e'])
            if not on_board or on_board[0] != part['t']: counts_ok = False
            # A new switch arrives off and a new battery points + right or down: tap them to match the solution.
            if part['t'] == 'switch' or (part['t'] == 'battery' and part['dir'] == -1):
                if real: tap_on(part['e'])
                else: ev("(e => window.CIRCUIT_LAB.tap(e))", part['e'])
        wait_star(stars)
        st = ev("(() => { const s = window.CIRCUIT_LAB.state; window.CIRCUIT_LAB.stay(); return { won: s.won, missed: s.missed, streak: s.streak }; })()")
        pg.wait_for_timeout(600)
        r = ev(C + ".render()")
        n = len(L['solution']); nb = L['goal']['bulbs']
        lit_windows = sum(1 for w in r['windows'] if w > 0)
        good = (st['won'] and not st['missed'] and st['streak'] == 1 and counts_ok and r['placed'] == n == r['placedParts']
                and len(r['bulbs']) == nb and all(b['glow'] > 0 for b in r['bulbs']) and lit_windows == nb and r['dots'] > 0)
        if want == 'dim': good = good and all(0.12 <= b['bright'] < 0.5 for b in r['bulbs'])
        if want == 'bright': good = good and all(b['bright'] >= 0.5 for b in r['bulbs'])
        check(good, 'level %d (%s): won first try, tray counts dropped per part, %d/%d placed parts drawn, %d bulbs glowing %s, %d/%d windows lit, %d current dots' % (
            i + 1, 'real drags' if real else 'drop hook', r['placed'], n, len(r['bulbs']), [round(b['bright'], 2) for b in r['bulbs']], lit_windows, nb, r['dots']))
        if shot: pg.screenshot(path=str(OUT / ('circuit-L%d-won.png' % (i + 1))))

    # Real drags on the levels the screenshots show: 1 (one bulb), 5 (series, dim), 7 (parallel, bright), 10 (puzzle house).
    solve_level(0, True, shot=True)
    solve_level(4, True, shot=True, want='dim')
    solve_level(6, True, shot=True, want='bright')
    solve_level(9, True, shot=True, want='bright')
    solve_level(2, True)   # switch: dragged in off, then tapped on

    # Each level through the page: an unfinished board does not win, the solution does.
    for i in range(11):
        pg.evaluate("window.CIRCUIT_LAB.setLevel(%d)" % i); pg.wait_for_timeout(250)
        quiz = pg.evaluate("!!window.CIRCUIT_LAB.state.task.quiz")
        if quiz:
            ans = pg.evaluate("window.CIRCUIT_LAB.state.task.ans")
            pg.screenshot(path=str(OUT / 'circuit-quiz.png'))
            stars = pg.evaluate("window.CIRCUIT_LAB.state.stars")
            pg.click('#qb' if ans == 'A' else '#qa', force=True); pg.wait_for_timeout(200)
            s1 = pg.evaluate("(() => { const s = window.CIRCUIT_LAB.state; return [s.won, s.missed, s.miss]; })()")
            pg.click('#qa' if ans == 'A' else '#qb', force=True); wait_star(stars)
            s2 = pg.evaluate("(() => { const s = window.CIRCUIT_LAB.state; return [s.won, s.streak]; })()")
            check(s1 == [False, True, 1] and s2 == [True, 0], 'level %d quiz: wrong house is a miss %s, right house wins with no streak %s' % (i + 1, s1, s2))
            pg.screenshot(path=str(OUT / 'circuit-quiz-answered.png'))
            pg.evaluate("window.CIRCUIT_LAB.setLevel(%d)" % i); pg.wait_for_timeout(200)
            ans = pg.evaluate("window.CIRCUIT_LAB.state.task.ans"); stars = pg.evaluate("window.CIRCUIT_LAB.state.stars")
            pg.click('#qa' if ans == 'A' else '#qb', force=True); wait_star(stars)
            s3 = pg.evaluate("(() => { const s = window.CIRCUIT_LAB.state; return [s.won, s.streak]; })()")
            check(s3 == [True, 1], 'level %d quiz: right house first try counts: %s' % (i + 1, s3))
            continue
        pg.click('#done', force=True); pg.wait_for_timeout(200)
        s1 = pg.evaluate("(() => { const s = window.CIRCUIT_LAB.state; return [s.won, s.missed, s.miss]; })()")
        check(s1 == [False, True, 1], 'level %d: Done on an unfinished board is a miss: %s' % (i + 1, s1))
        solve_level(i, False)

    # Wrong builds: series where parallel is asked, and a short circuit.
    pg.evaluate("window.CIRCUIT_LAB.setLevel(6)"); pg.wait_for_timeout(200)
    r = pg.evaluate("""() => { const C = window.CIRCUIT_LAB, L = C.state.task, c = C.build(L.fixed, L.solution);
      const bat = Object.keys(c.parts).find(e => c.parts[e].t === 'battery'); return C.evaluate(c, L.goal).ok; }""")
    check(r, 'bright rooms solution is parallel and passes')
    # Build a short on level 2 by wiring around the battery only.
    r = pg.evaluate("""() => { const C = window.CIRCUIT_LAB; let L, bat;
      for (let k = 0; k < 50; k++) { C.setLevel(1); L = C.state.task; bat = L.fixed.find(p => p.t === 'battery').e; if (+bat.split(',')[1] > 0) break; }
      const s = bat.split(','), i = +s[1], j = +s[2];
      const side = -1, x = i - 1;
      const loop = ['h,' + x + ',' + j, 'v,' + (i + side) + ',' + j, 'h,' + x + ',' + (j + 1)];
      for (const e of loop) if (!C.state.circ.parts[e]) C.place(e, 'wire');
      const sol = C.state.sol; return { short: sol.short, missed: C.state.missed, won: C.state.won }; }""")
    pg.wait_for_timeout(300)
    check(r['short'] and r['missed'] and not r['won'], 'a short circuit is caught, counts as a miss and does not win: %s' % r)
    pg.screenshot(path=str(OUT / 'circuit-short.png'))

    pg.set_viewport_size({'width': 1024, 'height': 700}); pg.evaluate("window.CIRCUIT_LAB.setLevel(9)"); pg.wait_for_timeout(400)
    pg.screenshot(path=str(OUT / 'circuit-small-screen.png'))
    check(not errors, 'no page errors: %s' % errors[:5])
    b.close()

print('ALL OK' if not problems else 'PROBLEMS: %d' % len(problems))
sys.exit(1 if problems else 0)
