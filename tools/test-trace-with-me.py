"""Checks Trace With Me: every level makes sound items, all 26 cursive letters exist and join, the level rule
works, the letter matcher accepts letters written in many ways and turns most wrong letters down, and tracing with a
pointer completes cursive and spelling items through the page. Run: python3 tools/test-trace-with-me.py"""
import pathlib, random, sys
from playwright.sync_api import sync_playwright

APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'trace-with-me.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)

CONTENT = r"""
() => {
  const out = [], bad = v => !Number.isFinite(v);
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  for (const ch of letters) {
    if (!TRACE.CURSIVE[ch]) out.push('no cursive ' + ch);
    if (!TRACE.PRINT[ch]) out.push('no print ' + ch);
    for (const st of TRACE.cursiveWord(ch)) if (st.length < 2 || st.some(p => bad(p[0]) || bad(p[1]))) out.push('cursive points ' + ch);
    for (const st of TRACE.printLetter(ch)) if (!st.length || st.some(p => bad(p[0]) || bad(p[1]))) out.push('print points ' + ch);
  }
  const words = new Set();
  TRACE.SPELL.forEach((lv, i) => lv.words.forEach(w => { words.add(w.word); if (!/^[a-z]+$/.test(w.word)) out.push(`spell L${i + 1} word ${w.word}`); if (!w.emoji) out.push('no emoji ' + w.word); if (/undefined|NaN/.test(JSON.stringify(w))) out.push('bad ' + w.word); }));
  TRACE.CURSIVE_LEVELS.forEach(lv => (lv.words ? lv.words.split(',') : lv.letters.split('')).forEach(w => words.add(w)));
  for (const w of words) { const st = TRACE.cursiveWord(w); if (st.flat().some(p => bad(p[0]) || bad(p[1]))) out.push('cursive word ' + w); }
  const P = TRACE.P(), levels = { spell: TRACE.SPELL.length, cursive: TRACE.CURSIVE_LEVELS.length };
  for (const [m, n] of Object.entries(levels)) for (let l = 0; l < n; l++) { P.lv[m] = l; for (let k = 0; k < 60; k++) { const it = TRACE.makeItem(m); if (!it || /undefined|NaN/.test(JSON.stringify(it))) { out.push(`${m} L${l + 1} item ${JSON.stringify(it)}`); break; } } }
  return { problems: out, words: words.size };
}
"""

# Letters "written" by a child: the school strokes (or another accepted form) moved, scaled, sheared, rotated and wobbled.
SYNTH = r"""
([n, seed]) => {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, r = (a, b) => a + (b - a) * rnd();
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const forms = ch => [TRACE.PRINT[ch].d, ...(TRACE.PRINT_ALT[ch] || [])];
  const write = ch => {
    const f = forms(ch); const d = f[Math.floor(rnd() * f.length)];
    const sc = r(0.75, 1.25), sx = sc * r(0.85, 1.15), sh = r(-0.2, 0.2), rot = r(-0.12, 0.12), dx = r(-15, 15), dy = r(-15, 15), cx = 50, cy = 150;
    return d.map(p => TRACE.samplePath(p, p.length < 16 ? 2 : 4).map(([x, y]) => {
      let X = (x - cx) * sx + sh * (y - cy), Y = (y - cy) * sc; const c = Math.cos(rot), si = Math.sin(rot);
      return [cx + X * c - Y * si + dx + r(-3, 3), cy + X * si + Y * c + dy + r(-3, 3)];
    }));
  };
  let right = 0, wrongRejected = 0, total = 0; const misses = {};
  for (let k = 0; k < n; k++) for (const ch of letters) {
    total++;
    if (TRACE.recognize(write(ch), ch).ok) right++; else misses[ch] = (misses[ch] || 0) + 1;
    let other; do { other = letters[Math.floor(rnd() * 26)]; } while (other === ch);
    if (!TRACE.recognize(write(other), ch).ok) wrongRejected++;
  }
  return { accept: right / total, reject: wrongRejected / total, misses };
}
"""

def draw(pg, pts):
    pg.mouse.move(*pts[0]); pg.mouse.down()
    for p in pts[1:]: pg.mouse.move(*p)
    pg.mouse.up()

def main():
    problems = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1440, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(APP); pg.wait_for_timeout(300)
        c = pg.evaluate(CONTENT)
        print('content: words', c['words'], 'problems', c['problems'][:10]); problems += c['problems']
        rule = pg.evaluate("""() => { const P = TRACE.P(), r = TRACE.record, out = []; P.lv.spell = 3; P.st = {};
            r('spell', true); r('spell', true); r('spell', true); out.push(P.lv.spell); r('spell', true); out.push(P.lv.spell);
            r('spell', false); out.push(P.lv.spell); r('spell', true); r('spell', false); out.push(P.lv.spell); r('spell', false); out.push(P.lv.spell);
            P.lv.spell = 0; r('spell', false); r('spell', false); out.push(P.lv.spell); P.lv.spell = 3; P.st = {}; return out; }""")
        print('level rule:', rule)
        if rule != [3, 4, 4, 4, 3, 0]: problems.append(f'level rule {rule}')
        m = pg.evaluate(SYNTH, [40, 12345])
        print('letter matcher: accepts %.1f%% of written letters, turns down %.1f%% of wrong letters; misses %s' % (m['accept'] * 100, m['reject'] * 100, m['misses']))
        if m['accept'] < 0.95: problems.append(f"matcher accepts only {m['accept']:.2f}")
        if m['reject'] < 0.55: problems.append(f"matcher rejects only {m['reject']:.2f}")

        pg.evaluate("() => { TRACE.opts.gradeMs = 250; TRACE.opts.lookMs = 300; }")
        # Cursive: trace the guide with the mouse, every level.
        for lv in range(len(pg.evaluate("() => TRACE.CURSIVE_LEVELS"))):
            pg.evaluate(f"() => {{ const P = TRACE.P(); P.lv.cursive = {lv}; P.st = {{}}; TRACE.setMode('cursive'); }}"); pg.wait_for_timeout(150)
            if lv in (0, 4): pg.screenshot(path=str(SHOTS / f'tw-cursive-{lv + 1}.png'))
            txt = pg.evaluate("() => TRACE.current().text")
            for st in pg.evaluate("() => TRACE.clientGuides()[0]"): draw(pg, st)
            pg.wait_for_timeout(60)
            won = pg.evaluate("() => document.getElementById('win').classList.contains('on')")
            print(f'cursive L{lv + 1} "{txt}": traced ->', 'win' if won else 'NO WIN')
            if not won: problems.append(f'cursive L{lv + 1} {txt}: tracing did not win')
        # A scribble across the board is not a trace.
        pg.evaluate("() => { const P = TRACE.P(); P.lv.cursive = 4; TRACE.setMode('cursive'); }"); pg.wait_for_timeout(150)
        box = pg.evaluate("() => { const r = document.getElementById('w').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
        random.seed(3)
        for k in range(14):
            draw(pg, [(box[0] + random.uniform(.05, .95) * box[2], box[1] + random.uniform(.15, .9) * box[3]) for _ in range(12)])
        if pg.evaluate("() => document.getElementById('win').classList.contains('on')"): problems.append('scribble won in cursive')
        else: print('scribble: no win (right)')

        # Spell: trace each letter, then write it from memory in the boxes.
        for lv in (0, 3, 6, 7):
            pg.evaluate(f"() => {{ const P = TRACE.P(); P.lv.spell = {lv}; P.st = {{}}; TRACE.setMode('spell'); }}"); pg.wait_for_timeout(200)
            it = pg.evaluate("() => TRACE.current()")
            if it['trace']:
                if lv == 3: pg.screenshot(path=str(SHOTS / 'tw-spell-trace.png'))
                for letter in pg.evaluate("() => TRACE.clientGuides()"):
                    for st in letter: draw(pg, st)
                pg.wait_for_timeout(1300)
            else:
                pg.wait_for_timeout(500)
            ph = pg.evaluate("() => TRACE.phase()")
            if ph != 'write': problems.append(f'spell L{lv + 1} {it["word"]}: phase {ph} after tracing'); continue
            # A wrong letter in the first box is turned down.
            word = it['word']; wrong = 'o' if word[0] not in 'oacegq' else 'l'
            for st in pg.evaluate(f"() => TRACE.toClient(0, TRACE.printLetter('{wrong}'))"): draw(pg, st)
            pg.wait_for_timeout(400)
            st0 = pg.evaluate("() => TRACE.boxes()[0]")
            if st0['state'] != 'retry': problems.append(f'spell {word}: wrong letter {wrong} gave {st0}')
            for i, ch in enumerate(word):
                strokes = pg.evaluate(f"() => TRACE.printLetter('{ch}').map(s => s.map(([x, y]) => [x * 0.92 + 6, y * 0.95 + 8]))")
                for st in pg.evaluate("([i, s]) => TRACE.toClient(i, s)", [i, strokes]): draw(pg, st)
                pg.wait_for_timeout(350)
            if lv == 7: pg.screenshot(path=str(SHOTS / 'tw-spell-write.png'))
            boxes = pg.evaluate("() => TRACE.boxes()")
            won = pg.evaluate("() => document.getElementById('win').classList.contains('on')")
            print(f'spell L{lv + 1} "{word}": wrong first letter -> {st0["state"]}; written ->', 'win' if won else 'NO WIN ' + str([(x['ch'], x['state'], x['last']) for x in boxes]))
            if not won: problems.append(f'spell {word} did not win')
            if won and pg.evaluate("() => TRACE.P().st.spell.miss") != 1: problems.append('spell: the retry did not count as a miss')
        pg.evaluate("() => TRACE.setMode('little')"); pg.wait_for_timeout(300)
        # Little: thin school print on handwriting lines. Every item has guides; tracing them in order wins,
        # a scribble beside the letter does not, and stopping after the first stroke does not.
        decks = pg.evaluate("() => ({ upper: 26, lower: 26, numbers: 10, shapes: 6 })")
        for deck, n in decks.items():
            for i in range(n):
                pg.evaluate("([d, i]) => TRACE.littleLoad(d, i)", [deck, i])
                gs = pg.evaluate("() => TRACE.littleClient()")
                if not gs or any(len(st) < 2 for st in gs) and deck == 'shapes': problems.append(f'little {deck} {i}: no guides'); continue
                ys = [p[1] for st in pg.evaluate("() => TRACE.littleGuides()") for p in st]
                if min(ys) < 0 or max(ys) > 1000: problems.append(f'little {deck} {i}: guide off the page')
                if i == 0 or (deck == 'lower' and i in (6, 9)):   # also: a scribble far from the letter
                    pg.mouse.move(60, 60); pg.mouse.down(); pg.mouse.move(70, 120, steps=6); pg.mouse.up()
                    if pg.evaluate("() => TRACE.littleWon()"): problems.append(f'little {deck} {i}: scribble won')
                    pg.evaluate("([d, i]) => TRACE.littleLoad(d, i)", [deck, i])
                for k, st in enumerate(gs):
                    draw(pg, st)
                    if k == 0 and len(gs) > 1 and pg.evaluate("() => TRACE.littleWon()"): problems.append(f'little {deck} {i}: won after one stroke')
                if not pg.evaluate("() => TRACE.littleWon()"): problems.append(f'little {deck} {i}: tracing did not win (next {pg.evaluate("() => TRACE.littleNext()")})')
        print('little: traced', sum(decks.values()), 'items')
        for deck, i, name in [('upper', 0, 'A'), ('upper', 4, 'E'), ('lower', 6, 'g'), ('numbers', 5, '5'), ('shapes', 3, 'heart')]:
            pg.evaluate("([d, i]) => TRACE.littleLoad(d, i)", [deck, i]); pg.wait_for_timeout(150)
            pg.screenshot(path=str(SHOTS / f'tw-little-{name}.png'))
        pg.evaluate("() => TRACE.littleLoad('upper', 1)"); gs = pg.evaluate("() => TRACE.littleClient()"); draw(pg, gs[0])
        pg.screenshot(path=str(SHOTS / 'tw-little-B-half.png'))
        print('page errors:', errs); problems += errs
        b.close()
    print('PROBLEMS:' if problems else 'ALL OK', problems[:20])
    sys.exit(1 if problems else 0)

main()
