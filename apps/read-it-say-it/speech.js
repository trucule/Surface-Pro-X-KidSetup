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
  const norm = w => String(w).toLowerCase().replace(/\u2019/g, "'").replace(/[^a-z']/g, '').replace(/^'+|'+$/g, '');
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
      const BUF = 8192; // about a sixth of a second of sound per step
      const src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(BUF, 1, 1);
      const grammar = ws => JSON.stringify([...new Set(ws.map(norm).filter(w => w && S.known(w)))].concat('[unk]'));
      let rec = new V.Recognizer(model, ctx.sampleRate, grammar(words));
      // A new set of words (the next sentence of a passage) on the same microphone, with nothing heard yet.
      session.retarget = ws => { const old = rec; rec = new V.Recognizer(model, ctx.sampleRate, grammar(ws)); session.finals = []; session.partial = ''; try { old.delete(); } catch (e) {} };
      const buf = V._malloc(BUF * 4), f = new Float32Array(BUF);
      // S.load: time spent hearing, as a share of the sound's own length (above 1 the listener falls behind).
      S.load = { audio: 0, work: 0, gap: 0, last: 0 };
      proc.onaudioprocess = e => {
        if (session.stopped) return;
        const t0 = performance.now(); S.load.audio += e.inputBuffer.duration * 1000;
        if (S.load.last) S.load.gap = Math.max(S.load.gap, t0 - S.load.last); S.load.last = t0;
        const d = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) f[i] = d[i] * 32768;
        V.HEAPF32.set(f.subarray(0, d.length), buf >> 2);
        if (rec.AcceptWaveform(buf, d.length)) {
          const t = clean(JSON.parse(rec.Result()).text); if (t) session.finals.push(t); session.partial = ''; emit(true);
        } else {
          const p = clean(JSON.parse(rec.PartialResult()).partial);
          if (p !== session.partial) { session.partial = p; emit(false); }
        }
        S.load.work += performance.now() - t0;
      };
      src.connect(proc); proc.connect(ctx.destination);
      session.end = () => { try { proc.disconnect(); src.disconnect(); } catch (e) {} stream.getTracks().forEach(t => t.stop()); ctx.close(); try { rec.delete(); } catch (e) {} V._free(buf); };
      return;
    }
    if (S.engine === 'webspeech') {
      const R = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      R.lang = 'en-US'; R.continuous = true; R.interimResults = true;
      session.seen = 0; session.skip = 0;
      session.retarget = () => { session.skip = session.seen; session.finals = []; session.partial = ''; };
      R.onresult = e => { let fin = [], part = ''; session.seen = e.results.length; for (let i = session.skip; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) fin.push(r[0].transcript); else part += r[0].transcript; } session.finals = fin.map(clean); session.partial = clean(part); emit(false); };
      R.onerror = e => { S.error = 'webspeech: ' + e.error; if (e.error === 'network' || e.error === 'not-allowed' || e.error === 'service-not-allowed') { S.engine = 'tap'; if (S.onEngineLost) S.onEngineLost(); } };
      R.onend = () => { if (!session.stopped) try { R.start(); } catch (e) {} };
      R.start();
      session.end = () => { try { R.onend = null; R.abort(); } catch (e) {} };
    }
  };
  S.retarget = function (words) { if (cur && cur.retarget) { cur.retarget(words); return true; } return false; };
  S.stop = function () { if (cur) { cur.stopped = true; if (cur.end) cur.end(); cur = null; } };
  const clean = t => String(t || '').toLowerCase().replace(/\[unk\]/g, ' ').replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();

  // Words the offline listener can hear. Without a word list (the browser listener) every word counts as known.
  S.known = w => !S.vocab || S.vocab.has(norm(w));
  // Which sentence words have been read, in order. Each heard word may match the next word or skip a few.
  // A word the listener cannot hear (a rare name, an old word) counts as read once a word after it is heard,
  // or once the last word it can hear is heard.
  // The listener often mixes up a word with and without an "s" at the end (spin, spins), so those count as the same.
  const same = (t, h) => t === h || (t.length > 3 && (t === h + 's' || h === t + 's'));
  S.match = function (words, heard) {
    const target = words.map(norm), got = new Array(target.length).fill(false);
    const idx = target.map((w, i) => i).filter(i => target[i] && S.known(target[i]));
    const hs = String(heard).split(' ').map(norm).filter(Boolean);
    const look = idx.length > 12 ? 4 : 3;
    const follows = (k, j, n) => { if (!n) return true; for (const d of [1, 2]) if (k + d < idx.length && same(target[idx[k + d]], hs[j]) && follows(k + d, j + 1, n - 1)) return true; return false; };
    let p = 0;
    for (let j = 0; j < hs.length; j++) {
      const h = hs[j]; let hit = -1;
      for (let k = p; k < Math.min(p + look, idx.length); k++) if (same(target[idx[k]], h)) { hit = k; break; }
      // The listener sometimes drops a few words. Three heard words in a row that match three words further on (with at
      // most one word left out between them) pick the place up again; the dropped words stay unread.
      if (hit < 0 && j + 2 < hs.length) for (let k = p + look; k < Math.min(p + 14, idx.length); k++) if (same(target[idx[k]], h) && follows(k, j + 1, 2)) { hit = k; break; }
      if (hit >= 0) { got[idx[hit]] = true; p = hit + 1; }
    }
    const last = idx.length ? idx[idx.length - 1] : -1;
    let after = !idx.length || got[last];
    for (let i = target.length - 1; i >= 0; i--) {
      if (i < last && got[i]) after = true;
      if (!target[i] || !S.known(target[i])) got[i] = after;
    }
    return got;
  };
  // Read well enough: the last word, nearly every main word, and most small words. Short words like "the" are often
  // swallowed when a child reads fast, so up to one in three of them may be missed; the listener also drops a word now
  // and then, so in a sentence of eight words or more one main word in eight may be missed too.
  const SMALL = new Set(['the', 'a', 'an', 'to', 'and', 'it', 'its', 'their', 'on', 'in', 'is', 'so', 'of', 'then',
    'was', 'he', 'she', 'his', 'her', 'i', 'for', 'with', 'at', 'as', 'but', 'or', 'by', 'had', 'be', 'that', 'this', 'from', 'were', 'they', 'we', 'my', 'all']);
  S.passes = (words, got) => {
    // The sentence must be read to the end: its last word, or its last main word when it ends on a small word ("in it").
    let end = got.length - 1; while (end > 0 && SMALL.has(norm(words[end])) && !got[end]) end--;
    if (!got[end]) return false;
    let main = 0, small = 0;
    words.forEach((w, i) => { if (!got[i]) { if (SMALL.has(norm(w))) small++; else main++; } });
    return main <= Math.floor(words.length / 8) && small <= Math.ceil(words.length / 3);
  };
  return S;
})();
