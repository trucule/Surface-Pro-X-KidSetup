"""Checks Camera Fun with a fake camera showing a face (tools/testdata/astronaut-face.jpg, NASA, public domain):
every filter compiles and draws, face tracking finds the face, every sticker draws on it, pictures and photo strips
are saved, shown and deleted, stamps work, and nothing uses blob: or data: URLs (the kiosk blocks them).
Run: python3 tools/test-camera-fun.py   (needs ffmpeg and playwright)"""
import pathlib, subprocess, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = (ROOT / 'apps' / 'camera-fun' / 'index.html').as_uri()
SHOTS = pathlib.Path('/tmp/claude-0/tests'); SHOTS.mkdir(parents=True, exist_ok=True)
Y4M = SHOTS / 'face.y4m'

GUARD = """
window.__urls = [];
const oc = URL.createObjectURL; URL.createObjectURL = function (x) { window.__urls.push('blob'); return oc.apply(this, arguments); };
"""

def main():
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-loop', '1', '-i', str(ROOT / 'tools/testdata/astronaut-face.jpg'), '-vf',
                    'scale=1280:-2,crop=1280:720:0:0,format=yuv420p', '-t', '4', '-r', '10', str(Y4M)], check=True)
    problems = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={Y4M}',
                                    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        ctx = b.new_context(viewport={'width': 1440, 'height': 960}); ctx.add_init_script(GUARD)
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
        pg.goto(APP); pg.wait_for_timeout(1500)
        ids = pg.evaluate("() => CF.C.filters.map(f => f.id)")
        for fid in ids:
            pg.evaluate(f"() => CF.pickFilter('{fid}')"); pg.wait_for_timeout(250)
            if fid in ('none', 'comic', 'popart', 'kaleido', 'melt', 'heat'): pg.screenshot(path=str(SHOTS / f'cf-filter-{fid}.png'))
        comp = pg.evaluate("() => CF.errors.filter(e => e.startsWith('filter'))")
        print('filters:', len(ids), 'compile errors:', comp); problems += comp
        # Face tracking and every sticker.
        pg.evaluate("() => CF.pickFilter('none')")
        pg.evaluate("() => CF.toggleSticker('tophat')")
        pg.wait_for_function("() => CF.faceState() === 'ready' || CF.faceState() === 'failed'", timeout=60000)
        pg.wait_for_function("() => CF.faces().length > 0", timeout=30000)
        f = pg.evaluate("() => { const f = CF.faces()[0]; return { n: CF.faces().length, w: Math.round(f.w), x: Math.round(f.pts.nose.x), y: Math.round(f.pts.nose.y), roll: f.roll } }")
        print('face:', pg.evaluate("CF.faceState()"), f)
        if f['w'] < 60: problems.append(f'face too small {f}')
        sids = pg.evaluate("() => CF.C.stickers.map(s => s.id)")
        pg.evaluate("() => CF.toggleSticker('tophat')")
        for i, sid in enumerate(sids):
            pg.evaluate(f"() => CF.toggleSticker('{sid}')"); pg.wait_for_timeout(300)
            if i % 4 == 3 or i == len(sids) - 1:
                pg.screenshot(path=str(SHOTS / f'cf-stickers-{i}.png'))
                for s in sids[max(0, i - 3):i + 1]: pg.evaluate(f"() => CF.toggleSticker('{s}')")
        se = pg.evaluate("() => CF.errors.filter(e => e.startsWith('sticker'))"); print('stickers:', len(sids), 'errors:', se); problems += se
        # Face filters with a face.
        for fid in ('bighead', 'alien', 'swirl'):
            pg.evaluate(f"() => CF.pickFilter('{fid}')"); pg.wait_for_timeout(400); pg.screenshot(path=str(SHOTS / f'cf-face-{fid}.png'))
        # Pictures.
        pg.evaluate("() => { window.CF_FAST = true; CF.state.timer = 0; }")
        pg.evaluate("() => CF.toggleSticker('cat')")
        pg.wait_for_timeout(300)
        pg.evaluate("() => CF.snap()"); pg.wait_for_timeout(500)
        pg.evaluate("() => CF.snapStrip()"); pg.wait_for_timeout(1500)
        n = pg.evaluate("() => CF.allPhotos().then(a => a.map(p => [p.w, p.h, p.blob.size]))")
        print('photos:', n)
        if len(n) != 2 or any(sz < 5000 for _, _, sz in n): problems.append(f'photos {n}')
        pg.click('#gallery'); pg.wait_for_timeout(800)
        thumbs = pg.evaluate("() => [...document.querySelectorAll('#grid canvas')].map(c => c.width)")
        print('gallery thumbs:', thumbs)
        if len(thumbs) != 2 or min(thumbs) < 50: problems.append(f'thumbs {thumbs}')
        pg.screenshot(path=str(SHOTS / 'cf-gallery.png'))
        pg.locator('#grid canvas').first.click(); pg.wait_for_timeout(500); pg.screenshot(path=str(SHOTS / 'cf-view.png'))
        pg.click('#del'); pg.click('#del'); pg.wait_for_timeout(500)
        left = pg.evaluate("() => CF.allPhotos().then(a => a.length)")
        if left != 1: problems.append(f'delete left {left}')
        pg.click('#galClose')
        # Stamps.
        pg.click('#tabs button[data-tab=stamps]'); pg.mouse.click(400, 300); pg.mouse.click(600, 350)
        if pg.evaluate("() => CF.stamps().length") != 2: problems.append('stamps')
        pg.wait_for_timeout(200); pg.screenshot(path=str(SHOTS / 'cf-stamps.png'))
        urls = pg.evaluate("() => window.__urls.concat([...document.querySelectorAll('[src]')].map(e => e.src).filter(s => /^(blob|data):/.test(s)))")
        if urls: problems.append(f'blob/data urls: {urls}')
        other = pg.evaluate("() => CF.errors"); print('app errors:', other); problems += [e for e in other if e not in comp + se]
        print('page errors:', errs); problems += errs
        b.close()
    print('PROBLEMS:' if problems else 'ALL OK', problems[:20])
    sys.exit(1 if problems else 0)

main()
