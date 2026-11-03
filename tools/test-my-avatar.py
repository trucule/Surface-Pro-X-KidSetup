#!/usr/bin/env python3
"""Tests My Avatar, the shared star counter, and the home screen's local service (KidService in KidTablet.psm1).

The real KidService C# code is compiled with mono (mcs) and run on 127.0.0.1:47821 with a scratch profile, so the app
talks to the same service the tablet runs. Checks: stars from every kind of saved progress add up; every app carries the
star counter; every look and every shop item builds; trying on is free, buying needs enough stars and spends them; the
design survives a reload and comes back from the home screen when the app's own copy is lost; the portrait is a clear
PNG; another app's new stars reach the home screen; the badge on the home screen renders. Screenshots go to
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
        pg.goto(AVATAR); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(1500)
        check(pg.evaluate('!!window.KID_STARS && !!window.MY_AVATAR'), 'app loads with the star counter')
        check(pg.evaluate("document.documentElement.innerHTML.includes('KID-VOICE START')"), 'narrator voice layer is in the app')
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
        pg.reload(); pg.wait_for_timeout(1500)
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

        # Every look builds.
        looks = pg.evaluate('MY_AVATAR.LOOK')
        for k, opts in looks.items():
            for v, _ in opts: pg.evaluate('([k, v]) => MY_AVATAR.set(k, v)', [k, v])
        for k in ['freckles', 'blush', 'lashes']:
            for v in [True, False]: pg.evaluate('([k, v]) => MY_AVATAR.set(k, v)', [k, v])
        check(not pg.evaluate('MY_AVATAR.errors') and not errs, f'every look option builds {pg.evaluate("MY_AVATAR.errors")[:3]} {errs[:2]}')
        pg.evaluate("MY_AVATAR.set('hair', 'long'); MY_AVATAR.set('pose', 'stand'); MY_AVATAR.set('top', 'tee')")

        # Trying on is free; buying needs stars.
        s0 = pg.evaluate('MY_AVATAR.state()')
        pg.evaluate("MY_AVATAR.setCat('hat')"); pg.click('.item[data-id="crown"]'); pg.wait_for_timeout(600)
        s1 = pg.evaluate('MY_AVATAR.state()')
        check(pg.is_visible('#tryon') and s1['spent'] == 0 and s1['design']['hat'] is None, 'trying the crown on shows it without buying it')
        pg.screenshot(path=str(SHOTS / 'avatar-tryon.png'))
        pg.click('#buy'); pg.wait_for_timeout(200); pg.screenshot(path=str(SHOTS / 'avatar-buy.png'))
        pg.click('#mbtns button'); pg.wait_for_timeout(400)
        s2 = pg.evaluate('MY_AVATAR.state()')
        check(s2['spent'] == 25 and 'crown' in s2['owned'] and s2['design']['hat'] == 'crown' and pg.evaluate('MY_AVATAR.balance()') == 36, f'buying the crown spends 25 stars and puts it on {s2["spent"]}')
        check(not pg.evaluate("MY_AVATAR.buy('princess')"), 'the princess gown (40) cannot be bought with 36 stars')
        pg.evaluate("MY_AVATAR.tryOn('princess')"); pg.wait_for_timeout(300)
        check('need' in pg.inner_text('#buy'), 'trying on something too dear says how many more stars she needs')
        pg.click('#buy'); pg.wait_for_timeout(200)
        check('more stars' in pg.inner_text('#mtext'), 'tapping buy without enough stars explains instead of buying')
        pg.click('#mbtns button'); pg.evaluate('MY_AVATAR.stopTrying()')
        pg.click('.item[data-id="crown"]'); pg.wait_for_timeout(200)
        check(pg.evaluate('MY_AVATAR.state().design.hat') is None and pg.evaluate('MY_AVATAR.state().spent') == 25, 'tapping an owned crown takes it off without spending again')
        pg.click('.item[data-id="crown"]')

        # Every shop item builds (a rich test balance).
        pg.evaluate("localStorage.setItem('word-wizard-v1', JSON.stringify({ stars: 5000 }))")
        items = pg.evaluate('MY_AVATAR.SHOP.map(i => i.id)')
        for it in items:
            ok = pg.evaluate('id => MY_AVATAR.buy(id)', it)
            if not ok and it != 'crown': fails.append('could not buy ' + it)
        check(not pg.evaluate('MY_AVATAR.errors'), f'every shop item ({len(items)}) builds {pg.evaluate("MY_AVATAR.errors")[:3]}')
        for slot in ['outfit', 'place', 'pet', 'back', 'neck', 'hat', 'shades', 'sparkle']:
            for it in pg.evaluate('s => MY_AVATAR.SHOP.filter(i => i.slot === s).map(i => i.id)', slot):
                pg.evaluate('([s, id]) => MY_AVATAR.set(s, id)', [slot, it])
        check(not pg.evaluate('MY_AVATAR.errors') and not errs, 'every item can be put on')
        looks_for_shots = [
            ('avatar-park', "MY_AVATAR.set('outfit', null); MY_AVATAR.set('place', 'park'); MY_AVATAR.set('pet', 'cat'); MY_AVATAR.set('hat', 'flowers'); MY_AVATAR.set('back', 'fairy'); MY_AVATAR.set('sparkle', 'glitter'); MY_AVATAR.set('pose', 'wave'); MY_AVATAR.set('shades', null); MY_AVATAR.set('neck', 'necklace'); MY_AVATAR.setView('body')"),
            ('avatar-castle', "MY_AVATAR.set('outfit', 'princess'); MY_AVATAR.set('place', 'castle'); MY_AVATAR.set('pet', 'dragon'); MY_AVATAR.set('hat', 'tiara'); MY_AVATAR.set('back', null); MY_AVATAR.set('pose', 'cheer'); MY_AVATAR.set('hair', 'pigtails')"),
            ('avatar-space', "MY_AVATAR.set('outfit', 'astronaut'); MY_AVATAR.set('place', 'space'); MY_AVATAR.set('pet', null); MY_AVATAR.set('hat', null); MY_AVATAR.set('pose', 'hips'); MY_AVATAR.set('skin', '#6F4128'); MY_AVATAR.set('hair', 'afro'); MY_AVATAR.set('hairColor', '#1E1612')"),
            ('avatar-face', "MY_AVATAR.set('outfit', null); MY_AVATAR.set('place', null); MY_AVATAR.set('sparkle', null); MY_AVATAR.set('hair', 'long'); MY_AVATAR.set('skin', '#E2AC82'); MY_AVATAR.set('hairColor', '#5C3A21'); MY_AVATAR.set('glasses', 'round'); MY_AVATAR.set('freckles', true); MY_AVATAR.setCat('face')"),
        ]
        for name, js in looks_for_shots:
            pg.evaluate(js); pg.wait_for_timeout(1300); pg.screenshot(path=str(SHOTS / f'{name}.png'))

        # Saved here, and kept after a reload.
        pg.wait_for_timeout(1200)
        before = pg.evaluate('MY_AVATAR.state()')
        pg.reload(); pg.wait_for_timeout(1500)
        after = pg.evaluate('MY_AVATAR.state()')
        check(after['design'] == before['design'] and after['owned'] == before['owned'] and after['spent'] == before['spent'], 'design, items and spent stars survive a reload')

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
            # Lost browser data: the avatar comes back from the home screen.
            pg.evaluate("localStorage.removeItem('kid-avatar-v1')"); pg.reload(); pg.wait_for_timeout(2500)
            back = pg.evaluate('MY_AVATAR.state()')
            check(back['design'] == before['design'] and back['spent'] == before['spent'], 'a lost avatar is restored from the home screen')
            # Another app's new stars reach the home screen.
            ww = ctx.new_page(); ww.goto((APPS / 'word-wizard.html').as_uri()); ww.wait_for_timeout(2500)
            n0 = json.loads(get('/stars'))['earned']
            ww.evaluate("localStorage.setItem('word-wizard-v1', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('word-wizard-v1')), { stars: 5003 })))")
            ww.wait_for_timeout(2000)
            check(json.loads(get('/stars'))['earned'] == n0 + 3, 'stars earned in Word Wizard reach the home screen')
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
        check(not errs, f'no page errors {errs[:3]}')
        b.close()
finally:
    if svc: svc.kill()
    shutil.rmtree(tmp, ignore_errors=True)

print('\n'.join('  ' + n for n in notes))
print('ALL OK' if not fails else 'FAILED %s' % fails)
sys.exit(1 if fails else 0)
