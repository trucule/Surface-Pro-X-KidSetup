#!/usr/bin/env python3
"""Tests the shared narrator voice (apps/shared/kid-voice.js) as it runs inside the apps.

Azure is mocked with Playwright routing and a real MP3 made by espeak-ng and ffmpeg. Checks: with voice-config.js the
apps' lines go to Azure with the kid voice and not to the Windows voice, a line is fetched once and then cached,
utterance start/boundary/end events still fire, cancel stops it, a failing Azure falls back to the Windows voice,
without voice-config.js nothing changes, and every injected app loads with the layer active and no page errors.
"""
import glob, os, re, shutil, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tmp = tempfile.mkdtemp(prefix='kidvoice-')
wav, mp3 = os.path.join(tmp, 'a.wav'), os.path.join(tmp, 'a.mp3')
subprocess.run(['espeak-ng', '-w', wav, 'spell the word cat'], check=True)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-ar', '24000', '-ac', '1', mp3], check=True)
MP3 = open(mp3, 'rb').read()
CFG = 'window.KID_TTS = {"provider":"azure","key":"test-key","region":"westus2","voice":"en-US-AnaNeural"};'

def stage(app_path, with_cfg=True):
    d = tempfile.mkdtemp(dir=tmp)
    if os.path.isdir(app_path):
        shutil.copytree(app_path, d, dirs_exist_ok=True)
    else:
        shutil.copy(app_path, os.path.join(d, 'index.html'))
    if with_cfg:
        open(os.path.join(d, 'voice-config.js'), 'w').write(CFG)
    return 'file://' + os.path.join(d, 'index.html')

SPY = """
window.__native = [];
SpeechSynthesis.prototype.speak = function (u) { window.__native.push(u.text); setTimeout(() => { try { u.dispatchEvent(new Event('end')); } catch (e) {} }, 50); };
SpeechSynthesis.prototype.cancel = function () {};
"""
fails, checks = [], 0
def check(cond, msg):
    global checks; checks += 1
    if not cond: fails.append(msg); print('FAIL', msg)
    else: print('ok  ', msg)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    def page_for(url, azure_ok=True):
        ctx = b.new_context(viewport={'width': 1280, 'height': 800})
        reqs, errs = [], []
        def handle(route):
            reqs.append(route.request.post_data or '')
            if azure_ok: route.fulfill(status=200, body=MP3, headers={'Content-Type': 'audio/mpeg', 'Access-Control-Allow-Origin': '*'})
            else: route.fulfill(status=500, body='no', headers={'Access-Control-Allow-Origin': '*'})
        ctx.route(re.compile(r'https://[a-z0-9]+\.tts\.speech\.microsoft\.com/.*'), handle)
        ctx.add_init_script(SPY)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(url); pg.wait_for_timeout(1500)
        return ctx, pg, reqs, errs

    ww = os.path.join(ROOT, 'apps', 'word-wizard.html')
    # 1) Azure path
    ctx, pg, reqs, errs = page_for(stage(ww))
    check(pg.evaluate('!!(window.KID_VOICE && window.KID_VOICE.active)'), 'layer active with voice-config.js')
    pg.evaluate("window.__native.length = 0; window.__ev = []; const u = new SpeechSynthesisUtterance('Spell the word cat.'); u.rate = 0.9; "
                "['start','boundary','end','error'].forEach(t => u.addEventListener(t, () => __ev.push(t))); speechSynthesis.speak(u);")
    pg.wait_for_function("window.__ev.includes('end')", timeout=15000)
    ev = pg.evaluate('__ev')
    check(len(reqs) >= 1 and 'en-US-AnaNeural' in reqs[-1] and 'Spell the word cat.' in reqs[-1], 'line sent to Azure with the kid voice')
    check('-10%' in reqs[-1], 'rate 0.9 becomes prosody -10%')
    check(pg.evaluate('__native.length') == 0, 'Windows voice not used')
    check(ev[0] == 'start' and 'boundary' in ev and ev[-1] == 'end', 'start, boundary and end events fire: %s' % ev[:4])
    n = len(reqs)
    pg.evaluate("window.__ev = []; const u = new SpeechSynthesisUtterance('Spell the word cat.'); u.rate = 0.9; u.onend = () => __ev.push('end'); speechSynthesis.speak(u);")
    pg.wait_for_function("window.__ev.includes('end')", timeout=15000)
    check(len(reqs) == n, 'repeat line plays from cache without a new request')
    ctx.close()
    # IndexedDB persists across page loads in one profile
    ctx2 = b.new_context(); reqs2 = []
    ctx2.route(re.compile(r'https://[a-z0-9]+\.tts\.speech\.microsoft\.com/.*'), lambda r: (reqs2.append(1), r.fulfill(status=200, body=MP3, headers={'Access-Control-Allow-Origin': '*'})))
    ctx2.add_init_script(SPY)
    url = stage(ww)
    pg2 = ctx2.new_page(); pg2.goto(url); pg2.wait_for_timeout(800)
    pg2.evaluate("window.__d = 0; const u = new SpeechSynthesisUtterance('Saved line.'); u.onend = () => __d++; speechSynthesis.speak(u);")
    pg2.wait_for_function('window.__d === 1', timeout=15000)
    pg2.reload(); pg2.wait_for_timeout(800)
    before = len(reqs2)
    pg2.evaluate("window.__d = 0; const u = new SpeechSynthesisUtterance('Saved line.'); u.onend = () => __d++; speechSynthesis.speak(u);")
    pg2.wait_for_function('window.__d === 1', timeout=15000)
    check(len(reqs2) == before, 'clip kept in IndexedDB across a reload')
    # cancel stops and fires error, queue drained
    pg2.evaluate("window.__c = []; const a = new SpeechSynthesisUtterance('First long line to stop.'); const c = new SpeechSynthesisUtterance('Second queued line.'); "
                 "a.onerror = e => __c.push('a:' + e.error); c.onerror = e => __c.push('c:' + e.error); a.onend = () => __c.push('a:end'); "
                 "speechSynthesis.speak(a); speechSynthesis.speak(c); setTimeout(() => speechSynthesis.cancel(), 400);")
    pg2.wait_for_timeout(2500)
    c = pg2.evaluate('__c')
    check('a:end' not in c and any(x.startswith('a:') for x in c) and any(x.startswith('c:') for x in c), 'cancel stops the line and drops the queue: %s' % c)
    ctx2.close()
    # 2) Azure failing -> Windows voice
    ctx, pg, reqs, errs = page_for(stage(ww), azure_ok=False)
    pg.evaluate("window.__native.length = 0; window.__d = 0; const u = new SpeechSynthesisUtterance('Fallback line.'); u.onend = () => __d++; speechSynthesis.speak(u);")
    pg.wait_for_function('window.__d === 1', timeout=15000)
    check(pg.evaluate('__native') == ['Fallback line.'], 'Azure error falls back to the Windows voice')
    ctx.close()
    # 3) No config -> untouched
    ctx, pg, reqs, errs = page_for(stage(ww, with_cfg=False))
    check(pg.evaluate('typeof window.KID_VOICE') == 'undefined', 'no voice-config.js: layer stays off')
    pg.evaluate("window.__native.length = 0; speechSynthesis.speak(new SpeechSynthesisUtterance('Plain.'));")
    check(pg.evaluate('__native') == ['Plain.'] and not reqs, 'no voice-config.js: Windows voice, no requests')
    ctx.close()
    # 4) The app's own say() goes to Azure, in every app that has the block
    apps = sorted(glob.glob(os.path.join(ROOT, 'apps', '*.html')) + [d for d in glob.glob(os.path.join(ROOT, 'apps', '*')) if os.path.isdir(d) and os.path.exists(os.path.join(d, 'index.html'))])
    for a in apps:
        idx = a if a.endswith('.html') else os.path.join(a, 'index.html')
        name = os.path.basename(a).replace('.html', '')
        has = 'KID-VOICE START' in open(idx, encoding='utf-8').read()
        if name == 'story-maker':
            check(not has, 'story-maker keeps its own voices'); continue
        if not has:
            continue
        ctx, pg, reqs, errs = page_for(stage(a))
        active = pg.evaluate('!!(window.KID_VOICE && window.KID_VOICE.active)')
        # Music Box's say() takes a prompt key; the others take the text.
        said = pg.evaluate("typeof say !== 'function' ? false : (say(typeof PROMPTS === 'object' ? Object.keys(PROMPTS)[0] : 'Hello from ' + document.title), true)")
        if said: pg.wait_for_timeout(1500)
        ok = active and not errs and (not said or (reqs and not pg.evaluate('__native.length')))
        check(ok, '%s: layer active, no page errors%s' % (name, ', say() spoken by Azure' if said else '') + ('' if ok else ' errs=%s reqs=%d native=%s' % (errs[:2], len(reqs), pg.evaluate('__native'))))
        ctx.close()
    b.close()

shutil.rmtree(tmp, ignore_errors=True)
print('%d checks, %d failed' % (checks, len(fails)))
print('ALL OK' if not fails else 'FAILED')
sys.exit(1 if fails else 0)
