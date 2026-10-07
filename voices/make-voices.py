#!/usr/bin/env python3
r"""
Make natural voice packs for the kid apps and bake them into the HTML files.

Run on your PC (not the tablet), from the KidTablet-setup folder:

    python voices\make-voices.py --engine edge  --voice en-US-AnaNeural
    python voices\make-voices.py --engine piper --voice C:\piper\en_US-amy-medium.onnx

Engines
  edge   Microsoft's neural voices through the free Edge Read Aloud service (pip install edge-tts). Needs internet
         while running. en-US-AnaNeural is a child voice; en-US-JennyNeural / AriaNeural are warm adult voices.
  piper  Fully local, open-source neural TTS (pip install piper-tts; download a voice .onnx + .json from
         https://github.com/rhasspy/piper/blob/master/VOICES.md). Needs ffmpeg on PATH to encode MP3.

What it does
  1. Collects every phrase each app can say (lesson steps, recipe steps, counting words, story sentences, prompts).
  2. Synthesizes each phrase once into voices/cache/<engine>/<voice>/<hash>.mp3 (re-runs only make what is missing).
  3. Writes window.VOICE_PACK = {phrase: base64 mp3} into each app: inline for the single-file apps and the labs,
     apps/draw-with-me/voices.js for Draw With Me.
Then run Install-KidApps.ps1 on the tablet as usual. Phrases without a clip (e.g. a drawing she learned from the API)
fall back to the Windows voice, so a partial pack is safe.
r"""
import argparse, asyncio, base64, hashlib, json, os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS = os.path.join(ROOT, 'apps')
def key(t): return re.sub(r'\s+', ' ', t.strip()).lower()
def cap(s): return s[:1].upper() + s[1:]

# ---------------------------------------------------------------------------
# Phrases per app. Each builder mirrors the strings the app can produce.
# ---------------------------------------------------------------------------
WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty']

def phrases_trace():
    W = {'A':'apple','B':'bear','C':'cat','D':'dog','E':'egg','F':'fish','G':'grapes','H':'hat','I':'ice cream','J':'jellyfish','K':'kite','L':'lion','M':'moon','N':'nest','O':'octopus','P':'pig','Q':'queen','R':'rainbow','S':'sun','T':'turtle','U':'umbrella','V':'violin','W':'whale','X':'xylophone','Y':'yarn','Z':'zebra'}
    out = ['Trace With Me! Trace the letter A.']
    for l, w in W.items():
        out += [f'Trace the letter {l}.', f'You did it! {l} is for {w}!', f'Trace the small letter {l}.', f'You did it! Small {l}, for {w}!']
    for n, w in enumerate(WORDS[:10]):
        out.append(f'Trace the number {w}.')
        out.append('You did it! Zero! Nothing at all.' if n == 0 else 'You did it! ' + cap(w) + '! Count them: ' + ', '.join(WORDS[1:n + 1]) + '.')
    for s in ['circle','square','triangle','heart','star','diamond']:
        out += [f'Trace the {s}.', f'You did it! A {s}!', f'Try to stay inside the {s}. Tap the drop to start over.']
    out.append('Try to stay inside the letter. Tap the drop to start over.')
    out += [f'You have {n} stickers!' for n in range(0, 75)]
    return out

def phrases_count():
    NAMES = ['apples','chicks','stars','frogs','balloons','fish','strawberries','butterflies','turtles','flowers','cars','cookies']
    out = list(WORDS) + ['Wow! Bigger numbers now!']
    for nm in NAMES:
        out += [f'How many {nm}?', f'Count With Me! How many {nm}?', f'How many {nm}? Tap each one to count.']
        for n in range(1, 21):
            out += [f'Yes! {cap(WORDS[n])} {nm}!', f'Yes! {cap(WORDS[n])} {nm}. Perfect!']
        for n in range(1, 13):
            out += [f'Put {n} {nm} in the basket', f'Count With Me! Put {n} {nm} in the basket', f'Put {WORDS[n]} {nm} in the basket. Then tap the check.']
    for n in range(0, 21):
        out += [f'Not {WORDS[n]}. Count them again!', f'Oops, {WORDS[n]}']
        for m in range(1, 13):
            if n < m: out.append(f'Only {WORDS[n]}. We need {WORDS[m]}. Add some more!')
            if n > m: out.append(f'That is {WORDS[n]}. Too many! Take some out.')
    return out

def phrases_story():
    # Only the fixed prompts: the story text itself is written live (or by the built-in story) and spoken by the
    # live or Windows voices, so it is not pre-rendered.
    CAST = [('Bun','bunny'),('Spark','little dragon'),('Beep','robot'),('Twinkle','unicorn'),('Pip','penguin'),('Scarlett','girl'),('Hop','frog'),('Rusty','fox'),('Luna','owl'),('Mo','moose'),('Zip','mouse'),('Captain Clam','crab')]
    PLACES = ['a castle','the moon','an island','a forest','the beach','a fair','a snowy mountain','cupcake town','a train','under the sea']
    out = ['Story Maker! Who is in the story?', 'Three friends is plenty!', 'What should happen next?', 'The end! Tap the dice for another story.']
    out += [f'{n} the {k}!' for n, k in CAST] + PLACES + ['Adventure','Mystery','Friendship','Silly','Bedtime','Cozy','A little trouble','Big trouble','Short','Long']
    return out

def phrases_draw():
    out = ['Saved! Great job!', 'Great job!', 'Pick a magic filter for your picture!', 'Time to color! Tap a shape with the paint bucket, or paint with a brush.', 'Sketch lines hidden!', 'Pick something to draw!']
    t = open(os.path.join(APPS, 'draw-with-me', 'library.js'), encoding='utf-8').read()
    lib = json.loads(t[t.index('['):t.rindex(']') + 1])
    names = set()
    for L in lib:
        names.add(L['name'])
        for st in L['steps']: out.append(st['say'])
    html = open(os.path.join(APPS, 'draw-with-me', 'index.html'), encoding='utf-8').read()
    out += re.findall(r"say: '((?:[^'\\]|\\.)*)'", html)
    for m in re.finditer(r"name: '([^']+)', words:", html): names.add(m.group(1))
    for n in sorted(names):
        out += [f"Let's draw a {n.lower()}!", f'Today we draw a {n.lower()}!', f"Surprise! Let's draw a {n.lower()}!"]
    return [s.replace("\\'", "'").replace('\u2019', "'") for s in out]

def phrases_music():
    return ['Get ready...', 'Say something!', 'Got it!', 'I did not hear anything. Try again!', 'I cannot hear the microphone.', 'Now your voice can sing!']

def phrases_labs(which):
    html = open(os.path.join(APPS, which + '.html'), encoding='utf-8').read()
    big = max(html.split('\n'), key=len)
    steps = re.findall(r'text:"((?:[^"\\]|\\.)*)"', big)
    names = re.findall(r'\bname:"([^"]{2,40})",icon:"', big)
    out = ['Ouch! Ouch! Ouch!', 'All done!'] + steps + [f'You did it! You made {n}!' for n in names]
    return out

BUILDERS = {'trace-with-me': phrases_trace, 'count-with-me': phrases_count, 'story-maker': phrases_story, 'draw-with-me': phrases_draw, 'music-box': phrases_music,
            'kitchen-lab': lambda: phrases_labs('kitchen-lab'), 'chemistry-lab': lambda: phrases_labs('chemistry-lab')}

# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------
def synth_edge(texts, voice, cache):
    import edge_tts
    async def one(text, path):
        await edge_tts.Communicate(text, voice, rate='-5%').save(path)
    async def run():
        sem = asyncio.Semaphore(6)
        async def guarded(t, p):
            async with sem: await one(t, p)
        await asyncio.gather(*[guarded(t, p) for t, p in zip(texts, cache)])
    asyncio.run(run())

def synth_piper(texts, model, cache):
    for t, p in zip(texts, cache):
        wav = p[:-4] + '.wav'
        subprocess.run(['piper', '--model', model, '--output_file', wav], input=t.encode('utf-8'), check=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ar', '24000', '-ac', '1', '-b:a', '32k', p], check=True)
        os.remove(wav)

def inject(path, pack_js, inline=True):
    s = open(path, encoding='utf-8').read()
    if inline:
        s2 = re.sub(r'<script id="voicepack">.*?</script>', lambda m: '<script id="voicepack">' + pack_js + '</script>', s, count=1, flags=re.S)
        assert s2 != s or pack_js in s, path + ' has no voicepack placeholder'
        open(path, 'w', encoding='utf-8').write(s2)
    else:
        open(path, 'w', encoding='utf-8').write('// Voice pack for Draw With Me, made by voices/make-voices.py\n' + pack_js + '\n')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--engine', choices=['edge', 'piper'], required=True)
    ap.add_argument('--voice', required=True, help='edge voice name, or path to a piper .onnx model')
    ap.add_argument('--apps', default='all', help='comma list: ' + ','.join(BUILDERS))
    ap.add_argument('--list', action='store_true', help='only print the phrases per app')
    a = ap.parse_args()
    apps = list(BUILDERS) if a.apps == 'all' else a.apps.split(',')
    vtag = re.sub(r'[^A-Za-z0-9]+', '-', os.path.basename(a.voice))
    cache_dir = os.path.join(ROOT, 'voices', 'cache', a.engine, vtag); os.makedirs(cache_dir, exist_ok=True)
    for app in apps:
        phrases = sorted({key(p): p for p in BUILDERS[app]()}.values(), key=key)
        chars = sum(len(p) for p in phrases)
        print(f'{app}: {len(phrases)} phrases, {chars} characters')
        if a.list:
            for p in phrases: print('   ', p)
            continue
        paths = [os.path.join(cache_dir, hashlib.sha1(key(p).encode()).hexdigest() + '.mp3') for p in phrases]
        todo = [(p, f) for p, f in zip(phrases, paths) if not os.path.exists(f)]
        if todo:
            print(f'   synthesizing {len(todo)} new clips')
            (synth_edge if a.engine == 'edge' else synth_piper)([t for t, _ in todo], a.voice, [f for _, f in todo])
        pack = {key(p): base64.b64encode(open(f, 'rb').read()).decode() for p, f in zip(phrases, paths) if os.path.exists(f)}
        js = 'window.VOICE_PACK = ' + json.dumps(pack, separators=(',', ':')) + ';'
        if app == 'draw-with-me': inject(os.path.join(APPS, 'draw-with-me', 'voices.js'), js, inline=False)
        elif app == 'story-maker': inject(os.path.join(APPS, 'story-maker', 'index.html'), js)
        else: inject(os.path.join(APPS, app + '.html'), js)
        print(f'   wrote {len(pack)} clips, {len(js) // 1024} KB')
if __name__ == '__main__': main()
