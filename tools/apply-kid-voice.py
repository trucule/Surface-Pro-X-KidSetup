#!/usr/bin/env python3
"""Puts the shared narrator voice (apps/shared/kid-voice.js) into every offline app.

Each app gets, right after <head>:
    <script src="voice-config.js"></script>   (written on the tablet by Update-KidAppConfig; missing means Windows voice)
    <script>/* KID-VOICE START */ ...apps/shared/kid-voice.js... /* KID-VOICE END */</script>
Re-running replaces the block, so edit apps/shared/kid-voice.js and run this again. Story Maker keeps its own voices.
Run it after any build script that regenerates an app (tools/build-science-games.py, src/lab-games).
"""
import glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'story-maker'}
lib = open(os.path.join(ROOT, 'apps', 'shared', 'kid-voice.js'), encoding='utf-8').read().strip()
block = ('<script src="voice-config.js"></script>\n<script>/* KID-VOICE START */\n' + lib.replace('</script', '<\\/script') +
         '\n/* KID-VOICE END */</script>\n')
pat = re.compile(r'<script src="voice-config\.js"></script>\n<script>/\* KID-VOICE START \*/.*?/\* KID-VOICE END \*/</script>\n', re.S)

targets = sorted(glob.glob(os.path.join(ROOT, 'apps', '*.html')) + glob.glob(os.path.join(ROOT, 'apps', '*', 'index.html')) +
                 glob.glob(os.path.join(ROOT, 'src', 'science-games', '*.src.html')) + glob.glob(os.path.join(ROOT, 'src', 'lab-games', 'page.html')))
changed = 0
for f in targets:
    name = os.path.basename(os.path.dirname(f)) if f.endswith('index.html') else os.path.basename(f).split('.')[0]
    if name in SKIP:
        continue
    s = open(f, encoding='utf-8').read()
    if 'speechSynthesis' not in s and 'page.html' not in f and '.src.html' not in f:
        continue
    if pat.search(s):
        new = pat.sub(lambda m: block, s, count=1)
    else:
        m = re.search(r'<head[^>]*>\n?', s)
        if not m:
            print('no <head>:', f); continue
        new = s[:m.end()] + block + s[m.end():]
    if new != s:
        open(f, 'w', encoding='utf-8', newline='').write(new); changed += 1
    print(('updated ' if new != s else 'current ') + os.path.relpath(f, ROOT))
print(changed, 'files changed')
