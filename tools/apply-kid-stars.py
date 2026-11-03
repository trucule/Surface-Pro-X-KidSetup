#!/usr/bin/env python3
"""Puts the shared star counter (apps/shared/kid-stars.js) into every offline app.

Each app gets, right after <head> (after the narrator voice block when there is one):
    <script>/* KID-STARS START */ ...apps/shared/kid-stars.js... /* KID-STARS END */</script>
Re-running replaces the block, so edit apps/shared/kid-stars.js and run this again. Run it after any build script that
regenerates an app (tools/build-science-games.py, src/lab-games), the same as tools/apply-kid-voice.py.
"""
import glob, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lib = open(os.path.join(ROOT, 'apps', 'shared', 'kid-stars.js'), encoding='utf-8').read().strip()
block = '<script>/* KID-STARS START */\n' + lib.replace('</script', '<\\/script') + '\n/* KID-STARS END */</script>\n'
pat = re.compile(r'<script>/\* KID-STARS START \*/.*?/\* KID-STARS END \*/</script>\n', re.S)
voice_end = re.compile(r'/\* KID-VOICE END \*/</script>\n')

targets = sorted(glob.glob(os.path.join(ROOT, 'apps', '*.html')) + glob.glob(os.path.join(ROOT, 'apps', '*', 'index.html')) +
                 glob.glob(os.path.join(ROOT, 'src', 'science-games', '*.src.html')) + glob.glob(os.path.join(ROOT, 'src', 'lab-games', 'page.html')))
changed = 0
for f in targets:
    s = open(f, encoding='utf-8').read()
    if pat.search(s):
        new = pat.sub(lambda m: block, s, count=1)
    else:
        m = voice_end.search(s) or re.search(r'<head[^>]*>\n?', s)
        if not m:
            print('no <head>:', f); continue
        new = s[:m.end()] + block + s[m.end():]
    if new != s:
        open(f, 'w', encoding='utf-8', newline='').write(new); changed += 1
    print(('updated ' if new != s else 'current ') + os.path.relpath(f, ROOT))
print(changed, 'files changed')
