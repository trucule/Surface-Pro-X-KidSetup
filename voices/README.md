# Natural voices for the kid apps

The tablet is offline, and the only offline voices Edge can use are the old Windows SAPI ones (Zira, David).
Edge's "Natural" voices are a cloud service, and Windows 11's downloadable Narrator natural voices are not exposed
to browsers. So instead of a better live voice, every phrase the apps can say is synthesized once with a neural
voice on your PC and baked into the apps as MP3 clips. The apps play the clip; anything without a clip (a drawing
she learned through the API, a word outside the lists) still uses the Windows voice.

## Make the packs (on your PC, with Python 3.10+)
Pick an engine:

**edge** (best quality, free, needs internet while it runs; uses Microsoft's neural voices through the Edge
Read Aloud service, which is unofficial but has been stable for years):
```
pip install edge-tts
python voices\make-voices.py --engine edge --voice en-US-AnaNeural
```
`en-US-AnaNeural` is a child voice. `en-US-JennyNeural` and `en-US-AriaNeural` are warm adult voices. List them with
`edge-tts --list-voices`.

**piper** (fully local and open source, slightly less natural, needs ffmpeg on PATH):
```
pip install piper-tts
# download en_US-amy-medium.onnx and .onnx.json from https://github.com/rhasspy/piper/blob/master/VOICES.md
python voices\make-voices.py --engine piper --voice C:\piper\en_US-amy-medium.onnx
```

Either way the script synthesizes about 4,150 phrases (about 25 minutes with edge-tts, cached in `voices/cache/` so
re-runs only make what changed), then writes the packs into `apps\*.html` and `apps\draw-with-me\voices.js`.
Then run `Install-KidApps.ps1` on the tablet. `--list` shows the phrases without synthesizing; `--apps trace-with-me`
limits it to one app.

## When to re-run
After adding Draw With Me lessons (new step lines), new recipes, or changing any spoken string in an app. The
phrase builders at the top of `make-voices.py` mirror the apps' strings; if you change a prompt in an app, change
it there too, or it will quietly fall back to the Windows voice for that line.

## Size
Roughly 40 MB of clips in total, most of it in Draw With Me (`voices.js`) and Story Maker. The labs grow by
about 1 MB each.
