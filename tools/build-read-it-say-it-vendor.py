"""Rebuilds apps/read-it-say-it/vosk/ (offline speech recognition) from npm packages.

The kiosk only lets local apps load plain <script src> files: fetch() and XHR of file:// paths fail, Workers cannot
start from file:// pages, and data: and blob: URLs are blocked. So the Vosk speech engine runs on the page itself:
  vosk-engine.js   the Emscripten module from vosk-browser 0.0.8 (Apache 2.0), taken out of its Web Worker wrapper.
                   Its WebAssembly binary is moved into window.RISI_WASM (base64) and handed over as wasmBinary, so
                   nothing is fetched. document.currentScript is guarded because the engine starts after load.
  model-*.js       vosk-model-small-en-us-0.15 (Alpha Cephei, Apache 2.0), carried on npm inside transcribe2texts
                   1.0.6. Each file is gzipped and stored as base64 in window.RISI_MODEL. graph/Gr.fst (the big
                   free-speech language model) is left out: the app always listens with a grammar made of the
                   sentence's own words, which only needs graph/HCLr.fst. Its word list is kept as graph/words.txt.

Run: python3 tools/build-read-it-say-it-vendor.py   (needs npm)
"""
import base64, gzip, pathlib, re, struct, subprocess, tarfile, tempfile

OUT = pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'read-it-say-it' / 'vosk'
MODEL = 'vosk-model-small-en-us-0.15'
SKIP = {'graph/Gr.fst', 'README'}
CHUNK = 6_000_000  # base64 characters per model-N.js file


def words_txt(gr):
    """graph/Gr.fst carries the model's word list as its symbol table. Vosk reads graph/words.txt when it exists."""
    p = 0
    def num(f, n):
        nonlocal p; v = struct.unpack_from(f, gr, p)[0]; p += n; return v
    def text():
        nonlocal p; n = num('<i', 4); v = gr[p:p + n]; p += n; return v.decode('utf-8')
    assert num('<i', 4) == 2125659606, 'Gr.fst is not an OpenFst file'
    text(); text(); num('<i', 4); flags = num('<i', 4); p += 8 + 24
    assert flags & 1 and num('<i', 4) == 2125658996, 'Gr.fst has no symbol table'
    text(); num('<q', 8); count = num('<q', 8)
    rows = []
    for _ in range(count):
        w = text(); rows.append(f'{w} {num("<q", 8)}\n')
    return ''.join(rows).encode('utf-8')


def pack(spec, tmp):
    subprocess.run(['npm', 'pack', spec, '--silent'], cwd=tmp, check=True, capture_output=True)
    name = spec.rsplit('@', 1)[0].lstrip('@').replace('/', '-')
    return next(pathlib.Path(tmp).glob(name + '-*.tgz'))


def main():
    with tempfile.TemporaryDirectory() as tmp:
        with tarfile.open(pack('vosk-browser@0.0.8', tmp)) as t:
            vosk_js = t.extractfile('package/dist/vosk.js').read().decode('utf-8')
        model = {}
        with tarfile.open(pack('transcribe2texts@1.0.6', tmp)) as t:
            for m in t.getmembers():
                p = m.name.split('/', 1)[1]
                if m.isfile() and p.startswith(MODEL + '/'):
                    rel = p[len(MODEL) + 1:]
                    if rel == 'graph/Gr.fst': model['graph/words.txt'] = words_txt(t.extractfile(m).read())
                    if rel not in SKIP: model[rel] = t.extractfile(m).read()

    worker_b64 = re.search(r"createBase64WorkerFactory\('([A-Za-z0-9+/=]+)'", vosk_js).group(1)
    worker = base64.b64decode(worker_b64).decode('latin1')
    start = worker.index('var voskWasm = {exports: {}};')
    end = worker.index('var LoadVosk = voskWasm.exports;')
    engine = worker[start:end]
    m = re.search(r'wasmBinaryFile="data:application/octet-stream;base64,([A-Za-z0-9+/=]+)"', engine)
    assert m, 'vosk.js changed; update the wasm patch'
    wasm_b64 = m.group(1)
    engine = engine[:m.start()] + 'wasmBinaryFile="vosk.wasm"' + engine[m.end():]
    guard = 'if(typeof document!=="undefined"){return document.currentScript.src}'
    assert engine.count(guard) == 1, 'vosk.js changed; update the currentScript patch'
    engine = engine.replace(guard, 'if(typeof document!=="undefined"){return (document.currentScript||location).href||location.href}')

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*'): old.unlink()
    (OUT / 'vosk-engine.js').write_text(
        '/* vosk-browser 0.0.8 (https://github.com/ccoreilly/vosk-browser), Apache License 2.0. Vosk and Kaldi are\n'
        '   Apache License 2.0. Changed: runs on the page instead of in a Worker; the wasm binary is window.RISI_WASM. */\n'
        f"window.RISI_WASM = '{wasm_b64}';\n(function () {{\n{engine}\nwindow.LoadVosk = voskWasm.exports;\n}})();\n",
        encoding='latin1')

    # Model files, gzipped, base64, split into chunks of about CHUNK characters.
    parts, cur, size = [], [], 0
    for rel in sorted(model):
        b64 = base64.b64encode(gzip.compress(model[rel], 9, mtime=0)).decode('ascii')
        pieces = [b64[i:i + CHUNK] for i in range(0, len(b64), CHUNK)] or ['']
        for k, piece in enumerate(pieces):
            cur.append((rel, k, len(pieces), piece)); size += len(piece)
            if size >= CHUNK: parts.append(cur); cur, size = [], 0
    if cur: parts.append(cur)
    for n, part in enumerate(parts):
        lines = ['(function (M) {']
        for rel, k, total, piece in part:
            lines.append(f"  (M['{rel}'] = M['{rel}'] || {{ n: {total}, parts: [] }}).parts[{k}] = '{piece}';")
        lines.append('})(window.RISI_MODEL = window.RISI_MODEL || {});')
        (OUT / f'model-{n}.js').write_text('\n'.join(lines) + '\n', encoding='ascii')
    (OUT / 'model-list.js').write_text(
        f"window.RISI_MODEL_FILES = {len(parts)}; window.RISI_MODEL_NAMES = {sorted(model)!r};\n".replace("'", '"'),
        encoding='ascii')
    (OUT / 'LICENSE.txt').write_text(
        'vosk-browser 0.0.8 (npm vosk-browser), Copyright Ciro Mattia Gonano and contributors, Apache License 2.0.\n'
        'Vosk speech recognition toolkit and Kaldi, Apache License 2.0.\n'
        f'{MODEL}, Copyright 2020 Alpha Cephei Inc, Apache License 2.0 (npm transcribe2texts 1.0.6 carries it).\n'
        'https://www.apache.org/licenses/LICENSE-2.0\n'
        'Changes: the engine runs on the page, not in a Worker; binary files are stored as base64 .js;\n'
        'graph/Gr.fst is left out because recognition always uses a grammar.\n')
    total = sum(p.stat().st_size for p in OUT.glob('*'))
    print(f'vosk/ rebuilt: {len(list(OUT.glob("*")))} files, {total / 1e6:.1f} MB')


main()
