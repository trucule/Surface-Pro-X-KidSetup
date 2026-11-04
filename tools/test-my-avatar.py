#!/usr/bin/env python3
"""Tests My Avatar, the shared star counter, and the home screen's local service (KidService in KidTablet.psm1).

The real KidService C# code is compiled with mono (mcs) and run on 127.0.0.1:47821 with a scratch profile, so the app
talks to the same service the tablet runs. Checks: stars from every kind of saved progress add up; every app carries the
star counter; every look and every shop item builds; trying on is free, buying needs enough stars and spends them; the
design survives a reload and comes back from the home screen when the app's own copy is lost; the realistic avatar loads
from its model files, the face sliders shape it, old drawn designs carry over and the drawn avatar is the fallback; the
portrait is a clear PNG; another app's new stars reach the home screen; the badge on the home screen renders. Screenshots go to
/tmp/claude-0/tests. Run: python3 tools/test-my-avatar.py   (needs mono-mcs and xvfb-run for the service and badge)
"""
import base64, glob, io, json, os, pathlib, re, shutil, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
APPS = ROOT / 'apps'
AVATAR = (APPS / 'my-avatar' / 'index.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)
ARGS = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
URL = 'http://127.0.0.1:47821'
fails, notes = [], []
def check(c, m):
    print(('ok   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

def get(path):
    with urllib.request.urlopen(URL + path, timeout=5) as r: return r.read().decode()

# --- The home screen's service, compiled from the module ---------------------------------------------------------
tmp = pathlib.Path(tempfile.mkdtemp(prefix='avatar-'))
mod = (ROOT / 'KidTablet.psm1').read_text(encoding='utf-8')
src = mod[mod.index('$script:KidHomeSource = @"\n') + len('$script:KidHomeSource = @"\n'):]
src = src[:src.index('\n"@')]
check('$' not in src and '`' not in src, 'KidHome source has no PowerShell $ or backtick (it sits in an expandable here-string)')
(tmp / 'KidHome.cs').write_text(src)
(tmp / 'Harness.cs').write_text('using System; using System.Threading;\nstatic class Harness { static void Main() { KidService.Start(() => {}); Thread.Sleep(Timeout.Infinite); } }\n')
(tmp / 'Badge.cs').write_text(r'''using System; using System.Drawing; using System.Windows.Forms;
static class BadgeShot { [STAThread] static void Main(string[] a) {
  var bmp = new Bitmap(720, 160); using (var g = Graphics.FromImage(bmp)) g.Clear(Color.FromArgb(24, 24, 37));
  var b = new AvatarBadge(null, 1.4f); b.Reload();
  using (var g = Graphics.FromImage(bmp)) { g.TranslateTransform(20, 14);
    typeof(Control).GetMethod("OnPaint", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance).Invoke(b, new object[] { new PaintEventArgs(g, new Rectangle(0, 0, b.Width, b.Height)) });
    g.DrawString("Hi, Scarlett!", new Font("DejaVu Sans", 34f), Brushes.White, b.Width + 10, 22); }
  bmp.Save(a[0]); } }
''')
home = tmp / 'home'; home.mkdir()
env = dict(os.environ, HOME=str(home))
svc = None
if shutil.which('mcs') and shutil.which('mono'):
    out = subprocess.run(['mcs', '-langversion:5', '-target:winexe', '-r:System.Windows.Forms.dll', '-r:System.Drawing.dll', '-out:' + str(tmp / 'KidHome.exe'), str(tmp / 'KidHome.cs')], capture_output=True, text=True)
    check(out.returncode == 0 and 'error' not in out.stdout, 'KidHome compiles as C# 5 (what the tablet\'s in-box compiler accepts) ' + out.stdout[-300:])
    subprocess.run(['mcs', '-langversion:5', '-r:System.Windows.Forms.dll', '-r:System.Drawing.dll', '-main:Harness', '-out:' + str(tmp / 'Harness.exe'), str(tmp / 'KidHome.cs'), str(tmp / 'Harness.cs')], check=True, capture_output=True)
    svc = subprocess.Popen(['mono', str(tmp / 'Harness.exe')], env=env)
    for _ in range(50):
        try: get('/stars'); break
        except Exception: time.sleep(0.2)
    check(json.loads(get('/stars')) == {'earned': 0, 'spent': 0, 'balance': 0}, 'service answers with nothing saved yet')
else:
    notes.append('mono or mcs missing: the home screen service was not tested')

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={'width': 1440, 'height': 960})
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        # The realistic avatar loads its model files as it needs them; wait until what she is wearing is in.
        def ready(page=None, textures=False):
            (page or pg).wait_for_function("window.MY_AVATAR && MY_AVATAR.real() && (MY_AVATAR.real().failed || (MY_AVATAR.real().ready && !MY_AVATAR.real().need.length" + (" && MY_AVATAR.real().textures" if textures else "") + "))", timeout=180000)
            (page or pg).wait_for_timeout(40)
        def put(k, v): pg.evaluate('([k, v]) => MY_AVATAR.set(k, v)', [k, v]); ready()
        pg.goto(AVATAR); pg.evaluate('localStorage.clear()'); pg.reload(); ready(textures=True); pg.wait_for_timeout(800)
        check(pg.evaluate('!!window.KID_STARS && !!window.MY_AVATAR'), 'app loads with the star counter')
        check(pg.evaluate("document.documentElement.innerHTML.includes('KID-VOICE START')"), 'narrator voice layer is in the app')
        r = pg.evaluate('MY_AVATAR.real()')
        check(r and r['ready'] and not r['failed'] and pg.evaluate('MY_AVATAR.parts().real') and not r['errors'], f'the realistic avatar loads from its model files {r}')
        pg.screenshot(path=str(SHOTS / 'avatar-start.png'))

        # Stars from every kind of saved progress.
        saved = {
            'word-wizard-v1': {'lv': 4, 'st': {}, 'stars': 12}, 'read-it-say-it-v1': {'lv': 9, 'stars': 20, 'mode': 'auto'},
            'levelup-v1': {'math': {'level': 3, 'stars': 4}, 'reading': {'level': 2, 'stars': 6}}, 'lab-done-chemistry': ['a', 'b', 'c'],
            'lab-done-kitchen': ['x'], 'story-stars': 5, 'trace-v2': {'lv': {}, 'stars': 7, 'words': 2}, 'count-v2': {'stars': 3, 'lv': {}},
            'trace-mode': 'little', 'musicbox-v2': {'songs': [], 'slot': 0}, 'kid-avatar-v1': {'stars': 999}, 'drawwithme-style': 'simple',
        }
        pg.evaluate("s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }", saved)
        earned = pg.evaluate('KID_STARS.earned()')
        check(earned == 12 + 20 + 10 + 3 + 1 + 5 + 7 + 3, f'stars from all kinds of progress add up ({earned}, wanted 61)')
        pg.reload(); ready()
        check(pg.evaluate('MY_AVATAR.balance()') == 61, 'balance starts at everything earned')

        # Every app carries the star counter once.
        pages = sorted(glob.glob(str(APPS / '*.html')) + glob.glob(str(APPS / '*' / 'index.html')))
        missing = [os.path.relpath(f, ROOT) for f in pages if open(f, encoding='utf-8').read().count('KID-STARS START') != 1]
        check(not missing, f'every app has the star counter ({len(pages)} apps) {missing}')
        # Each app's own save code writes stars in a shape the counter reads.
        shapes = []
        for f in pages:
            s = open(f, encoding='utf-8').read()
            if re.search(r'\bstars\s*\+\+|stars\s*\+=|stars:\s*0', s) and not re.search(r"localStorage\.setItem\([^)]*JSON\.stringify\((P|prog|A)\)|story-stars|lab-done-", s):
                shapes.append(os.path.relpath(f, ROOT))
        check(not shapes, f'apps that keep stars save them in a shape the counter reads {shapes}')

        # Every look builds (a small window, so the software renderer used for tests keeps up).
        pg.set_viewport_size({'width': 900, 'height': 600})
        looks = pg.evaluate('MY_AVATAR.LOOK')
        for k, opts in looks.items():
            for v, _ in opts: put(k, v)
        for k in ['freckles', 'blush', 'lashes']:
            for v in [True, False]: put(k, v)
        check(not pg.evaluate('MY_AVATAR.errors') and not errs and not pg.evaluate('MY_AVATAR.real().errors'), f'every look option builds {pg.evaluate("MY_AVATAR.errors")[:3]} {errs[:2]}')
        # She is always dressed: every design wears a top (or dress) and, without a dress, bottoms.
        worn = pg.evaluate("[...new Set(REAL_AVATAR._body().all.map(m => m.name))]")
        check(len(worn) > 5, f'the avatar wears its clothes {worn}')
        put('top', 'dress-sundress'); put('bottom', 'bottom-pants')
        check(pg.evaluate("MY_AVATAR.parts().real") and not pg.evaluate('MY_AVATAR.errors'), 'a dress replaces top and bottoms')
        for k, v in [('hair', 'hair-long'), ('pose', 'stand'), ('top', 'top-tee')]: put(k, v)
        # The face sliders.
        pg.evaluate("MY_AVATAR.setCat('face')")
        n = pg.evaluate("document.querySelectorAll('#panel input[type=range]').length")
        check(n >= 10, f'the face has sliders ({n})')
        pg.evaluate("(() => { const r = document.querySelector('#panel input[data-k=noseWidth]'); r.value = 60; r.oninput(); })()"); pg.wait_for_timeout(600)
        check(abs(pg.evaluate('MY_AVATAR.state().design.tune.noseWidth') - 0.6) < 1e-6, 'moving a slider changes and saves her face')
        infl = pg.evaluate("(() => { const m = REAL_AVATAR._body().mesh; return m.morphTargetInfluences[m.morphTargetDictionary['noseWidth+']]; })()")
        check(abs(infl - 0.6) < 1e-6, f'the slider shapes the model ({infl})')

        # Trying on is free; buying needs stars.
        s0 = pg.evaluate('MY_AVATAR.state()')
        pg.evaluate("MY_AVATAR.setCat('hat')"); pg.click('.item[data-id="bow"]'); pg.wait_for_timeout(600)
        s1 = pg.evaluate('MY_AVATAR.state()')
        check(pg.is_visible('#tryon') and s1['spent'] == 0 and s1['design']['hat'] is None, 'trying the bow on shows it without buying it')
        pg.screenshot(path=str(SHOTS / 'avatar-tryon.png'))
        pg.click('#buy'); pg.wait_for_timeout(200); pg.screenshot(path=str(SHOTS / 'avatar-buy.png'))
        pg.click('#mbtns button'); pg.wait_for_timeout(400)
        s2 = pg.evaluate('MY_AVATAR.state()')
        check(s2['spent'] == 35 and 'bow' in s2['owned'] and s2['design']['hat'] == 'bow' and pg.evaluate('MY_AVATAR.balance()') == 26, f'buying the bow spends 35 stars and puts it on {s2["spent"]}')
        check(not pg.evaluate("MY_AVATAR.buy('cap')"), 'the ball cap (40) cannot be bought with 26 stars')
        pg.evaluate("MY_AVATAR.tryOn('cap')"); pg.wait_for_timeout(300)
        check('need' in pg.inner_text('#buy'), 'trying on something too dear says how many more stars she needs')
        pg.click('#buy'); pg.wait_for_timeout(200)
        check('more stars' in pg.inner_text('#mtext'), 'tapping buy without enough stars explains instead of buying')
        pg.click('#mbtns button'); pg.evaluate('MY_AVATAR.stopTrying()')
        pg.click('.item[data-id="bow"]'); pg.wait_for_timeout(200)
        check(pg.evaluate('MY_AVATAR.state().design.hat') is None and pg.evaluate('MY_AVATAR.state().spent') == 35, 'tapping an owned bow takes it off without spending again')
        pg.click('.item[data-id="bow"]')

        # Every shop item builds (a rich test balance).
        pg.evaluate("localStorage.setItem('word-wizard-v1', JSON.stringify({ stars: 100000 }))")
        items = pg.evaluate('MY_AVATAR.SHOP.map(i => i.id)')
        for it in items:
            ok = pg.evaluate('id => MY_AVATAR.buy(id)', it)
            if not ok and it != 'bow': fails.append('could not buy ' + it)
        check(not pg.evaluate('MY_AVATAR.errors'), f'every shop item ({len(items)}) builds {pg.evaluate("MY_AVATAR.errors")[:3]}')
        for slot in ['outfit', 'place', 'pet', 'back', 'neck', 'hat', 'shades', 'sparkle']:
            for it in pg.evaluate('s => MY_AVATAR.SHOP.filter(i => i.slot === s).map(i => i.id)', slot):
                put(slot, it)
        check(not pg.evaluate('MY_AVATAR.errors') and not errs, 'every item can be put on')
        n = len(items)
        check(n >= 180, f'the shop has lots to buy ({n} items)')
        prices = sorted(pg.evaluate('MY_AVATAR.SHOP.map(i => i.price)'))
        check(prices[0] >= 30 and prices[-1] >= 600, f'prices run from small to big goals ({prices[0]} to {prices[-1]})')
        # A boy: the same model with the boy shape on, and every piece of clothing following it.
        put('outfit', None); put('gender', 'boy')
        boy = pg.evaluate("REAL_AVATAR._body().all.every(m => !m.morphTargetDictionary || m.morphTargetDictionary.boy === undefined || m.morphTargetInfluences[m.morphTargetDictionary.boy] === 1)")
        check(boy and not pg.evaluate('MY_AVATAR.errors'), 'choosing Boy reshapes the body and everything worn with it')
        pg.screenshot(path=str(SHOTS / 'avatar-boy.png')); put('gender', 'girl')
        # Something to hold goes in her hand; app colors change the app.
        put('hold', 'wand')
        check(pg.evaluate("(() => { let o = null; REAL_AVATAR._body().root.traverse(x => { if (/wrist/.test(x.name) && x.children.some(c => c.isGroup)) o = x; }); return !!o; })()"), 'a held item is in her hand')
        put('theme', 'th-ocean')
        check('1D6FB8' in pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--hdr')"), 'app colors change the header')
        put('theme', None); put('hold', None)
        put('frame', 'fr-gold'); put('badgebg', 'bg-sky')
        from PIL import Image as _I
        pic = _I.open(io.BytesIO(base64.b64decode(pg.evaluate('MY_AVATAR.portrait()').split(',')[1]))).convert('RGBA')
        check(pic.getpixel((192, 6))[3] > 200 and pic.getpixel((192, 40))[3] > 200, 'her picture gets the frame and background she bought')
        pic.save(SHOTS / 'avatar-portrait-framed.png'); put('frame', None); put('badgebg', None)
        pg.set_viewport_size({'width': 1440, 'height': 960})
        looks_for_shots = [
            ('avatar-park', "MY_AVATAR.set('outfit', null); MY_AVATAR.set('place', 'park'); MY_AVATAR.set('pet', 'cat'); MY_AVATAR.set('hat', 'flowers'); MY_AVATAR.set('back', 'fairy'); MY_AVATAR.set('sparkle', 'glitter'); MY_AVATAR.set('pose', 'wave'); MY_AVATAR.set('shades', null); MY_AVATAR.set('neck', 'necklace'); MY_AVATAR.setView('body')"),
            ('avatar-castle', "MY_AVATAR.set('outfit', 'princess'); MY_AVATAR.set('place', 'castle'); MY_AVATAR.set('pet', 'dragon'); MY_AVATAR.set('hat', 'tiara'); MY_AVATAR.set('back', null); MY_AVATAR.set('pose', 'peace'); MY_AVATAR.set('hair', 'hair-double-braid')"),
            ('avatar-space', "MY_AVATAR.set('outfit', 'astronaut'); MY_AVATAR.set('place', 'space'); MY_AVATAR.set('pet', null); MY_AVATAR.set('hat', null); MY_AVATAR.set('pose', 'hips'); MY_AVATAR.set('skin', '#6F4128'); MY_AVATAR.set('hair', 'hair-afro'); MY_AVATAR.set('hairColor', '#1E1612')"),
            ('avatar-face', "MY_AVATAR.set('outfit', null); MY_AVATAR.set('place', null); MY_AVATAR.set('sparkle', null); MY_AVATAR.set('hair', 'hair-long'); MY_AVATAR.set('skin', '#E2AC82'); MY_AVATAR.set('hairColor', '#5C3A21'); MY_AVATAR.set('glasses', 'glasses-round'); MY_AVATAR.set('freckles', true); MY_AVATAR.setCat('face')"),
        ]
        for name, js in looks_for_shots:
            pg.evaluate(js); ready(textures=True); pg.wait_for_timeout(4000); pg.screenshot(path=str(SHOTS / f'{name}.png'))

        # Saved here, and kept after a reload.
        pg.wait_for_timeout(1200)
        before = pg.evaluate('MY_AVATAR.state()')
        pg.reload(); ready()
        after = pg.evaluate('MY_AVATAR.state()')
        check(after['design'] == before['design'] and after['owned'] == before['owned'] and after['spent'] == before['spent'], 'design, items and spent stars survive a reload')

        # A design saved by the drawn avatar gets the nearest real choices.
        old = {'design': {'hair': 'bob', 'top': 'dress', 'shoes': 'boots', 'glasses': 'cateye', 'pose': 'cheer', 'brows': 'thick', 'bottom': 'jeans'}, 'owned': [], 'spent': 0, 'savedAt': 1}
        mig = ctx.new_page(); mig.route(URL + '/**', lambda r: r.abort())   # this check leaves the home screen's copy alone
        mig.goto(AVATAR, wait_until='domcontentloaded', timeout=120000); mig.evaluate("s => { localStorage.setItem('kid-avatar-v1', JSON.stringify(s)); }", old); mig.reload(wait_until='domcontentloaded', timeout=120000); ready(mig)
        d = mig.evaluate('MY_AVATAR.state().design')
        check((d['hair'], d['top'], d['shoes'], d['glasses'], d['pose'], d['brows']) == ('hair-bob', 'dress-sundress', 'shoes-rain-boots', 'glasses-leopard', 'peace', 'brows-thick'), f'an old drawn design carries over {d}')
        mig.evaluate("s => localStorage.setItem('kid-avatar-v1', JSON.stringify(s))", before); mig.close()
        # Without the model files the drawn avatar still works.
        fb = ctx.new_page(); fberr = []; fb.on('pageerror', lambda e: fberr.append(str(e)))
        fb.add_init_script("window.AVATAR_MODELS = new Proxy({}, { set(t, k, v) { if (k !== 'body') t[k] = v; return true; } });")
        fb.goto(AVATAR, wait_until='domcontentloaded', timeout=120000); ready(fb); fb.wait_for_timeout(500)
        check(fb.evaluate('MY_AVATAR.real().failed') and fb.evaluate('!!MY_AVATAR.parts().head') and not fb.evaluate('MY_AVATAR.errors') and not fberr, f'if the model files are missing, the drawn avatar shows instead {fberr[:2]}')
        fb.screenshot(path=str(SHOTS / 'avatar-fallback.png')); fb.close()

        # Portrait for the home screen: a clear 384 x 384 PNG.
        from PIL import Image
        png = pg.evaluate('MY_AVATAR.portrait()')
        im = Image.open(io.BytesIO(base64.b64decode(png.split(',')[1])))
        corner = im.convert('RGBA').getpixel((2, 2))
        check(im.size == (384, 384) and corner[3] == 0, f'portrait is a 384 x 384 PNG with a clear background {im.size} {corner}')
        im.save(SHOTS / 'avatar-portrait.png')

        if svc:
            pg.evaluate('MY_AVATAR.sendHome(true)'); pg.wait_for_timeout(1500)
            st = json.loads(get('/stars')); av = json.loads(get('/avatar'))
            check(st['spent'] == before['spent'] and st['earned'] == pg.evaluate('KID_STARS.earned()'), f'home screen has her stars and spending {st}')
            check(av and av['design'] == before['design'], 'home screen keeps a copy of her avatar')
            port = home / '.local' / 'share' / 'KidTablet' / 'avatar' / 'portrait.png'
            check(port.exists() and Image.open(port).size == (384, 384), 'home screen saved her portrait')
            # Straight after the app opens, the portrait it sends home shows her (not an empty frame while models load).
            port.unlink()
            pg.reload(wait_until='domcontentloaded', timeout=120000)
            pg.wait_for_function('window.MY_AVATAR && !MY_AVATAR.portraitDue() && MY_AVATAR.showingDesign()', timeout=180000); pg.wait_for_timeout(2500)
            seen = sum(1 for px in Image.open(port).convert('RGBA').get_flattened_data() if px[3] > 200) if port.exists() else 0
            check(seen > 384 * 384 // 6, f'the portrait sent when the app opens shows her ({seen} solid pixels)')
            # Lost browser data: the avatar comes back from the home screen.
            pg.evaluate("localStorage.removeItem('kid-avatar-v1')"); pg.reload(); ready(); pg.wait_for_timeout(2500)
            back = pg.evaluate('MY_AVATAR.state()')
            check(back['design'] == before['design'] and back['spent'] == before['spent'], 'a lost avatar is restored from the home screen')
            # Another app's new stars reach the home screen.
            ww = ctx.new_page(); ww.goto((APPS / 'word-wizard.html').as_uri()); ww.wait_for_timeout(2500)
            n0 = json.loads(get('/stars'))['earned']
            ww.evaluate("localStorage.setItem('word-wizard-v1', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('word-wizard-v1')), { stars: 100003 })))")
            for _ in range(30):
                ww.wait_for_timeout(500)
                if json.loads(get('/stars'))['earned'] == n0 + 3: break
            got = json.loads(get('/stars'))['earned']
            check(got == n0 + 3, f'stars earned in Word Wizard reach the home screen ({n0} then {got})')
            # Bad requests are refused.
            for path, body in [('/portrait', 'data:image/png;base64,AAAA'), ('/avatar', 'not json'), ('/stars', '{}')]:
                try:
                    urllib.request.urlopen(urllib.request.Request(URL + path, data=body.encode(), method='POST'), timeout=5); code = 200
                except urllib.error.HTTPError as e: code = e.code
                check(code == 400, f'service refuses a bad {path} ({code})')
            if shutil.which('xvfb-run'):
                subprocess.run(['mcs', '-langversion:5', '-r:System.Windows.Forms.dll', '-r:System.Drawing.dll', '-main:BadgeShot', '-out:' + str(tmp / 'Badge.exe'), str(tmp / 'KidHome.cs'), str(tmp / 'Badge.cs')], check=True, capture_output=True)
                shot = SHOTS / 'home-badge.png'
                subprocess.run(['xvfb-run', '-a', 'mono', str(tmp / 'Badge.exe'), str(shot)], env=env, capture_output=True, timeout=120)
                check(shot.exists(), 'home screen badge renders (see home-badge.png)')

        # Fits the tablet and a smaller window.
        for w, h in [(1440, 960), (1024, 700)]:
            pg.set_viewport_size({'width': w, 'height': h}); pg.evaluate("MY_AVATAR.setCat('hat')"); pg.wait_for_timeout(500)
            bad = pg.evaluate("document.body.scrollWidth > innerWidth || [...document.querySelectorAll('header *')].some(e => e.getBoundingClientRect().right > innerWidth - 210 && e.id !== 'saved' && e.getBoundingClientRect().width > 0 && getComputedStyle(e).opacity !== '0')")
            check(not bad, f'fits at {w} x {h} with the top-right corner clear for the Home pill')
            pg.screenshot(path=str(SHOTS / f'avatar-{w}.png'))
        # Finger taps: a tap on the side bar works once, also when the finger wobbles a few pixels.
        pg.goto('about:blank')   # frees the software renderer for this page
        tctx = b.new_context(viewport={'width': 1440, 'height': 960}, has_touch=True)
        tp = tctx.new_page(); tp.goto(AVATAR, wait_until='domcontentloaded', timeout=120000); ready(tp)
        tp.evaluate("window._n = 0; document.querySelector('nav button[data-c=face]').addEventListener('click', () => window._n++)")
        cdp = tctx.new_cdp_session(tp)
        def touch(sel, wobble):
            box = tp.locator(sel).bounding_box(); x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
            for k in range(1, 5 if wobble else 1): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + k, 'y': y + k * 2}]})
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); tp.wait_for_timeout(1000)
        touch('nav button[data-c=face]', False)
        check(tp.evaluate('window._n') == 1 and 'Face' in tp.inner_text('#panel h2'), f'a finger tap opens Face once ({tp.evaluate("window._n")} clicks)')
        touch('nav button[data-c=body]', True)
        check('Body' in tp.inner_text('#panel h2'), 'a finger tap that wobbles a little still opens Body')
        tctx.close()

        check(not errs, f'no page errors {errs[:3]}')
        b.close()
finally:
    if svc: svc.kill()
    shutil.rmtree(tmp, ignore_errors=True)

print('\n'.join('  ' + n for n in notes))
print('ALL OK' if not fails else 'FAILED %s' % fails)
sys.exit(1 if fails else 0)
