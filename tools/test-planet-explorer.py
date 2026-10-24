#!/usr/bin/env python3
"""Headless test for apps/planet-explorer.html.

Checks the planet facts and the relative values built on them (jump height, weight, tilt), that every level
generates valid quests many times with the right answer worked out again from the facts, the level ladder rule,
that right answers win and wrong ones do not (through the page, with real taps on planets in space), that the jump
on the Moon really goes about 6 times as high and hangs about 6 times as long as on Earth, and that the page throws
no errors. Screenshots go to /tmp/claude-0/tests/.
"""
import pathlib, sys
from playwright.sync_api import sync_playwright

APP = pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'planet-explorer.html'
OUT = pathlib.Path('/tmp/claude-0/tests'); OUT.mkdir(parents=True, exist_ok=True)
problems = []
def check(ok, what):
    print(('ok   ' if ok else 'FAIL ') + what)
    if not ok: problems.append(what)

# NASA Planetary Fact Sheet values the app must carry.
NASA = {'Mercury': (4879, 3.7, 88.0, 0.034), 'Venus': (12104, 8.9, 224.7, 177.4), 'Earth': (12756, 9.8, 365.2, 23.4),
        'Mars': (6792, 3.7, 687.0, 25.2), 'Jupiter': (142984, 23.1, 4331, 3.1), 'Saturn': (120536, 9.0, 10747, 26.7),
        'Uranus': (51118, 8.7, 30589, 97.8), 'Neptune': (49528, 11.0, 59800, 28.3)}

with sync_playwright() as p:
    b = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1366, 'height': 900})
    pg.set_default_timeout(120000)
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.goto(APP.as_uri()); pg.wait_for_timeout(1500)
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(1500)
    X = 'window.PLANET_EXPLORER'

    data = pg.evaluate(X + ".DATA")
    for w, (d, g, y, t) in NASA.items():
        q = data[w]
        check(q['d'] == d and q['g'] == g and q['year'] == y and q['tilt'] == t, '%s facts match NASA (diameter, gravity, year, tilt)' % w)
    order = pg.evaluate(X + ".PLANETS")
    check(order == sorted(order, key=lambda w: data[w]['dist']), 'planets are in order from the Sun')
    r = pg.evaluate("(() => { const E = " + X + "; return { moon: E.jumpFt('Moon'), mars: E.jumpFt('Mars'), jup: E.jumpFt('Jupiter'), earth: E.jumpFt('Earth'), w: E.weightOn('Mars', 50), venus: E.seasonTilt('Venus'), uranus: E.seasonTilt('Uranus') }; })()")
    check(abs(r['moon'] - 6.125) < 0.01 and abs(r['mars'] - 2.65) < 0.01 and abs(r['jup'] - 0.424) < 0.01 and r['earth'] == 1, 'jump heights: Moon %.2f, Mars %.2f, Jupiter %.2f feet for a 1 foot Earth jump' % (r['moon'], r['mars'], r['jup']))
    check(abs(r['w'] - 18.88) < 0.01, '50 pounds on Earth is about 19 on Mars')
    check(abs(r['venus'] - 2.6) < 0.01 and abs(r['uranus'] - 82.2) < 0.01, 'season tilt folds upside-down spins: Venus 2.6, Uranus 82.2')
    r = pg.evaluate("(() => { const E = " + X + ", bad = []; for (const w in E.CLUES) for (const [t, f] of E.CLUES[w]) if (f && !f()) bad.push(t); return bad; })()")
    check(r == [], 'every mystery clue that can be checked against the facts is true %s' % r)

    # Every level makes valid quests, and the answer agrees with the facts.
    r = pg.evaluate("""() => { const E = window.PLANET_EXPLORER, out = [];
      for (let i = 0; i < E.LEVELS.length; i++) { let bad = 0, err = '', n = 0;
        for (let k = 0; k < 300; k++) { try { const q = E.gen(i); n++;
          if (E.recheck(q) !== q.ans) { bad++; err = 'answer ' + q.text + ' ' + q.ans + ' vs ' + E.recheck(q); }
          if (q.kind === 'choice') { if (new Set(q.choices).size !== q.choices.length || !q.choices.includes(q.ans) || q.choices.length < 2 || q.choices.length > 4) { bad++; err = 'choices ' + q.choices; } }
          else if (!E.WORLDS.includes(q.ans)) { bad++; err = 'fly target ' + q.ans; }
          if (!q.text || !q.why || /\\u2014/.test(q.text + q.why)) { bad++; err = 'text'; }
        } catch (e) { bad++; err = String(e); } }
        out.push([i, E.LEVELS[i].name, n, bad, err]); }
      return out; }""")
    for i, name, n, bad, err in r:
        check(bad == 0 and n == 300, 'level %d %s: %d quests, %d bad %s' % (i + 1, name, n, bad, err))

    # Ladder rule.
    r = pg.evaluate("""() => { const E = window.PLANET_EXPLORER; E.setLevel(3); const s = []; const lv = () => E.state.level;
      E.record(true); E.record(true); E.record(true); s.push(lv()); E.record(true); s.push(lv());
      E.record(false); s.push(lv()); E.record(false); s.push(lv());
      E.record(true); E.record(true); E.record(true); E.record(false); E.record(true); s.push(lv());
      E.setLevel(0); E.record(false); E.record(false); s.push(lv());
      E.setLevel(E.LEVELS.length - 1); for (let k = 0; k < 4; k++) E.record(true); s.push(lv()); return s; }""")
    check(r == [3, 4, 4, 3, 3, 0, 9], 'four right moves up, two missed moves down, a miss resets the streak, ends clamp: %s' % r)
    check(pg.evaluate("JSON.parse(localStorage.getItem('planet-explorer-v1')).lv") == 9, 'progress saved under planet-explorer-v1')

    def st():
        return pg.evaluate("(() => { const s = window.PLANET_EXPLORER.state; return { won: s.won, missed: s.missed, streak: s.streak, mode: s.mode, focus: s.focus, stars: s.stars }; })()")
    def tap_planet(w):
        pg.wait_for_timeout(1600)  # let the camera finish flying
        for _ in range(10):
            s = pg.evaluate("(w => { const s = window.PLANET_EXPLORER.planetScreen(w); return [s.x, s.y, document.elementFromPoint(s.x, s.y) === document.getElementById('gl')]; })", w)
            if s[2]: break
            # Something covers the planet: drag the view around the Sun and look again.
            pg.mouse.move(60, 400); pg.mouse.down(); pg.mouse.move(200, 400, steps=6); pg.mouse.up(); pg.wait_for_timeout(200)
        pg.mouse.click(s[0], s[1])
        pg.wait_for_timeout(250)

    # Fly quests: a real tap on the wrong planet is a miss, a tap on the right one wins.
    for i in (0, 1):
        pg.evaluate(X + ".setLevel(%d)" % i)
        ans = pg.evaluate(X + ".state.task.ans")
        if i == 0: pg.wait_for_timeout(1500); pg.screenshot(path=str(OUT / 'planet-space.png'))
        wrong = 'Venus' if ans != 'Venus' else 'Mars'
        tap_planet(wrong); s1 = st()
        check(s1['mode'] == 'planet' and s1['focus'] == wrong and s1['missed'] and not s1['won'], 'level %d: tapping %s flies there and is a miss when %s was asked' % (i + 1, wrong, ans))
        pg.evaluate(X + ".goSpace()"); tap_planet(ans); s2 = st()
        check(s2['won'] and s2['streak'] == 0, 'level %d: tapping %s after a miss wins with no streak' % (i + 1, ans))
        pg.evaluate(X + ".setLevel(%d)" % i); ans = pg.evaluate(X + ".state.task.ans"); tap_planet(ans); pg.evaluate(X + ".stay()"); s3 = st()
        check(s3['mode'] == 'planet' and s3['focus'] == ans, 'level %d: the won screen shows %s up close' % (i + 1, ans))
        check(s3['won'] and s3['streak'] == 1, 'level %d: tapping the right planet first try counts: %s' % (i + 1, s3))
        if i == 1: pg.wait_for_timeout(1200); pg.screenshot(path=str(OUT / 'planet-visit.png'))

    # Choice quests through the answer buttons.
    for i in range(2, 10):
        pg.evaluate(X + ".setLevel(%d)" % i); pg.wait_for_timeout(200)
        q = pg.evaluate(X + ".state.task")
        wrong = [c for c in q['choices'] if c != q['ans']][0]
        pg.click('.ans[data-a="%s"]' % wrong, force=True); pg.wait_for_timeout(150); s1 = st()
        pg.click('.ans[data-a="%s"]' % q['ans'], force=True); pg.wait_for_timeout(150); s2 = st()
        check(s1['missed'] and not s1['won'] and s2['won'] and s2['streak'] == 0, 'level %d: wrong answer is a miss, then the right one wins with no streak' % (i + 1))
        pg.evaluate(X + ".setLevel(%d)" % i); pg.wait_for_timeout(150)
        q = pg.evaluate(X + ".state.task")
        if i == 9: pg.screenshot(path=str(OUT / 'planet-mystery.png'))
        pg.click('.ans[data-a="%s"]' % q['ans'], force=True); pg.evaluate(X + ".stay()"); pg.wait_for_timeout(150); s3 = st()
        same = pg.evaluate("(a => window.PLANET_EXPLORER.state.task.ans === a && !!document.querySelector('.ans.yes[data-a=\"' + a + '\"]') && !!document.getElementById('nextBtn'))", q['ans'])
        check(same, 'level %d: the won screen still shows this quest with the right answer marked' % (i + 1))
        check(s3['won'] and s3['streak'] == 1, 'level %d: right answer first try counts' % (i + 1))
        if i == 2: pg.screenshot(path=str(OUT / 'planet-win.png'))

    # Jump on Earth and on the Moon: the same push goes about 6 times as high and hangs about 6 times as long.
    r = pg.evaluate("(() => { const E = window.PLANET_EXPLORER, e = E.jumpPlan('Earth'), m = E.jumpPlan('Moon'), j = E.jumpPlan('Jupiter'); return [m.h / e.h, m.T / e.T, e.T, j.h / e.h]; })()")
    check(abs(r[0] - 6.125) < 0.01 and abs(r[1] - 6.125) < 0.01 and abs(r[2] - 998) < 5 and abs(r[3] - 0.424) < 0.01, 'jump plan: Moon %.2f times as high and %.2f times as long, Earth flight %d ms in slow motion, Jupiter %.2f as high' % (r[0], r[1], r[2], r[3]))
    for w in ('Earth', 'Moon'):
        pg.evaluate(X + ".setLevel(3)"); pg.evaluate("w => window.PLANET_EXPLORER.land(w)", w); pg.wait_for_timeout(300)
        pg.click('text=Jump!', force=True)
        if w == 'Moon':
            pg.wait_for_timeout(2600); pg.screenshot(path=str(OUT / 'planet-moon-jump.png'))
        pg.wait_for_function("!window.PLANET_EXPLORER.state.jumping", timeout=60000)
        seen = pg.evaluate(X + ".state.jumpsSeen")
        check(w in seen and abs(seen[w] - (6.125 if w == 'Moon' else 1)) < 0.01, 'a jump on %s lands and logs %s feet' % (w, seen.get(w)))
    pg.evaluate(X + ".showCompare(['Earth', 'Mars'])"); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / 'planet-compare.png'))
    pg.set_viewport_size({'width': 1024, 'height': 700}); pg.evaluate(X + ".setLevel(9)"); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / 'planet-small-screen.png'))
    check(not errors, 'no page errors: %s' % errors[:5])
    b.close()

print('ALL OK' if not problems else 'PROBLEMS: %d' % len(problems))
sys.exit(1 if problems else 0)
