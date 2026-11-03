"""Checks Read It Say It Make It: every sentence level makes sound sentences whose words the offline listener knows and
whose scenes play without errors; every passage level (grade 2 to young adult) has sound passages, scene cues, word
meanings and questions, and gets harder level by level; the level rule; tap, trust and microphone modes win only when
the sentence or passage is read; the comprehension quiz; and the real offline listener (Vosk) hears a spoken sentence
and a spoken passage. The spoken sentence is made with espeak-ng and fed in as a fake
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
  R.LEVELS.slice(0, R.SENTENCE_LEVELS).forEach((lv, i) => {
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

PASSAGES = r"""
() => {
  const R = window.READ_IT_SAY_IT, out = { problems: [], tiers: [] };
  R.errors.length = 0;
  R.LEVELS.forEach((lv, i) => {
    if (!lv.passage) return;
    const tier = { level: i + 1, name: lv.name, grade: lv.grade, passages: [] }; out.tiers.push(tier);
    if (lv.pool.length < 3) out.problems.push(`L${i + 1}: only ${lv.pool.length} passages`);
    for (const t of lv.pool) {
      const where = `L${i + 1} ${t.title}`, src = t.src;
      if (/—|\||  |undefined/.test(t.text)) out.problems.push(`${where}: bad text`);
      if (!/[.!?]['’"]?$/.test(t.text)) out.problems.push(`${where}: does not end a sentence`);
      if (t.words.length < 25 || t.words.length > 130) out.problems.push(`${where}: ${t.words.length} words`);
      t.chunks.forEach((c, k) => { if (c.b - c.a < 1 || c.b - c.a > 40) out.problems.push(`${where}: part ${k + 1} has ${c.b - c.a} words`); });
      if ((src.cues || []).length !== t.chunks.length) out.problems.push(`${where}: ${(src.cues || []).length} cues for ${t.chunks.length} parts`);
      const oov = t.words.filter(w => w.split(/[-–]/).some(x => R.speech.norm(x) && !R.speech.known(x)));
      if (oov.length > Math.max(2, t.words.length * 0.05)) out.problems.push(`${where}: the listener cannot hear ${oov.join(', ')}`);
      const keys = new Set(t.words.map(w => String(w).toLowerCase().replace(/’/g, "'").replace(/^[^a-z]+|[^a-z]+$/g, '').replace(/'s$/, '')));
      const gl = Object.keys(t.gloss); if (gl.length < 2) out.problems.push(`${where}: only ${gl.length} word meanings`);
      for (const k of gl) if (!keys.has(k)) out.problems.push(`${where}: meaning for "${k}" but the word is not in the passage`);
      if (t.quiz.length !== 3) out.problems.push(`${where}: ${t.quiz.length} questions`);
      for (const q of t.quiz) if (q.length !== 4 || new Set(q.slice(1)).size !== 3 || q.some(x => typeof x !== 'string' || !x.trim())) out.problems.push(`${where}: bad question ${JSON.stringify(q)}`);
      for (const c of t.chunks) R.cue(c.cue);
      tier.passages.push({ title: t.title, text: t.text, words: t.words.length, parts: t.chunks.length, oov: oov.length });
      Kit.clear(true);
    }
  });
  out.problems.push(...R.errors.map(e => 'cue: ' + e));
  if (/—/.test(JSON.stringify(window.RISI_PASSAGES.map(t => t.list.map(p => [p.quiz, p.gloss]))))) out.problems.push('a question or meaning has an em-dash');
  return out;
}
"""

def syllables(w):
    w = ''.join(c for c in w.lower() if c.isalpha())
    if not w: return 0
    groups, prev = 0, False
    for c in w:
        v = c in 'aeiouy'
        if v and not prev: groups += 1
        prev = v
    if w.endswith('e') and not w.endswith(('le', 'ee')) and groups > 1: groups -= 1
    return max(1, groups)

def fk_grade(text):
    """Flesch-Kincaid grade level: a rough measure of how hard a passage is to read."""
    import re
    sents = max(1, len(re.findall(r'[.!?]+', text)))
    words = [w for w in text.split() if any(c.isalpha() for c in w)]
    syl = sum(syllables(w) for w in words)
    return 0.39 * len(words) / sents + 11.8 * syl / len(words) - 15.59

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
    st = state(pg); st['load'] = pg.evaluate("(l => l && l.audio ? l.work / l.audio : 0)(window.READ_IT_SAY_IT.speech.load)"); st['heard'] = pg.evaluate("window.READ_IT_SAY_IT.heardText || ''")
    if won: pg.wait_for_timeout(3500)
    pg.screenshot(path=str(SHOTS / f'risi-{name}-result.png'))
    b.close()
    return won, st, errors

def passage_wav(parts, path):
    """Each reading part spoken, with a short breath between parts, like a child reading sentence by sentence."""
    files = []
    sil = path.with_suffix('.sil.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', '0.9', str(sil)], check=True)
    files.append(sil); files.append(sil)
    for k, text in enumerate(parts):
        f = path.with_suffix(f'.{k}.wav'); subprocess.run(['espeak-ng', '-s', '140', '-w', str(f), text], check=True); files += [f, sil]
    files += [sil, sil, sil]
    args = ['ffmpeg', '-y', '-loglevel', 'error']
    for f in files: args += ['-i', str(f)]
    args += ['-filter_complex', ''.join(f'[{i}]' for i in range(len(files))) + f'concat=n={len(files)}:v=0:a=1', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', str(path)]
    subprocess.run(args, check=True)

def passage_listen_case(p, task, tmp, spoken=None, wait=None):
    """A whole passage spoken through a fake microphone, one tap on the microphone: every part must be heard in turn.
    spoken: a different passage to say instead (it must not be accepted)."""
    parts = [' '.join((spoken or task)['words'][c['a']:c['b']]) for c in (spoken or task)['chunks']]
    wav = tmp / 'passage.wav'; passage_wav(parts, wav)
    secs = 3 + sum(len(x.split()) * 0.45 + 1.0 for x in parts)
    b = p.chromium.launch(args=ARGS + ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={wav}%noloop'])
    pg = b.new_page(viewport={'width': 1440, 'height': 960}); errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(APP); pg.evaluate("localStorage.clear()")
    pg.wait_for_function("window.READ_IT_SAY_IT.state().speech === 'ready'", timeout=60000)
    pg.evaluate("t => { window.READ_IT_SAY_IT.hold = true; window.READ_IT_SAY_IT.useTask(t); }", task)
    pg.click('#mic')
    try:
        pg.wait_for_function("window.READ_IT_SAY_IT.state().phase === 'quiz'", timeout=wait or int(secs * 1000) + 15000); ok = True
    except Exception:
        ok = False
    st = state(pg); st['load'] = pg.evaluate("(l => l && l.audio ? l.work / l.audio : 0)(window.READ_IT_SAY_IT.speech.load)"); st['gap'] = pg.evaluate("(window.READ_IT_SAY_IT.speech.load || {}).gap"); st['heard'] = pg.evaluate("window.READ_IT_SAY_IT.heardText || ''"); pg.wait_for_timeout(1200)
    pg.screenshot(path=str(SHOTS / ('risi-passage-spoken-%s.png' % ('wrong' if spoken else task['title'].split()[0].lower()))))
    b.close()
    return ok, st, errors, len(parts)

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

        # Passage levels: content checks, and the reading level rises from tier to tier.
        pz = pg.evaluate(PASSAGES)
        fails += pz['problems'][:25]
        # Readability formulas are rough (old books have very long sentences), so the check is on the shape: the first
        # level reads at about grade 2, the top level at young adult, and each third of the levels is harder than the last.
        avgs = []
        for t in pz['tiers']:
            grades = [fk_grade(x['text']) for x in t['passages']]; avg = sum(grades) / len(grades); avgs.append(avg)
            print(f"  L{t['level']} {t['name']} (grade {t['grade']}): {len(t['passages'])} passages, {min(x['words'] for x in t['passages'])} to {max(x['words'] for x in t['passages'])} words, reading level {avg:.1f}")
        if len(avgs) < 8: fails.append(f"only {len(avgs)} passage levels")
        k = len(avgs) // 3; thirds = [sum(a) / len(a) for a in (avgs[:k], avgs[k:2 * k], avgs[2 * k:])]
        if not thirds[0] < thirds[1] < thirds[2]: fails.append(f'passage levels do not get harder: thirds read at {thirds}')
        if avgs[0] > 3: fails.append(f'the first passage level reads at grade {avgs[0]:.1f}, wanted about 2')
        if avgs[-1] < 9: fails.append(f'the top level reads at grade {avgs[-1]:.1f}, wanted young adult (9 or more)')
        notes.append(f"{len(avgs)} passage levels, {sum(len(t['passages']) for t in pz['tiers'])} passages; reading level by thirds {', '.join(f'{x:.1f}' for x in thirds)}; top level {avgs[-1]:.1f}")

        rule = pg.evaluate("""() => { const R = window.READ_IT_SAY_IT, P = R.P(), out = [];
          R.setLevel(3); for (let i = 0; i < 4; i++) R.record(true); out.push(P.lv);
          R.record(false); out.push(P.lv); R.record(false); out.push(P.lv);
          R.setLevel(3); R.record(true); R.record(true); R.record(true); R.record(false); R.record(true); out.push(P.lv);
          R.setLevel(0); R.record(false); R.record(false); out.push(P.lv);
          R.setLevel(7); for (let i = 0; i < 4; i++) R.record(true); out.push(P.lv);
          const top = R.LEVELS.length - 1; R.setLevel(top); for (let i = 0; i < 8; i++) R.record(true); out.push(P.lv === top); return out; }""")
        if rule != [4, 4, 3, 3, 0, 8, True]: fails.append(f'level rule gave {rule}, wanted [4, 4, 3, 3, 0, 8, True]')

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
        # Passages with the microphone: each part is read in turn on one microphone session, the scene grows, then the quiz.
        PL = pg.evaluate("window.READ_IT_SAY_IT.LEVELS.findIndex(l => l.passage)")
        pg.evaluate("window.READ_IT_SAY_IT.setMode('auto')")
        pg.evaluate(f"window.READ_IT_SAY_IT.setLevel({PL + 3})"); pg.wait_for_timeout(300)
        t = pg.evaluate("window.READ_IT_SAY_IT.current()")
        if t.get('kind') != 'passage': fails.append('a passage level did not give a passage')
        if not pg.is_visible('#ptitle') or not pg.evaluate("document.getElementById('app').classList.contains('passage')"): fails.append('passage layout not shown')
        pg.screenshot(path=str(SHOTS / 'risi-passage-start.png'))
        n_things0 = pg.evaluate("Kit.things.length")
        pg.click('#mic'); pg.wait_for_timeout(600)
        if not state(pg)['listening']: fails.append('the microphone did not start for a passage')
        hear_part = lambda c: ' '.join(w for i in range(c['a'], c['b']) for w in t['words'][i].lower().replace('-', ' ').split())
        c0 = t['chunks'][0]; first = hear_part(c0).split()
        pg.evaluate("w => window.READ_IT_SAY_IT.heard(w, false)", ' '.join(first[:len(first) // 2]))
        if state(pg)['chunk'] != 0: fails.append('half of the first part moved on')
        pg.evaluate("w => window.READ_IT_SAY_IT.heard(w, false)", hear_part(c0))
        s = state(pg)
        if s['chunk'] != 1 or not s['listening']: fails.append(f'reading the first part did not move on with the microphone still on {s["chunk"]} {s["listening"]}')
        pg.wait_for_timeout(900)
        if pg.evaluate("Kit.things.length") <= n_things0 and t['chunks'][0]['cue'].count('+'): fails.append('the scene did not grow after the first part')
        # A heard text from before the switch to the next part does not count for it.
        said = hear_part(c0) + ' banana kite pizza'
        pg.evaluate("w => window.READ_IT_SAY_IT.heard(w, false)", said)
        if any(state(pg)['got'][t['chunks'][1]['a']:t['chunks'][1]['b']]): fails.append('wrong words counted for the second part')
        pg.screenshot(path=str(SHOTS / 'risi-passage-reading.png'))
        gl = pg.query_selector('.w.gl')
        if gl:
            gl.click(); pg.wait_for_timeout(200)
            if not pg.is_visible('#gloss') or ':' not in pg.inner_text('#gloss'): fails.append('tapping an underlined word did not show its meaning')
            pg.screenshot(path=str(SHOTS / 'risi-passage-meaning.png'))
        else: fails.append('no underlined words in the passage')
        # The transcript grows as she reads on: everything heard since the microphone was tapped.
        for c in t['chunks'][1:]: said += ' ' + hear_part(c); pg.evaluate("w => window.READ_IT_SAY_IT.heard(w, false)", said); pg.wait_for_timeout(150)
        pg.wait_for_timeout(500); s = state(pg)
        if s['phase'] != 'quiz' or s['listening']: fails.append(f'reading every part did not start the quiz {s["phase"]}')
        if not pg.is_visible('#quiz .opt') or pg.is_visible('#mic'): fails.append('quiz not shown')
        pg.screenshot(path=str(SHOTS / 'risi-passage-quiz.png'))
        s0 = state(pg)
        pg.evaluate("window.READ_IT_SAY_IT.answer(false)"); pg.wait_for_timeout(100)
        if state(pg)['qi'] != 0: fails.append('a wrong answer moved on')
        for k in range(3): pg.evaluate("window.READ_IT_SAY_IT.answer(true)"); pg.wait_for_timeout(250)
        s1 = state(pg); last = pg.evaluate("window.READ_IT_SAY_IT.last")
        if s1['phase'] != 'won' or s1['qFirst'] != 2 or not last['right'] or s1['streak'] != s0['streak'] + 1: fails.append(f'read it all and 2 of 3 first try was not right first try {s1} {last}')
        if 'words a minute' not in pg.inner_text('#quiz'): fails.append('no reading speed shown')
        pg.screenshot(path=str(SHOTS / 'risi-passage-done.png'))
        # Two questions wrong first is not a first-try read, even when the reading was good.
        pg.evaluate("window.READ_IT_SAY_IT.newRound(); window.READ_IT_SAY_IT.setMode('trust')")
        t = pg.evaluate("window.READ_IT_SAY_IT.current()")
        if not pg.is_visible('#trust') or 'yellow' not in pg.inner_text('#trust'): fails.append('trust mode passage has no button for the yellow part')
        for c in t['chunks']: pg.click('#trust')
        pg.wait_for_timeout(1600)
        if state(pg)['phase'] != 'quiz': fails.append(f'trust mode: tapping for each part did not start the quiz {state(pg)}')
        st0 = state(pg)
        for k in range(3): pg.evaluate("window.READ_IT_SAY_IT.answer(false)"); pg.evaluate("window.READ_IT_SAY_IT.answer(false)"); pg.evaluate("window.READ_IT_SAY_IT.answer(true)"); pg.wait_for_timeout(250)
        st1 = state(pg)
        if st1['phase'] != 'won' or pg.evaluate("window.READ_IT_SAY_IT.last.right") or st1['miss'] != st0['miss'] + 1: fails.append(f'questions wrong first still counted as right {st1}')
        if 'words a minute' in pg.inner_text('#quiz'): fails.append('trust mode showed a reading speed')
        # Tap mode uses the same button for passages; Hear it is a miss; time running out is a miss.
        pg.evaluate("window.READ_IT_SAY_IT.setMode('tap')")
        if not pg.is_visible('#trust'): fails.append('tap mode passage has no button')
        pg.click('#trust')
        if state(pg)['chunk'] != 1: fails.append('tap mode: the button did not move on')
        pg.click('#listen')
        if not state(pg)['missed']: fails.append('Hear it in a passage was not a miss')
        pg.evaluate("window.READ_IT_SAY_IT.setMode('auto')"); pg.evaluate("window.READ_IT_SAY_IT.timeScale = 0.01")
        pg.evaluate("window.READ_IT_SAY_IT.startListening()"); pg.wait_for_timeout(1500)
        s = state(pg)
        if not s['missed'] or s['listening'] or s['phase'] != 'read': fails.append(f'time running out in a passage was not a miss {s}')
        pg.evaluate("window.READ_IT_SAY_IT.timeScale = 1")
        # Every passage level's longest passage fits the tablet screen.
        for lv in range(PL, pg.evaluate("window.READ_IT_SAY_IT.LEVELS.length")):
            longest = pg.evaluate(f"window.READ_IT_SAY_IT.LEVELS[{lv}].pool.reduce((a, b) => b.words.length > a.words.length ? b : a)")
            pg.evaluate("t => window.READ_IT_SAY_IT.useTask(t)", longest)
            bad = pg.evaluate("(() => { const w = document.getElementById('words').getBoundingClientRect(), m = document.getElementById('mic').getBoundingClientRect(); return document.body.scrollWidth > innerWidth || m.bottom > innerHeight * 0.8 || w.bottom > innerHeight * 0.65; })()")
            if bad: fails.append(f"L{lv + 1} {longest['title']} does not fit at 1440x960")
        pg.screenshot(path=str(SHOTS / 'risi-passage-longest.png'))
        pg.evaluate("window.READ_IT_SAY_IT.setMode('auto')")

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
        pg.evaluate(f"window.READ_IT_SAY_IT.setLevel(window.READ_IT_SAY_IT.LEVELS.length - 1)"); jane = pg.evaluate("window.READ_IT_SAY_IT.LEVELS.flatMap(l => l.pool || []).reduce((a, b) => b.words.length > a.words.length ? b : a)")
        pg.evaluate("t => window.READ_IT_SAY_IT.useTask(t)", jane); pg.wait_for_timeout(300)
        pg.screenshot(path=str(SHOTS / 'risi-small-passage.png'))
        if pg.evaluate("(() => { const m = document.getElementById('mic').getBoundingClientRect(); return document.body.scrollWidth > innerWidth || m.bottom > innerHeight * 0.85; })()"): fails.append('the longest passage does not fit at 1024x700')
        if pg.evaluate("document.body.scrollWidth > innerWidth || document.getElementById('words').getBoundingClientRect().bottom > innerHeight * 0.6"): fails.append('long sentence does not fit at 1024x700')
        peter = pg.evaluate("window.READ_IT_SAY_IT.LEVELS.flatMap(l => l.pool || []).find(p => p.title === 'Peter Pan')")
        pg_snow = pg.evaluate("window.READ_IT_SAY_IT.LEVELS.flatMap(l => l.pool || []).find(p => p.title === 'Snow Day')")
        beauty = pg.evaluate("window.READ_IT_SAY_IT.LEVELS.flatMap(l => l.pool || []).find(p => p.title === 'Black Beauty')")
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
                for ptask in (peter, beauty):
                    ok, st, errs, n = passage_listen_case(p, ptask, tmp)
                    notes.append(f'spoken passage "{ptask["title"]}" ({n} parts): {"all parts heard, quiz started" if ok else "stopped at part %d" % (st["chunk"] + 1)} (reading time {st["readMs"] / 1000:.1f} s, listener load {st["load"]:.2f})')
                    if not ok: fails.append(f'the listener did not hear the spoken passage "{ptask["title"]}": {st}')
                    fails += ['page error: ' + e for e in errs]
                snow = pg_snow
                ok, st, errs, n = passage_listen_case(p, peter, tmp, spoken=snow, wait=25000)
                notes.append(f'spoken "{snow["title"]}" for "{peter["title"]}": {"accepted (bad)" if ok or st["chunk"] else "not accepted"} (parts read {st["chunk"]})')
                if ok or st['chunk']: fails.append('a different spoken passage was accepted')
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
