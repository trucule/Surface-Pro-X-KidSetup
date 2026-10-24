#!/usr/bin/env python3
"""Tests Story Maker's voice services: VoiceStudio when the PC answers at the start of a story, Azure for the whole
story when it does not (checked once, not on every line), a switch to Azure when the PC drops out mid-story, and
several different Azure voices in one story, with stand-ins for voices the region does not offer.
Run: python3 tools/test-story-voices.py"""
import json, os, re, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = 'file://' + os.path.join(ROOT, 'apps', 'story-maker', 'index.html')
tmp = tempfile.mkdtemp(prefix='smvoice-')
subprocess.run(['espeak-ng', '-w', tmp + '/a.wav', 'hello there'], check=True)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp + '/a.wav', '-ar', '24000', '-ac', '1', tmp + '/a.mp3'], check=True)
MP3 = open(tmp + '/a.mp3', 'rb').read()
VS = 'http://192.168.1.10:3901'
CFG = {'tts': {'provider': 'voicestudio', 'url': VS, 'key': 'k', 'region': 'westus2', 'fallback': 'azure'}}
# The region offers no Jane, Davis or Tony; the rest of the cast's voices plus a few others.
HAVE = ['en-US-AnaNeural', 'en-US-AriaNeural', 'en-US-SaraNeural', 'en-US-NancyNeural', 'en-US-AmberNeural', 'en-US-JennyNeural',
        'en-US-JasonNeural', 'en-US-GuyNeural', 'en-US-ChristopherNeural', 'en-US-BrandonNeural', 'en-US-AndrewNeural', 'en-US-EmmaNeural', 'en-GB-RyanNeural']
LIST = [{'ShortName': n, 'Locale': n[:5], 'VoiceType': 'Neural', 'Gender': 'Female' if any(x in n for x in ['Ana', 'Aria', 'Sara', 'Nancy', 'Amber', 'Jenny', 'Emma']) else 'Male'} for n in HAVE]
CORS = {'Access-Control-Allow-Origin': '*'}
fails = []
def check(c, m):
    print(('ok   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    def run(vs_mode, cast, stories=1, wait=9000):
        ctx = b.new_context(); log = {'health': 0, 'ids': 0, 'gen': 0, 'azure': [], 'list': 0}; errs = []
        ctx.add_init_script('window.DWM_CONFIG = ' + json.dumps(CFG) + '; try { localStorage.clear(); } catch (e) {}')
        def vs(route):
            u = route.request.url
            if vs_mode == 'down': return route.abort()
            if u.endswith('/health'): log['health'] += 1; return route.fulfill(status=200, body='{}', headers=CORS)
            if '/v1/audio/voices' in u:
                log['ids'] += 1
                return route.fulfill(status=200, body=json.dumps({'voices': [{'type': 'profile', 'name': n, 'voice_id': n} for n in ['Narrator', 'Bun', 'Spark', 'Beep', 'Twinkle', 'Pip', 'Hop', 'Rusty', 'Luna', 'Mo', 'Zip', 'Scarlett', 'Captain Clam']]}), headers=CORS)
            if u.endswith('/generate'):
                log['gen'] += 1
                if vs_mode == 'drops' and log['gen'] >= 2: return route.abort()
                return route.fulfill(status=200, body=MP3, headers=CORS)
            route.fulfill(status=404, body='', headers=CORS)
        def health_count(route):
            if vs_mode == 'down': log['health'] += 1
            return vs(route)
        ctx.route(re.compile(r'http://192\.168\.1\.10:3901/.*'), health_count)
        def az(route):
            u = route.request.url
            if u.endswith('/voices/list'): log['list'] += 1; return route.fulfill(status=200, body=json.dumps(LIST), headers=CORS)
            m = re.search(r'name="([^"]+)"', route.request.post_data or ''); log['azure'].append(m.group(1) if m else '?')
            route.fulfill(status=200, body=MP3, headers={'Content-Type': 'audio/mpeg', **CORS})
        ctx.route(re.compile(r'https://westus2\.tts\.speech\.microsoft\.com/.*'), az)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(APP); pg.wait_for_timeout(500)
        per = []
        for i in range(stories):
            pg.evaluate(f"() => {{ STORY.pick({json.dumps(cast)}, 0, 0, 1, 0, 2); STORY.setSelfRead(false); STORY.start(); }}")
            pg.wait_for_timeout(wait)
            per.append(dict(log, azure=list(log['azure'])))
        route = pg.evaluate('() => STORY.VOICE.route()')
        ctx.close()
        return per, route, errs

    cast = ['bun', 'spark', 'beep', 'twinkle']
    per, route, errs = run('down', cast, stories=2)
    a = per[0]
    check(route == 'azure', 'PC unreachable at the start: the story uses Azure')
    check(a['health'] == 1, 'the PC is asked once for the first story, not on every line (%d asks)' % a['health'])
    check(a['gen'] == 0, 'no VoiceStudio line requests after it was found down')
    check(len(a['azure']) >= 4, 'lines spoken by Azure (%d)' % len(a['azure']))
    used = set(a['azure'])
    check(len(used) >= 3, 'several Azure voices in one story: %s' % sorted(used))
    check(not used & {'en-US-JaneNeural', 'en-US-DavisNeural', 'en-US-TonyNeural'}, 'voices the region lacks are replaced')
    check(per[1]['health'] == 2, 'the next story checks the PC again (once)')
    check(a['list'] == 1, 'the Azure voice list is fetched once')
    check(not errs, 'no page errors %s' % errs[:2])

    per, route, errs = run('up', cast)
    check(route == 'vs' and per[0]['gen'] >= 3 and not per[0]['azure'], 'PC up: VoiceStudio speaks, Azure unused (gen %d, azure %d)' % (per[0]['gen'], len(per[0]['azure'])))
    check(per[0]['health'] == 1, 'PC up: one health check per story (%d)' % per[0]['health'])

    per, route, errs = run('drops', cast)
    g = per[0]['gen']
    check(route == 'azure' and per[0]['azure'], 'PC drops mid-story: the rest of the story uses Azure')
    check(g <= 3, 'PC drops mid-story: VoiceStudio is not asked again line after line (%d requests)' % g)
    check(not errs, 'no page errors %s' % errs[:2])
    b.close()

print('ALL OK' if not fails else 'FAILED %s' % fails)
sys.exit(1 if fails else 0)
