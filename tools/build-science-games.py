#!/usr/bin/env python3
"""Build Circuit Lab, Ecosystem Aquarium and Planet Explorer.

Each source in src/science-games/<slug>.src.html has a /*@@THREE@@*/ marker. This script fetches three.js r149
(MIT) with `npm pack three@0.149.0`, inlines build/three.min.js at the marker and writes apps/<slug>.html, so each
app stays one offline file. Usage: python3 tools/build-science-games.py [slug ...]
"""
import pathlib, subprocess, sys, tarfile, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src' / 'science-games'
SLUGS = ['circuit-lab', 'ecosystem-aquarium', 'planet-explorer']

def three_js():
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['npm', 'pack', 'three@0.149.0', '--silent'], cwd=tmp, check=True, stdout=subprocess.DEVNULL)
        with tarfile.open(pathlib.Path(tmp) / 'three-0.149.0.tgz') as t:
            return t.extractfile('package/build/three.min.js').read().decode('utf-8')

def main(slugs):
    three = three_js()
    for slug in slugs:
        s = (SRC / (slug + '.src.html')).read_text(encoding='utf-8')
        if '/*@@THREE@@*/' not in s: sys.exit(slug + ': no /*@@THREE@@*/ marker')
        for bad in ('\u2014', 'fetch(', 'blob:', 'data:'):
            if bad in s: sys.exit('%s: source contains %r' % (slug, bad))
        out = ROOT / 'apps' / (slug + '.html')
        out.write_text(s.replace('/*@@THREE@@*/', three), encoding='utf-8')
        print('wrote', out.relative_to(ROOT), out.stat().st_size, 'bytes')

if __name__ == '__main__':
    main(sys.argv[1:] or SLUGS)
