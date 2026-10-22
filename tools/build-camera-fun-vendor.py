"""Rebuilds apps/camera-fun/facemesh/ (offline face tracking) from the @mediapipe/face_mesh npm package.

The kiosk only lets local apps load plain <script src> files: fetch() and XHR of file:// paths fail, and data: and
blob: URLs are blocked. So the model, graph and WebAssembly binary are stored as base64 in .js files, and the app's
loader serves them from memory when face_mesh.js asks for them. face_mesh.js is patched to load its helper scripts
without crossorigin="anonymous" (CORS fails on file://).

Run: python3 tools/build-camera-fun-vendor.py   (needs npm; MediaPipe is Apache 2.0, see facemesh/LICENSE.txt)
"""
import base64, io, pathlib, subprocess, tarfile, tempfile

VERSION = '0.4.1633559619'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'apps' / 'camera-fun' / 'facemesh'
COPY = ['face_mesh.js', 'face_mesh_solution_simd_wasm_bin.js', 'face_mesh_solution_packed_assets_loader.js']
EMBED = ['face_mesh.binarypb', 'face_mesh_solution_packed_assets.data', 'face_mesh_solution_simd_wasm_bin.wasm']

def main():
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['npm', 'pack', f'@mediapipe/face_mesh@{VERSION}', '--silent'], cwd=tmp, check=True, capture_output=True)
        tgz = next(pathlib.Path(tmp).glob('*.tgz'))
        files = {}
        with tarfile.open(tgz) as t:
            for m in t.getmembers():
                if m.isfile(): files[m.name.split('/', 1)[1]] = t.extractfile(m).read()
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*'): old.unlink()
    for n in COPY:
        data = files[n].decode('utf-8')
        if n == 'face_mesh.js':
            patch = 'b.setAttribute("crossorigin","anonymous");'
            assert data.count(patch) == 1, 'face_mesh.js changed; update the crossorigin patch'
            data = data.replace(patch, '')
        (OUT / n).write_text(data, encoding='utf-8')
    for n in EMBED:
        b64 = base64.b64encode(files[n]).decode('ascii')
        (OUT / (n + '.js')).write_text(f"(window.CAMFUN_FILES = window.CAMFUN_FILES || {{}})['{n}'] = '{b64}';\n", encoding='ascii')
    (OUT / 'LICENSE.txt').write_text(
        f'MediaPipe Face Mesh {VERSION} (npm @mediapipe/face_mesh), Copyright Google LLC, Apache License 2.0:\n'
        'https://www.apache.org/licenses/LICENSE-2.0\n'
        'Changes: face_mesh.js loads its scripts without the crossorigin attribute; binary files are stored as base64 .js.\n')
    total = sum(p.stat().st_size for p in OUT.glob('*'))
    print(f'facemesh/ rebuilt: {len(list(OUT.glob("*")))} files, {total / 1e6:.1f} MB')

main()
