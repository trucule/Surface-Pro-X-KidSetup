#!/usr/bin/env python3
"""Puts the finger-tap fix (apps/shared/kid-tap.js) into every offline app that has a scrolling panel.

A scrolling panel is one with touch-action: pan-y in its page. In those, a finger tap that moves a few pixels can be
taken by the browser as the start of a scroll, so the button never gets its click; kid-tap.js turns such a touch into
the click. Each app gets, right after <head> (after the star counter block when there is one):
    <script>/* KID-TAP START */ ...apps/shared/kid-tap.js... /* KID-TAP END */</script>
Re-running replaces the block; an app that no longer scrolls has the block taken out.
"""
import glob, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lib = open(os.path.join(ROOT, 'apps', 'shared', 'kid-tap.js'), encoding='utf-8').read().strip()
block = '<script>/* KID-TAP START */\n' + lib.replace('</script', '<\\/script') + '\n/* KID-TAP END */</script>\n'
pat = re.compile(r'<script>/\* KID-TAP START \*/.*?/\* KID-TAP END \*/</script>\n', re.S)
after = re.compile(r'/\* KID-STARS END \*/</script>\n|/\* KID-VOICE END \*/</script>\n')

targets = sorted(glob.glob(os.path.join(ROOT, 'apps', '*.html')) + glob.glob(os.path.join(ROOT, 'apps', '*', 'index.html')))
changed = 0
for f in targets:
    s = open(f, encoding='utf-8').read()
    body = pat.sub('', s)
    if re.search(r'touch-action:\s*pan-y', body):
        if pat.search(s): new = pat.sub(lambda m: block, s, count=1)
        else:
            m = None
            for m in after.finditer(s): pass
            m = m or re.search(r'<head[^>]*>\n?', s)
            new = s[:m.end()] + block + s[m.end():]
    else:
        new = body
    if new != s:
        open(f, 'w', encoding='utf-8', newline='').write(new); changed += 1
        print('updated', os.path.relpath(f, ROOT))
print(changed, 'files changed')
