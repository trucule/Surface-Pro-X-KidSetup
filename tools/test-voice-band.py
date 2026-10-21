import math, struct, sys, wave, pathlib
from playwright.sync_api import sync_playwright

APP = (pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'voice-band.html').as_uri()
RATE = 48000
TUNE = [60, 62, 64, 67, 64]   # C D E G E, sung by a "child" an octave up below

def sung_wav(path, notes, octave=12, lead=0.6, note_len=0.45, gap=0.08, tail=2.0):
    """A voice-like test signal: harmonics, a little vibrato and breath noise, short gaps between notes."""
    import random
    random.seed(1)
    frames = []
    def silence(sec):
        for _ in range(int(sec * RATE)): frames.append(random.uniform(-0.002, 0.002))
    silence(lead)
    for m in notes:
        f0 = 440 * 2 ** ((m + octave - 69) / 12); n = int(note_len * RATE); ph = 0.0
        for i in range(n):
            t = i / RATE; f = f0 * (1 + 0.004 * math.sin(2 * math.pi * 5.5 * t)); ph += 2 * math.pi * f / RATE
            env = min(1, i / (0.02 * RATE), (n - i) / (0.02 * RATE))
            v = 0.5 * math.sin(ph) + 0.25 * math.sin(2 * ph) + 0.12 * math.sin(3 * ph) + 0.05 * math.sin(4 * ph)
            frames.append(0.5 * env * v + random.uniform(-0.004, 0.004))
        silence(gap)
    silence(tail)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, x)) * 32767)) for x in frames))
    return frames

UNIT = r"""
(args) => {
  const [frames, rate, tune] = args; const out = {};
  const sine = (f, sec) => { const n = Math.floor(rate * sec), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = .5 * Math.sin(2 * Math.PI * f * i / rate) + .2 * Math.sin(4 * Math.PI * f * i / rate); return x; };
  out.pitch = [110, 196, 261.63, 440, 523.25, 880].map(f => { const d = sine(f, .1); return [f, +VB.yin(d.subarray(0, 2048), rate).toFixed(1)]; });
  const data = Float32Array.from(frames);
  const { track, hopSec } = VB.pitchTrack(data, rate);
  out.notes = VB.segmentNotes(track, hopSec).map(n => n.midi);
  out.silence = VB.yin(new Float32Array(2048), rate);
  const sng = VB.segmentNotes(track, hopSec);
  const target = tune.map((m, k) => ({ midi: m, start: k, end: k + .5 }));
  out.copyScore = VB.scoreCopy(target, sng);
  out.copyWrong = VB.scoreCopy(target, sng.map((n, k) => ({ ...n, midi: n.midi + (k % 2 ? 4 : 0) })));
  out.fx = {};
  for (const k of Object.keys(VB.FX)) { const y = VB.applyFx(k, data.subarray(0, rate * 2), rate); let peak = 0, bad = 0; for (const v of y) { if (!isFinite(v)) bad++; peak = Math.max(peak, Math.abs(v)); } out.fx[k] = { len: y.length, peak: +peak.toFixed(2), bad }; }
  // Pitch shift really moves the pitch: shift a 300 Hz tone up 1.5x and measure it.
  const s = VB.pitchShift(sine(300, .5), rate, 1.5); out.shift = +VB.yin(s.subarray(8000, 10048), rate).toFixed(1);
  // Auto-tune pulls a slightly flat A (430 Hz) to A 440.
  const at = VB.autotune(sine(430, .8), rate, 1); out.autotune = +VB.yin(at.subarray(16000, 18048), rate).toFixed(1);
  return out;
}
"""

def main():
    import tempfile
    work = pathlib.Path(tempfile.mkdtemp(prefix='voice-band-test-')); wav = work / 'sung.wav'
    frames = sung_wav(wav, TUNE)
    problems = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={wav}%noloop', '--autoplay-policy=no-user-gesture-required'])
        pg = b.new_page(viewport={'width': 1440, 'height': 960}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(APP)
        u = pg.evaluate(UNIT, [frames, RATE, TUNE])
        print('pitch (true, detected):', u['pitch'])
        for f, d in u['pitch']:
            if abs(12 * math.log2(d / f)) > 0.3 if d else True: problems.append(f'pitch {f} -> {d}')
        want = [m + 12 for m in TUNE]
        print('notes from sung tune:', u['notes'], 'expected', want)
        if u['notes'] != want: problems.append(f'notes {u["notes"]} != {want}')
        print('silence pitch:', u['silence'], '| copy score right:', u['copyScore'], 'wrong:', u['copyWrong'])
        if u['silence'] != 0: problems.append('pitch on silence')
        if u['copyScore'] != len(TUNE): problems.append('copy score for the right tune')
        if u['copyWrong'] >= len(TUNE) - 1: problems.append('copy score too lenient')
        print('fx:', u['fx'])
        for k, v in u['fx'].items():
            if v['bad'] or v['peak'] < .5: problems.append(f'fx {k} {v}')
        print('pitch shift 300 x1.5 ->', u['shift'], '| autotune 430 ->', u['autotune'])
        if abs(u['shift'] - 450) > 8: problems.append('pitch shift')
        if abs(u['autotune'] - 440) > 4: problems.append('autotune')
        # The Sing room end to end with the fake microphone playing the tune.
        pg.click('[data-go=sing]'); pg.wait_for_timeout(300); pg.click('#singRec')
        pg.wait_for_function("() => !document.getElementById('singRec').classList.contains('rec')", timeout=30000)
        msg = pg.inner_text('#singMsg'); print('sing room:', msg)
        if 'C D E G E' not in msg: problems.append('sing room did not hear C D E G E: ' + msg)
        pg.screenshot(path=str(work / 'vb-sing.png'))
        for sel in ['#playNotes', '#playHarm', '#playMe', '#playTuned']: pg.click(sel); pg.wait_for_timeout(150)
        pg.click('[data-back]', strict=False) if False else pg.locator('#sing [data-back]').click()
        # Effects room, record and play with every effect.
        pg.reload(); pg.click('[data-go=fx]'); pg.wait_for_timeout(200); pg.click('#fxRec')
        pg.wait_for_function("() => !document.getElementById('fxRec').classList.contains('rec')", timeout=30000)
        print('fx room:', pg.inner_text('#fxMsg'))
        for i in range(10): pg.locator('#fxGrid .fx').nth(i).click(); pg.wait_for_timeout(120)
        pg.screenshot(path=str(work / 'vb-fx.png'))
        pg.click('#modeLive'); pg.click('#fxRec'); pg.wait_for_timeout(800); live = pg.inner_text('#fxMsg'); pg.click('#fxRec', force=True); print('live:', live)
        if 'Live' not in live: problems.append('live mode did not start')
        # Looper: record track 1 from the fake mic (count-in, one loop), check it lands and loops.
        pg.reload(); pg.click('[data-go=loop]'); pg.wait_for_timeout(500)
        pg.locator('#trk0 .recb').click()
        pg.wait_for_function("() => VB.state().armed === -1 && VB.tracks[0].buf", timeout=40000)
        st = pg.evaluate("() => ({ len: VB.tracks[0].buf.length, rate: VB.tracks[0].buf.sampleRate, loop: VB.state().loopLen, playing: VB.state().playing })")
        print('looper:', st, '|', pg.inner_text('#loopMsg'))
        if abs(st['len'] / st['rate'] - st['loop']) > 0.01 or not st['playing']: problems.append(f'looper track {st}')
        pg.locator('#trk0 .fxb').click(); pg.wait_for_timeout(200)
        pg.screenshot(path=str(work / 'vb-loop.png'))
        pg.click('#loopPlay')
        print('page errors:', errs); problems += errs
        b.close()
    print('PROBLEMS:' if problems else 'ALL OK', problems)
    sys.exit(1 if problems else 0)

main()
