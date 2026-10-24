"""Checks Read It Say It Make It: every level makes sound sentences whose words the offline listener knows and whose
scenes play without errors; the level rule; tap, trust and microphone modes win only when the sentence is read; and the
real offline listener (Vosk) hears a spoken sentence. The spoken sentence is made with espeak-ng and fed in as a fake
microphone. Run: python3 tools/test-read-it-say-it.py   (needs espeak-ng and ffmpeg for the listening part)"""
import json, pathlib, shutil, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'read-it-say-it' / 'index.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)
ARGS = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']

GEN = r"""
(N) => {
  const R = window.READ_IT_SAY_IT, vocab = R.speech.vocab, out = { problems: [], counts: {}, samples: {}, scenes: [] };
  const RANGE = [[3, 3], [4, 4], [5, 6], [6, 8], [9, 13], [9, 16], [8, 14], [12, 18]];
  R.LEVELS.forEach((lv, i) => {
    const tag = `L${i + 1} ${lv.name}`; out.counts[tag] = 0; out.samples[tag] = [];
    for (let k = 0; k < N; k++) {
      let t; try { t = lv.gen(); } catch (e) { out.problems.push(`${tag}: threw ${e.message}`); break; }
      out.counts[tag]++; if (k < 3) out.samples[tag].push(t.text);
      const where = `${tag}: ${t.text}`;
      if (!/^[A-Z][a-z ,']+\.$/.test(t.text) || /  |undefined|null|\u2014/.test(t.text)) out.problems.push(`${where}: bad text`);
      const n = t.words.length; if (n < RANGE[i][0] || n > RANGE[i][1]) out.problems.push(`${where}: ${n} words`);
      for (const w of t.words) { const x = R.speech.norm(w); if (!vocab.has(x)) out.problems.push(`${where}: listener does not know "${x}"`); }
      const sc = t.scene; if (!sc || !sc.actors.length || !sc.steps.length) out.problems.push(`${where}: no scene`);
      for (const a of sc.actors) if (!Kit.models[a.model]) out.problems.push(`${where}: no model ${a.model}`);
      for (const s of sc.steps) { if (!sc.actors[s.a]) out.problems.push(`${where}: step actor`); if (s.place && !Kit.models[s.place]) out.problems.push(`${where}: no place ${s.place}`); if (s.rel && !s.place) out.problems.push(`${where}: rel without place`); }
      const count = { two: 2, three: 3, four: 4 }[t.words[0].toLowerCase()] || { two: 2, three: 3, four: 4 }[t.words.find(w => ['two', 'three', 'four'].includes(w))];
      if (count && !sc.actors.some(a => a.count === count)) out.problems.push(`${where}: count not in the scene`);
      if (k < 6) out.scenes.push(sc);
    }
  });
  return out;
}
"""

PLAY_ALL = r"""
async (scenes) => { const R = window.READ_IT_SAY_IT, errs = [];
  for (const sc of scenes) { try { await Promise.race([R.playNow(sc), new Promise(r => setTimeout(r, 2500))]); } catch (e) { errs.push(e.message); } }
  return errs.concat(R.errors); }
"""

def state(pg): return pg.evaluate("window.READ_IT_SAY_IT.state()")

def wav_for(text, path):
    raw = path.with_suffix('.raw.wav'); sil = path.with_suffix('.sil.wav')
    subprocess.run(['espeak-ng', '-s', '135', '-w', str(raw), text], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', '1.2', str(sil)], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(sil), '-i', str(raw), '-i', str(sil), '-i', str(sil), '-i', str(sil), '-filter_complex', '[0][1][2][3][4]concat=n=5:v=0:a=1',
                    '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', str(path)], check=True)

def listen_case(p, task, text, want_win, tmp, name):
    """Open the app with a fake microphone that says text, set the task, tap the microphone and see what happens."""
    wav = tmp / f'{name}.wav'; wav_for(text, wav)
    b = p.chromium.launch(args=ARGS + ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={wav}%noloop'])
    pg = b.new_page(viewport={'width': 1440, 'height': 960}); errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(APP); pg.evaluate("localStorage.clear()")
    pg.wait_for_function("window.READ_IT_SAY_IT.state().speech === 'ready'", timeout=60000)
    pg.evaluate("t => { window.READ_IT_SAY_IT.hold = true; window.READ_IT_SAY_IT.useTask(t); }", task)
    pg.click('#mic')
    pg.wait_for_timeout(1500); pg.screenshot(path=str(SHOTS / f'risi-{name}-listening.png'))
    try:
        pg.wait_for_function("window.READ_IT_SAY_IT.state().phase === 'won'", timeout=4000 + int(len(text.split()) * 900 + 4000))
        won = True
    except Exception:
        won = False
    st = state(pg)
    if won: pg.wait_for_timeout(3500)
    pg.screenshot(path=str(SHOTS / f'risi-{name}-result.png'))
    b.close()
    return won, st, errors

def main():
    fails, notes = [], []
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS + ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])  # a fake microphone that only beeps
        pg = b.new_page(viewport={'width': 1440, 'height': 960}); errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(APP); pg.evaluate("localStorage.clear()"); pg.reload()
        pg.wait_for_timeout(400); pg.screenshot(path=str(SHOTS / 'risi-loading.png'))
        ms = pg.evaluate("""() => new Promise(r => { const t0 = performance.now(); const c = () => window.READ_IT_SAY_IT.state().speech === 'ready' ? r(performance.now() - t0) : window.READ_IT_SAY_IT.state().speech === 'failed' ? r(-1) : setTimeout(c, 100); c(); })""")
        if ms < 0: fails.append('offline listener failed to load: ' + pg.evaluate("window.READ_IT_SAY_IT.speech.error"))
        else: notes.append(f'offline listener ready in {ms / 1000:.1f} s after the page script ran (headless, x86)')
        pg.evaluate("window.READ_IT_SAY_IT.hold = true")
        st = state(pg)
        if st['level'] != 2: fails.append(f'new player starts at level {st["level"] + 1}, wanted 3')
        if st['mode'] != 'mic': fails.append(f'with the listener ready the mode is {st["mode"]}')
        g = pg.evaluate(GEN, 400)
        for k, v in g['counts'].items(): print(f'  {k}: {v} sentences, e.g. {g["samples"][k][0]!r}')
        fails += g['problems'][:25]
        errs = pg.evaluate(PLAY_ALL, g['scenes'])
        fails += ['scene error: ' + e for e in errs[:10]]

        rule = pg.evaluate("""() => { const R = window.READ_IT_SAY_IT, P = R.P(), out = [];
          R.setLevel(3); for (let i = 0; i < 4; i++) R.record(true); out.push(P.lv);
          R.record(false); out.push(P.lv); R.record(false); out.push(P.lv);
          R.setLevel(3); R.record(true); R.record(true); R.record(true); R.record(false); R.record(true); out.push(P.lv);
          R.setLevel(0); R.record(false); R.record(false); out.push(P.lv);
          R.setLevel(7); for (let i = 0; i < 8; i++) R.record(true); out.push(P.lv); return out; }""")
        if rule != [4, 4, 3, 3, 0, 7]: fails.append(f'level rule gave {rule}, wanted [4, 4, 3, 3, 0, 7]')

        # Microphone mode with a made-up transcript: part of the sentence does not win, all of it does.
        pg.evaluate("window.READ_IT_SAY_IT.setLevel(3)"); t = pg.evaluate("window.READ_IT_SAY_IT.current()")
        words = [w.lower().strip('.,') for w in t['words']]
        pg.evaluate("w => window.READ_IT_SAY_IT.heard(w, false)", ' '.join(words[:len(words) // 2]))
        if state(pg)['phase'] != 'read': fails.append('half a sentence won')
        pg.evaluate("w => window.READ_IT_SAY_IT.heard(w, false)", 'banana kite pizza moon')
        if state(pg)['phase'] != 'read': fails.append('wrong words won')
        s0 = state(pg)
        pg.evaluate("w => window.READ_IT_SAY_IT.heard(w, true)", ' '.join(words))
        s1 = state(pg)
        if s1['phase'] != 'won' or s1['streak'] != s0['streak'] + 1 or s1['stars'] != s0['stars'] + 1: fails.append(f'the whole sentence did not win {s1}')
        pg.wait_for_timeout(2500); pg.screenshot(path=str(SHOTS / 'risi-scene-L4.png'))
        # Time running out is a miss; then reading it still wins but gives no streak.
        pg.evaluate("window.READ_IT_SAY_IT.timeScale = 0.02; window.READ_IT_SAY_IT.newRound()")
        pg.evaluate("window.READ_IT_SAY_IT.startListening()")
        pg.wait_for_timeout(1200)
        s2 = state(pg)
        if not s2['missed'] or s2['miss'] != 1 or s2['phase'] != 'read' or s2['listening']: fails.append(f'time running out was not a miss {s2}')
        pg.screenshot(path=str(SHOTS / 'risi-timeup.png'))
        t = pg.evaluate("window.READ_IT_SAY_IT.current()")
        pg.evaluate("w => window.READ_IT_SAY_IT.heard(w, true)", ' '.join(w.lower().strip('.,') for w in t['words']))
        s3 = state(pg)
        if s3['phase'] != 'won' or s3['streak'] != 0: fails.append(f'win after a miss counted as first try {s3}')
        pg.evaluate("window.READ_IT_SAY_IT.timeScale = 1")
        # Needing "Hear it" first is a miss.
        pg.evaluate("window.READ_IT_SAY_IT.newRound()"); pg.click('#listen')
        if not state(pg)['missed']: fails.append('Hear it before reading was not a miss')

        # Tap mode: in order wins, out of order does not.
        pg.evaluate("window.READ_IT_SAY_IT.setMode('tap'); window.READ_IT_SAY_IT.setLevel(5)")
        if state(pg)['mode'] != 'tap' or pg.is_visible('#mic'): fails.append('tap mode still shows the microphone')
        t = pg.evaluate("window.READ_IT_SAY_IT.current()")
        pg.click('.w[data-i="2"]')
        if any(state(pg)['got']): fails.append('tapping the third word first counted')
        for i in range(len(t['words'])):
            pg.click(f'.w[data-i="{i}"]')
            if i == 3: pg.screenshot(path=str(SHOTS / 'risi-tap.png'))
        if state(pg)['phase'] != 'won' or state(pg)['streak'] != 1: fails.append(f'tapping every word did not win {state(pg)}')
        pg.wait_for_timeout(3000); pg.screenshot(path=str(SHOTS / 'risi-scene-L6.png'))
        # Four right in a row moves up, through the page.
        pg.evaluate("window.READ_IT_SAY_IT.setLevel(5)")
        for k in range(4):
            pg.evaluate("window.READ_IT_SAY_IT.newRound()"); n = len(pg.evaluate("window.READ_IT_SAY_IT.current().words"))
            for i in range(n): pg.click(f'.w[data-i="{i}"]')
        if state(pg)['level'] != 6: fails.append(f'four right did not level up {state(pg)}')
        for k in range(2):
            pg.evaluate("window.READ_IT_SAY_IT.newRound()"); pg.click('#listen')
        if state(pg)['level'] != 5: fails.append(f'two misses did not level down {state(pg)}')
        # Trust mode: one button.
        pg.evaluate("window.READ_IT_SAY_IT.setMode('trust'); window.READ_IT_SAY_IT.setLevel(6)")
        if not pg.is_visible('#trust'): fails.append('trust mode has no I read it button')
        pg.screenshot(path=str(SHOTS / 'risi-trust.png'))
        pg.click('#trust')
        if state(pg)['phase'] != 'won': fails.append('I read it did not win')
        pg.wait_for_timeout(3500); pg.screenshot(path=str(SHOTS / 'risi-scene-L7.png'))
        # The grown-up switch opens only on a long press.
        pg.click('#gear')
        if pg.is_visible('#parent'): fails.append('a short tap opened the grown-up switch')
        box = pg.locator('#gear').bounding_box(); pg.mouse.move(box['x'] + 20, box['y'] + 20); pg.mouse.down(); pg.wait_for_timeout(1700); pg.mouse.up()
        if not pg.is_visible('#parent'): fails.append('a long press did not open the grown-up switch')
        pg.screenshot(path=str(SHOTS / 'risi-parent.png'))
        pg.click('#parent button[data-mode="auto"]')
        if state(pg)['mode'] != 'mic': fails.append('switching back to the microphone did not work')
        saved = pg.evaluate("JSON.parse(localStorage.getItem('read-it-say-it-v1'))")
        if saved['mode'] != 'auto': fails.append('mode not saved')
        pg.set_viewport_size({'width': 1024, 'height': 700}); pg.evaluate("window.READ_IT_SAY_IT.setLevel(7)"); pg.wait_for_timeout(500)
        pg.screenshot(path=str(SHOTS / 'risi-small.png'))
        if pg.evaluate("document.body.scrollWidth > innerWidth || document.getElementById('words').getBoundingClientRect().bottom > innerHeight * 0.6"): fails.append('long sentence does not fit at 1024x700')
        task4 = pg.evaluate("window.READ_IT_SAY_IT.gen(3)"); task6 = pg.evaluate("window.READ_IT_SAY_IT.gen(5)"); task8 = pg.evaluate("window.READ_IT_SAY_IT.gen(7)")
        fails += ['page error: ' + e for e in errors]
        b.close()

        # The real offline listener with a spoken sentence through a fake microphone.
        if shutil.which('espeak-ng') and shutil.which('ffmpeg'):
            with tempfile.TemporaryDirectory() as td:
                tmp = pathlib.Path(td)
                for name, task in [('right4', task4), ('right6', task6), ('right8', task8)]:
                    won, st, errs = listen_case(p, task, task['text'], True, tmp, name)
                    notes.append(f'spoken "{task["text"]}": {"won" if won else "not heard"} (heard {sum(st["got"])}/{len(st["got"])} words)')
                    if not won: fails.append(f'the listener did not hear "{task["text"]}": {st}')
                    fails += ['page error: ' + e for e in errs]
                other = 'My grandma likes to bake cookies with chocolate chips on Sunday.'
                won, st, errs = listen_case(p, task4, other, False, tmp, 'wrong')
                notes.append(f'spoken a different sentence for "{task4["text"]}": {"won (bad)" if won else "not accepted"} (matched {sum(st["got"])}/{len(st["got"])} words)')
                if won: fails.append('a different spoken sentence won')
                fails += ['page error: ' + e for e in errs]
        else:
            notes.append('espeak-ng or ffmpeg missing: real listening not tested')
    print('\n'.join('  ' + n for n in notes))
    print('\n'.join(fails) if fails else 'ALL OK')
    sys.exit(1 if fails else 0)

main()
