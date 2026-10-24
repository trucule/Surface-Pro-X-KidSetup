// Speech checking for Read It Say It Make It.
// Engines, best first:
//   vosk       Offline. The Vosk engine and a small English model live in vosk/*.js (see tools/build-read-it-say-it-vendor.py)
//              and run on the page. It listens with a grammar made of the sentence's words plus "[unk]".
//   webspeech  The browser's own recognizer (webkitSpeechRecognition), used only if Vosk cannot start.
//   tap        No microphone check: she taps each word as she reads it out loud.
window.RISpeech = (function () {
  const S = { engine: 'tap', status: 'idle', error: '', progress: 0, vocab: null };
  const loadScript = src => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res;
    s.onerror = () => rej(new Error('could not load ' + src)); document.head.appendChild(s);
  });
  function b64bytes(str) { const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  async function gunzip(u8) {
    const st = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(st).arrayBuffer());
  }
  const norm = w => String(w).toLowerCase().replace(/[^a-z']/g, '');
  S.norm = norm;

  let V = null, model = null, loading = null;
  S.loadVosk = function (onProgress) {
    if (loading) return loading;
    S.status = 'loading';
    loading = (async () => {
      if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
      await loadScript('vosk/model-list.js');
      const n = window.RISI_MODEL_FILES, steps = n + 3; let step = 0;
      const tick = () => { S.progress = ++step / steps; if (onProgress) onProgress(S.progress); };
      await loadScript('vosk/vosk-engine.js'); tick();
      for (let i = 0; i < n; i++) { await loadScript('vosk/model-' + i + '.js'); tick(); }
      const wasm = b64bytes(window.RISI_WASM); window.RISI_WASM = null;
      V = await window.LoadVosk({ wasmBinary: wasm, print() {}, printErr() {} });
      try { V.SetLogLevel(-1); } catch (e) {}
      tick();
      const made = new Set();
      const mkdirs = path => { const parts = path.split('/'); let cur = ''; for (let i = 0; i < parts.length - 1; i++) { cur += '/' + parts[i]; if (!made.has(cur)) { try { V.FS.mkdir('/m' + cur); } catch (e) {} made.add(cur); } } };
      V.FS.mkdir('/m');
      for (const name of window.RISI_MODEL_NAMES) {
        const e = window.RISI_MODEL[name];
        if (!e || e.parts.length !== e.n) throw new Error('model file missing: ' + name);
        const bytes = await gunzip(b64bytes(e.parts.join('')));
        delete window.RISI_MODEL[name];
        if (name === 'graph/words.txt') {
          const text = new TextDecoder().decode(bytes); S.vocab = new Set();
          for (const line of text.split('\n')) { const w = line.split(' ')[0]; if (w) S.vocab.add(w); }
        }
        mkdirs(name); V.FS.writeFile('/m/' + name, bytes);
      }
      model = new V.Model('/m');
      tick();
      S.engine = 'vosk'; S.status = 'ready';
      return true;
    })().catch(err => { S.status = 'failed'; S.error = String(err && err.message || err); loading = null; throw err; });
    return loading;
  };
  S.hasWebSpeech = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Listening. onText(transcript, isFinal) gets everything heard since start().
  let cur = null;
  S.start = async function (words, onText) {
    S.stop();
    const session = { finals: [], partial: '', onText, stopped: false };
    cur = session;
    const emit = fin => { if (!session.stopped) onText((session.finals.join(' ') + ' ' + session.partial).trim(), fin); };
    if (S.engine === 'vosk') {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      if (session.stopped) { stream.getTracks().forEach(t => t.stop()); return; }
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(8192, 1, 1);
      const known = [...new Set(words.map(norm).filter(w => w && (!S.vocab || S.vocab.has(w))))];
      const rec = new V.Recognizer(model, ctx.sampleRate, JSON.stringify([...known, '[unk]']));
      const buf = V._malloc(8192 * 4), f = new Float32Array(8192);
      proc.onaudioprocess = e => {
        if (session.stopped) return;
        const d = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) f[i] = d[i] * 32768;
        V.HEAPF32.set(f.subarray(0, d.length), buf >> 2);
        if (rec.AcceptWaveform(buf, d.length)) {
          const t = clean(JSON.parse(rec.Result()).text); if (t) session.finals.push(t); session.partial = ''; emit(true);
        } else {
          const p = clean(JSON.parse(rec.PartialResult()).partial);
          if (p !== session.partial) { session.partial = p; emit(false); }
        }
      };
      src.connect(proc); proc.connect(ctx.destination);
      session.end = () => { try { proc.disconnect(); src.disconnect(); } catch (e) {} stream.getTracks().forEach(t => t.stop()); ctx.close(); try { rec.delete(); } catch (e) {} V._free(buf); };
      return;
    }
    if (S.engine === 'webspeech') {
      const R = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      R.lang = 'en-US'; R.continuous = true; R.interimResults = true;
      R.onresult = e => { let fin = [], part = ''; for (const r of e.results) { if (r.isFinal) fin.push(r[0].transcript); else part += r[0].transcript; } session.finals = fin.map(clean); session.partial = clean(part); emit(false); };
      R.onerror = e => { S.error = 'webspeech: ' + e.error; if (e.error === 'network' || e.error === 'not-allowed' || e.error === 'service-not-allowed') { S.engine = 'tap'; if (S.onEngineLost) S.onEngineLost(); } };
      R.onend = () => { if (!session.stopped) try { R.start(); } catch (e) {} };
      R.start();
      session.end = () => { try { R.onend = null; R.abort(); } catch (e) {} };
    }
  };
  S.stop = function () { if (cur) { cur.stopped = true; if (cur.end) cur.end(); cur = null; } };
  const clean = t => String(t || '').toLowerCase().replace(/\[unk\]/g, ' ').replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();

  // Which sentence words have been read, in order. Each heard word may match the next word or skip up to two.
  S.match = function (words, heard) {
    const target = words.map(norm), got = new Array(target.length).fill(false);
    let p = 0;
    for (const h of String(heard).split(' ').map(norm).filter(Boolean)) {
      for (let k = p; k < Math.min(p + 3, target.length); k++) if (target[k] === h) { got[k] = true; p = k + 1; break; }
    }
    return got;
  };
  // Read well enough: the last word, every main word, and nearly every small word (short words like "the" are often
  // swallowed when a child reads fast, so up to one in four of them may be missed).
  const SMALL = new Set(['the', 'a', 'an', 'to', 'and', 'it', 'its', 'their', 'on', 'in', 'is', 'so', 'of', 'then']);
  S.passes = (words, got) => {
    if (!got[got.length - 1]) return false;
    let main = 0, small = 0;
    words.forEach((w, i) => { if (!got[i]) { if (SMALL.has(norm(w))) small++; else main++; } });
    return main === 0 && small <= Math.floor(words.length / 4);
  };
  return S;
})();
