/* Kid Voice: the narrator voice for every offline app.
   When voice-config.js (written on the tablet from the KidTablet .env) names an Azure Speech key, every line an app
   speaks through speechSynthesis is spoken by the Azure kid voice instead (en-US-AnaNeural unless NARRATOR_VOICE
   says otherwise). Clips are kept in IndexedDB, so a line heard once plays again at once and without the internet.
   Without a config, or when Azure does not answer in time, the line goes to the Windows voice as before.
   The apps keep calling speechSynthesis.speak/cancel; this layer stands in for them and fires the same
   utterance events (start, boundary, end, error), so word highlighting and "then do the next thing" keep working.
   tools/apply-kid-voice.py copies this file into each app between the KID-VOICE markers. Story Maker is left out:
   it has its own cast of voices. */
(function () {
  'use strict';
  var cfg = window.KID_TTS;
  if (!cfg || !cfg.key || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') return;
  var ss = window.speechSynthesis;
  var orig = { speak: ss.speak.bind(ss), cancel: ss.cancel.bind(ss), pause: ss.pause.bind(ss), resume: ss.resume.bind(ss) };
  var VOICE = cfg.voice || 'en-US-AnaNeural', REGION = cfg.region || 'eastus', WAIT_MS = cfg.waitMs || 4000;
  var ctx = null, current = null, queue = [], seq = 0, mem = new Map(), dbp = null, down = 0;

  function audio() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (t) { window.addEventListener(t, audio, { capture: true, passive: true }); });

  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res) {
      try {
        var r = indexedDB.open('kid-voice', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('clips'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
    return dbp;
  }
  function dbGet(k) { return db().then(function (d) { return new Promise(function (res) { if (!d) return res(null); try { var q = d.transaction('clips').objectStore('clips').get(k); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; } catch (e) { res(null); } }); }); }
  function dbPut(k, v) { db().then(function (d) { if (!d) return; try { d.transaction('clips', 'readwrite').objectStore('clips').put(v, k); } catch (e) {} }); }

  function clean(t) {
    return String(t || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
  }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function rateOf(u) { var r = Number(u.rate) || 1; return Math.round((Math.max(0.5, Math.min(2, r)) - 1) * 100); }

  // Azure REST synthesis, with a time limit so a slow network falls back to the Windows voice.
  function fetchClip(text, rate) {
    var ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="' + VOICE + '">' +
      '<prosody rate="' + (rate >= 0 ? '+' : '') + rate + '%">' + esc(text) + '</prosody></voice></speak>';
    var ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ac) ac.abort(); }, WAIT_MS);
    return fetch('https://' + REGION + '.tts.speech.microsoft.com/cognitiveservices/v1', {
      method: 'POST', signal: ac ? ac.signal : undefined,
      headers: { 'Ocp-Apim-Subscription-Key': cfg.key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' },
      body: ssml
    }).then(function (r) { clearTimeout(timer); return r.ok ? r.arrayBuffer() : null; })
      .catch(function () { clearTimeout(timer); return null; });
  }
  function decode(bytes) {
    var c = audio(); if (!c) return Promise.resolve(null);
    return new Promise(function (res) { try { c.decodeAudioData(bytes.slice(0), function (b) { res(b); }, function () { res(null); }); } catch (e) { res(null); } });
  }
  // One AudioBuffer per line and rate: memory, then IndexedDB, then Azure.
  function clip(text, rate) {
    var k = VOICE + '|' + rate + '|' + text;
    if (mem.has(k)) return mem.get(k);
    var p = dbGet(k).then(function (saved) {
      if (saved) return decode(saved);
      if (Date.now() < down) return null;   // Azure failed a moment ago; do not wait on it again yet
      return fetchClip(text, rate).then(function (bytes) {
        if (!bytes) { down = Date.now() + 30000; return null; }
        dbPut(k, bytes); return decode(bytes);
      });
    }).then(function (b) { if (!b) mem.delete(k); return b; });
    mem.set(k, p);
    return p;
  }

  function fire(u, type, extra) {
    var ev;
    try { ev = new SpeechSynthesisEvent(type, Object.assign({ utterance: u, charIndex: 0, elapsedTime: 0, name: '' }, extra || {})); }
    catch (e) { ev = new Event(type); Object.assign(ev, { utterance: u, charIndex: 0, elapsedTime: 0, name: '' }, extra || {}); }
    if (type === 'error' && !('error' in ev)) { try { Object.defineProperty(ev, 'error', { value: (extra && extra.error) || 'interrupted' }); } catch (e) {} }
    try { u.dispatchEvent(ev); } catch (e) {}
  }

  function playNext() {
    if (current || !queue.length) return;
    var item = queue.shift(), my = ++seq, u = item.u;
    current = item;
    var text = clean(u.text), rate = rateOf(u);
    if (!text) { current = null; fire(u, 'end'); playNext(); return; }
    clip(text, rate).then(function (buf) {
      var c = audio();
      if (!buf || !c || c.state === 'running') return buf;
      // Audio starts suspended until the page may play sound; give resume() a moment.
      return Promise.race([c.resume().catch(function () {}), new Promise(function (r) { setTimeout(r, 300); })]).then(function () { return buf; });
    }).then(function (buf) {
      if (my !== seq) return;
      var c = audio();
      if (!buf || !c || c.state !== 'running') {   // no clip, or audio not allowed yet: the Windows voice says it
        current = null; item.fallback = true; orig.speak(u); playNext(); return;
      }
      var src = c.createBufferSource(), gain = c.createGain();
      gain.gain.value = u.volume == null ? 1 : Math.max(0, Math.min(1, Number(u.volume)));
      src.buffer = buf; src.connect(gain); gain.connect(c.destination);
      item.src = src; item.timers = [];
      // Word boundaries spread over the clip by letter position, for apps that light up each word.
      var full = String(u.text || ''), re = /\S+/g, m, dur = buf.duration;
      while ((m = re.exec(full))) {
        (function (ci, len) {
          item.timers.push(setTimeout(function () { if (my === seq) fire(u, 'boundary', { name: 'word', charIndex: ci, charLength: len, elapsedTime: dur * (ci / Math.max(1, full.length)) }); }, 1000 * dur * (ci / Math.max(1, full.length))));
        })(m.index, m[0].length);
      }
      src.onended = function () {
        if (my !== seq) return;
        item.timers.forEach(clearTimeout); current = null;
        fire(u, 'end', { charIndex: full.length, elapsedTime: dur });
        playNext();
      };
      fire(u, 'start');
      src.start();
    });
  }

  ss.speak = function (u) {
    if (!(u instanceof SpeechSynthesisUtterance)) return orig.speak(u);
    queue.push({ u: u });
    playNext();
  };
  ss.cancel = function () {
    seq++;
    var was = current; current = null;
    var dropped = queue.splice(0);
    if (was) { if (was.src) { try { was.src.onended = null; was.src.stop(); } catch (e) {} } if (was.timers) was.timers.forEach(clearTimeout); if (!was.fallback) fire(was.u, 'error', { error: 'interrupted' }); }
    dropped.forEach(function (d) { fire(d.u, 'error', { error: 'canceled' }); });
    orig.cancel();
  };
  ss.pause = function () { if (ctx && current && current.src) { try { ctx.suspend(); } catch (e) {} } orig.pause(); };
  ss.resume = function () { if (ctx) { try { ctx.resume(); } catch (e) {} } orig.resume(); };
  try {
    var proto = Object.getPrototypeOf(ss);
    var od = function (n) { var d = Object.getOwnPropertyDescriptor(proto, n); return d && d.get ? d.get.bind(ss) : function () { return false; }; };
    var sp = od('speaking'), pe = od('pending');
    Object.defineProperty(ss, 'speaking', { configurable: true, get: function () { return !!current || sp(); } });
    Object.defineProperty(ss, 'pending', { configurable: true, get: function () { return queue.length > 0 || pe(); } });
  } catch (e) {}
  window.KID_VOICE = { voice: VOICE, region: REGION, clip: clip, active: true };
})();
