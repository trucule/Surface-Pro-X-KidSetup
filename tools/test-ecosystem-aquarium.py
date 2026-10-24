#!/usr/bin/env python3
"""Headless test for apps/ecosystem-aquarium.html.

Checks the day-by-day simulation against hand-worked tanks and that it has no randomness, that every level
generates a tank that fails as set up and has at least one winning setup (found by trying every setup), the level
ladder rule, that a winning tank wins and a failing tank does not (through the page, using the + and - buttons),
and that the page throws no errors. Screenshots go to /tmp/claude-0/tests/.
"""
import json, pathlib, sys
from playwright.sync_api import sync_playwright

APP = pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'ecosystem-aquarium.html'
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
    pg.goto(APP.as_uri()); pg.wait_for_timeout(1200)
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(1200)

    # Hand-worked tanks.
    r = pg.evaluate("""() => { const E = window.ECOSYSTEM_AQUARIUM, g = { groups: ['fish', 'snail', 'plant', 'big'] };
      const sim = (s, lv) => E.simulate(s, Object.assign({ D: 3, goal: g }, lv));
      return {
        ok: sim({ F: 6, S: 0, P: 2, L: 2, f: 3 }),
        air: sim({ F: 4, S: 0, P: 1, L: 1, f: 2 }, { D: 1 }),
        green: sim({ F: 3, S: 0, P: 2, L: 3, f: 2 }),
        crowd: sim({ F: 8, S: 0, P: 2, L: 3, f: 4 }, { D: 1 }),
        chain: sim({ F: 3, S: 0, P: 3, L: 3, f: 2 }, { D: 2, B: 1, breed: true }),
        snail: sim({ F: 0, S: 4, P: 0, L: 0, f: 0 }, { D: 1 }),
        dark: sim({ F: 2, S: 0, P: 2, L: 0, f: 1 }, { D: 1 }),
        again: JSON.stringify(sim({ F: 7, S: 2, P: 3, L: 2, f: 4 }, { D: 5, B: 1, breed: true })) === JSON.stringify(sim({ F: 7, S: 2, P: 3, L: 2, f: 4 }, { D: 5, B: 1, breed: true })),
      }; }""")
    ok = r['ok']
    check([d['O'] for d in ok] == [16, 16, 16] and [d['A'] for d in ok] == [10, 20, 30] and all(not d['why']['fish'] for d in ok), '6 fish, 2 plants, sunny, 3 pinches: air 16 a day, algae 10, 20, 30, fish well')
    check(r['air'][0]['O'] == 9 and r['air'][0]['why']['fish'] == 'air', '4 fish with 1 plant on dim light: air 9, the fish run out of air')
    check([d['A'] for d in r['green']] == [24, 48, 72] and r['green'][2]['why']['fish'] == 'algae' and not r['green'][1]['why']['fish'], 'very bright light and extra food turn the water green on day 3')
    check(r['crowd'][0]['why']['fish'] == 'crowd' and r['crowd'][0]['room'] == 7, '8 fish with 2 plants is too crowded (room for 7)')
    ch = r['chain']
    check([(d['F'], d['eaten'], d['born'], d['Fend']) for d in ch] == [(3, 1, 1, 3), (3, 1, 1, 3)] and not any(d['why']['big'] for d in ch), 'food chain: the big fish eats 1 a day and 1 baby is born, so 3 stay 3')
    check(r['snail'][0]['why']['snail'] == 'hungry', '4 snails with no light and no algae go hungry')
    check(r['dark'][0]['why']['plant'] == 'dark', 'plants with the light off are not well')
    check(r['again'], 'the same tank always gives the same days')

    # Every level: the starting tank fails, and a winning setup exists inside the allowed ranges.
    r = pg.evaluate("""() => { const E = window.ECOSYSTEM_AQUARIUM, out = [];
      for (let i = 0; i < E.LEVELS.length; i++) { let bad = 0, err = '', n = 0, minSol = 1e9;
        for (let k = 0; k < 40; k++) { try { const L = E.gen(i); n++;
          if (E.judge(L.start, L).ok) { bad++; err = 'start already wins'; }
          if (!E.judge(L.solution, L).ok) { bad++; err = 'solution fails'; }
          for (const v in L.lock) if (L.solution[v] !== L.lock[v] || L.start[v] !== L.lock[v]) { bad++; err = 'lock ' + v; }
          for (const v in L.range) { const [a, b] = L.range[v]; if (L.solution[v] < a || L.solution[v] > b || L.start[v] < a || L.start[v] > b) { bad++; err = 'range ' + v; } }
          const sols = E.solutions(L); minSol = Math.min(minSol, sols.length); if (!sols.length) { bad++; err = 'no solution'; }
          if (!L.text || /\\u2014/.test(L.text)) { bad++; err = 'text'; }
        } catch (e) { bad++; err = String(e); } }
        out.push([i, E.LEVELS[i].name, n, bad, err, minSol]); }
      return out; }""")
    for i, name, n, bad, err, ms in r:
        check(bad == 0 and n == 40, 'level %d %s: %d tanks, %d bad %s (fewest winning setups %d)' % (i + 1, name, n, bad, err, ms))

    # Ladder rule.
    r = pg.evaluate("""() => { const E = window.ECOSYSTEM_AQUARIUM; E.setLevel(3); const s = []; const lv = () => E.state.level;
      E.record(true); E.record(true); E.record(true); s.push(lv()); E.record(true); s.push(lv());
      E.record(false); s.push(lv()); E.record(false); s.push(lv());
      E.record(true); E.record(true); E.record(true); E.record(false); E.record(true); s.push(lv());
      E.setLevel(0); E.record(false); E.record(false); s.push(lv());
      E.setLevel(E.LEVELS.length - 1); for (let k = 0; k < 4; k++) E.record(true); s.push(lv()); return s; }""")
    check(r == [3, 4, 4, 3, 3, 0, 9], 'four right moves up, two missed moves down, a miss resets the streak, ends clamp: %s' % r)
    check(pg.evaluate("JSON.parse(localStorage.getItem('ecosystem-aquarium-v1')).lv") == 9, 'progress saved under ecosystem-aquarium-v1')

    def state():
        return pg.evaluate("(() => { const s = window.ECOSYSTEM_AQUARIUM.state; return { won: s.won, missed: s.missed, streak: s.streak, running: s.running, setup: s.setup, stars: s.stars }; })()")
    def wait_done():
        pg.wait_for_function("!window.ECOSYSTEM_AQUARIUM.state.running", timeout=30000)
    def set_to(target):
        # Click + and - until the tank matches the target setup.
        for v, want in target.items():
            for _ in range(20):
                have = state()['setup'][v]
                if have == want: break
                sel = '.ctl[data-v="%s"] button[data-d="%s"]' % (v, '1' if want > have else '-1')
                if pg.locator(sel).count() == 0: break
                pg.click(sel, force=True)
        return state()['setup']

    for i in range(10):
        pg.evaluate("window.ECOSYSTEM_AQUARIUM.fast = true; window.ECOSYSTEM_AQUARIUM.setLevel(%d)" % i); pg.wait_for_timeout(150)
        pg.click('#run', force=True); wait_done(); pg.wait_for_timeout(100)
        s = state()
        check(not s['won'] and s['missed'] and pg.locator('#againBtn').count() == 1, 'level %d: the starting tank crashes and counts as a miss' % (i + 1))
        if i == 3: pg.screenshot(path=str(OUT / 'eco-crash.png'))
        pg.evaluate("window.ECOSYSTEM_AQUARIUM.setLevel(%d)" % i); pg.wait_for_timeout(150)
        sol = pg.evaluate("window.ECOSYSTEM_AQUARIUM.state.task.solution")
        got = set_to(sol)
        check(got == sol, 'level %d: the + and - buttons set the tank to %s' % (i + 1, sol))
        pg.click('#run', force=True); wait_done(); pg.evaluate("window.ECOSYSTEM_AQUARIUM.stay()"); pg.wait_for_timeout(100)
        s = state()
        v = pg.evaluate("(() => { const s = window.ECOSYSTEM_AQUARIUM.state; return { sick: Object.values(s.view.sick).some(Boolean), fish: s.fish, task: s.task.level, want: s.task.level }; })()")
        check(not v['sick'] and v['task'] == i and pg.locator('#nextBtn').count() == 1, 'level %d: the won screen still shows this tank, every creature healthy, with the Next button' % (i + 1))
        check(s['won'] and not s['missed'] and s['streak'] == 1, 'level %d: the winning tank thrives and counts first try: %s' % (i + 1, {k: s[k] for k in ('won', 'missed', 'streak')}))
        if i in (2, 7): pg.screenshot(path=str(OUT / ('eco-%d-won.png' % (i + 1))))

    # A slow run to look at the tank while the days pass.
    pg.evaluate("window.ECOSYSTEM_AQUARIUM.fast = false; window.ECOSYSTEM_AQUARIUM.setLevel(7)"); pg.wait_for_timeout(200)
    set_to(pg.evaluate("window.ECOSYSTEM_AQUARIUM.state.task.solution"))
    pg.click('#run', force=True); pg.wait_for_timeout(3000)
    pg.screenshot(path=str(OUT / 'eco-running.png'))
    pg.set_viewport_size({'width': 1024, 'height': 700}); pg.evaluate("window.ECOSYSTEM_AQUARIUM.setLevel(9)"); pg.wait_for_timeout(500)
    pg.screenshot(path=str(OUT / 'eco-small-screen.png'))
    check(not errors, 'no page errors: %s' % errors[:5])
    b.close()

print('ALL OK' if not problems else 'PROBLEMS: %d' % len(problems))
sys.exit(1 if problems else 0)
