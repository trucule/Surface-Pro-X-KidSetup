/*
  Camera Fun effects. Everything she can pick lives in this file; add a new one by adding one entry.

  FILTERS change the whole picture. Each is a GLSL function  vec4 effect(vec2 uv)  that returns the colour at uv
  (0,0 = top left, 1,1 = bottom right of the screen). Helpers you can use (see PRELUDE in index.html):
    cam(uv)         the camera, already mirrored and fitted to the screen
    prev(uv)        last frame of this filter's own output   (set needs: { prev: true })
    bg(uv)          the background she captured            (set needs: { bg: true })
    px              size of one pixel in uv units (vec2)
    ASP             screen width / height
    u_time          seconds since the filter was picked
    u_faces         number of faces found (0, 1 or 2)       (set needs: { face: true })
    u_face          first face: x, y, radius (in screen heights), tilt (radians)
    u_eyeL, u_eyeR  eye centres; u_mouth = x, y, how open (0 to about 1)
    luma(c), hsv(c), rgb(h), posterize(c, n), edge(uv), bulge(uv, c, r, amt), swirl(uv, c, r, angle), noise(p)

  FACE STICKERS follow her face. The quick way is an emoji:
    { id, name, icon, emoji: '🎩', at: 'head', size: 0.9, dx: 0, dy: -0.2 }
  at is one of: head, forehead, eyeL, eyeR, eyes (both), nose, mouth, chin, cheekL, cheekR, cheeks, earL, earR, ears.
  size, dx and dy are in face widths (1 = as wide as her face); dy is along her face, so it tilts with her.
  For a drawn sticker give draw(ctx, f, t, dt) instead: f.at(name) gives a point, f.w the face width in pixels,
  f.roll the tilt, f.open how open the mouth is, f.local(ctx, at, fn) draws in face units around a point,
  f.emoji(ctx, ch, at, size, dx, dy, spin) draws an emoji. Keep any moving parts on the sticker object (this).

  STAMPS are emoji she taps onto the picture anywhere: add a character to the stamps list.
*/
window.CAMERA_FUN = { filters: [], stickers: [], stamps: [] };
(function (C) {
  const filter = o => C.filters.push(Object.assign({ needs: {} }, o));
  const sticker = o => C.stickers.push(o);

  // ---------------------------------------------------------------- looks
  filter({ id: 'none', name: 'Plain', icon: '🙂', glsl: `vec4 effect(vec2 uv) { return cam(uv); }` });
  filter({ id: 'comic', name: 'Comic', icon: '💥', glsl: `
    vec4 effect(vec2 uv) {
      vec3 c = posterize(cam(uv).rgb * 1.15, 4.0);
      float dots = step(0.35, length(fract(uv * u_res / 6.0) - 0.5)) * 0.08;
      return vec4(mix(c - dots, vec3(0.0), smoothstep(0.25, 0.45, edge(uv))), 1.0);
    }` });
  filter({ id: 'sketch', name: 'Pencil', icon: '✏️', glsl: `
    vec4 effect(vec2 uv) {
      float e = edge(uv), paper = 0.96 - noise(uv * u_res * 0.5) * 0.05;
      float shade = smoothstep(0.1, 0.0, luma(cam(uv).rgb) - 0.25) * step(0.5, fract((uv.x + uv.y) * u_res.y / 5.0)) * 0.35;
      return vec4(vec3(paper - e * 1.6 - shade), 1.0);
    }` });
  filter({ id: 'popart', name: 'Pop art', icon: '🎨', glsl: `
    vec4 effect(vec2 uv) {
      vec2 cell = floor(uv * 2.0), p = fract(uv * 2.0);
      float l = luma(cam(p).rgb), k = cell.x + cell.y * 2.0;
      vec3 a = k < 0.5 ? vec3(1., .2, .55) : k < 1.5 ? vec3(.1, .8, 1.) : k < 2.5 ? vec3(1., .85, .1) : vec3(.4, 1., .3);
      vec3 b = k < 0.5 ? vec3(.2, .1, .6) : k < 1.5 ? vec3(1., .3, .1) : k < 2.5 ? vec3(.6, .1, .7) : vec3(.1, .3, .9);
      return vec4(l > 0.45 ? a : b, 1.0);
    }` });
  filter({ id: 'neon', name: 'Neon', icon: '🌈', glsl: `
    vec4 effect(vec2 uv) {
      float e = smoothstep(0.08, 0.35, edge(uv));
      return vec4(rgb(fract(uv.y * 0.8 + u_time * 0.15)) * e * 1.4 + cam(uv).rgb * 0.08, 1.0);
    }` });
  filter({ id: 'oldtime', name: 'Old time', icon: '🎞️', glsl: `
    vec4 effect(vec2 uv) {
      float l = luma(cam(uv).rgb) * (0.92 + 0.08 * noise(vec2(u_time * 9.0)));
      vec3 c = vec3(l * 1.08, l * 0.9, l * 0.68) + (noise(uv * u_res + u_time * 50.0) - 0.5) * 0.1;
      float scratch = step(0.995, noise(vec2(floor(uv.x * 300.0), floor(u_time * 8.0)))) * 0.35;
      return vec4(c * (1.0 - length((uv - 0.5) * 1.1)) + scratch, 1.0);
    }` });
  filter({ id: 'heat', name: 'Heat vision', icon: '🔥', glsl: `
    vec4 effect(vec2 uv) {
      float l = luma(cam(uv).rgb);
      vec3 c = l < 0.25 ? mix(vec3(0., 0., .3), vec3(.5, 0., .7), l * 4.) : l < 0.5 ? mix(vec3(.5, 0., .7), vec3(1., .1, .1), (l - .25) * 4.)
             : l < 0.75 ? mix(vec3(1., .1, .1), vec3(1., .85, 0.), (l - .5) * 4.) : mix(vec3(1., .85, 0.), vec3(1.), (l - .75) * 4.);
      return vec4(c, 1.0);
    }` });
  filter({ id: 'pixel', name: 'Pixels', icon: '👾', glsl: `
    vec4 effect(vec2 uv) {
      vec2 n = vec2(48.0 * ASP, 48.0), q = (floor(uv * n) + 0.5) / n;
      vec3 c = posterize(cam(q).rgb, 6.0);
      vec2 f = fract(uv * n);
      return vec4(c * (0.85 + 0.15 * step(0.08, min(f.x, f.y))), 1.0);
    }` });
  filter({ id: 'xray', name: 'X-ray', icon: '🩻', glsl: `
    vec4 effect(vec2 uv) { float l = 1.0 - luma(cam(uv).rgb); return vec4(vec3(l * 0.6, l * 0.9, l) + edge(uv) * 0.6, 1.0); }` });
  filter({ id: 'rainbow', name: 'Rainbow', icon: '🦄', glsl: `
    vec4 effect(vec2 uv) { vec3 h = hsv(cam(uv).rgb); return vec4(rgb(fract(h.x + uv.x * 0.5 + u_time * 0.2)) * (0.3 + h.z), 1.0); }` });

  // ---------------------------------------------------------------- funhouse mirror
  filter({ id: 'kaleido', name: 'Kaleido', icon: '❄️', glsl: `
    vec4 effect(vec2 uv) {
      vec2 d = (uv - 0.5) * vec2(ASP, 1.0);
      float a = atan(d.y, d.x) + u_time * 0.2, r = length(d), s = 6.2832 / 8.0;
      a = abs(mod(a, s) - s * 0.5);
      return cam(0.5 + vec2(cos(a), sin(a)) * r / vec2(ASP, 1.0) * 0.9);
    }` });
  filter({ id: 'mirror', name: 'Twins', icon: '👯', glsl: `vec4 effect(vec2 uv) { return cam(vec2(uv.x < 0.5 ? uv.x : 1.0 - uv.x, uv.y)); }` });
  filter({ id: 'bighead', name: 'Big head', icon: '🎈', needs: { face: true }, glsl: `
    vec4 effect(vec2 uv) {
      vec2 c = u_faces > 0.5 ? u_face.xy : vec2(0.5, 0.45);
      float r = u_faces > 0.5 ? u_face.z * 1.9 : 0.35;
      return cam(bulge(uv, c, r, 0.7));
    }` });
  filter({ id: 'tiny', name: 'Tiny face', icon: '🐜', needs: { face: true }, glsl: `
    vec4 effect(vec2 uv) {
      vec2 c = u_faces > 0.5 ? u_face.xy : vec2(0.5, 0.45);
      return cam(bulge(uv, c, (u_faces > 0.5 ? u_face.z : 0.2) * 2.0, -1.2));
    }` });
  filter({ id: 'alien', name: 'Alien eyes', icon: '👽', needs: { face: true }, glsl: `
    vec4 effect(vec2 uv) {
      vec2 q = uv;
      if (u_faces > 0.5) { float r = u_face.z * 0.55; q = bulge(bulge(q, u_eyeL, r, 0.6), u_eyeR, r, 0.6); }
      vec3 c = cam(q).rgb;
      return vec4(c * vec3(0.7, 1.15, 0.7), 1.0);
    }` });
  filter({ id: 'bigmouth', name: 'Big mouth', icon: '👄', needs: { face: true }, glsl: `
    vec4 effect(vec2 uv) { return cam(u_faces > 0.5 ? bulge(uv, u_mouth.xy, u_face.z * 0.8, 0.6) : uv); }` });
  filter({ id: 'swirl', name: 'Swirl', icon: '🌀', needs: { face: true }, glsl: `
    vec4 effect(vec2 uv) {
      vec2 c = u_faces > 0.5 ? u_face.xy : vec2(0.5);
      return cam(swirl(uv, c, 0.45, 2.5 * sin(u_time * 0.8)));
    }` });
  filter({ id: 'tall', name: 'Stretchy', icon: '🦒', glsl: `
    vec4 effect(vec2 uv) { float y = uv.y < 0.5 ? 0.5 - pow((0.5 - uv.y) * 2.0, 1.8) * 0.5 : 0.5 + pow((uv.y - 0.5) * 2.0, 1.8) * 0.5; return cam(vec2(0.5 + (uv.x - 0.5) * 1.35, y)); }` });
  filter({ id: 'water', name: 'Under water', icon: '🌊', glsl: `
    vec4 effect(vec2 uv) {
      vec2 q = uv + vec2(sin(uv.y * 30.0 + u_time * 3.0), cos(uv.x * 25.0 + u_time * 2.5)) * 0.008;
      float caustic = pow(noise(uv * 9.0 + u_time * 0.6), 3.0) * 0.5;
      return vec4(cam(q).rgb * vec3(0.6, 0.9, 1.15) + caustic * vec3(0.4, 0.8, 1.0), 1.0);
    }` });

  // ---------------------------------------------------------------- time
  filter({ id: 'ghost', name: 'Ghost trails', icon: '👻', needs: { prev: true }, glsl: `
    vec4 effect(vec2 uv) { return vec4(mix(cam(uv).rgb, prev(uv).rgb, 0.88), 1.0); }` });
  filter({ id: 'melt', name: 'Melt', icon: '🫠', needs: { prev: true }, glsl: `
    vec4 effect(vec2 uv) { return uv.y < 0.004 ? cam(uv) : prev(uv - vec2(0.0, 0.0035)); }` });
  filter({ id: 'clones', name: 'Echo me', icon: '🧑‍🤝‍🧑', needs: { prev: true }, glsl: `
    vec4 effect(vec2 uv) { vec4 p = prev(uv + vec2(0.006, 0.0)); vec4 c = cam(uv); return vec4(mix(c.rgb, p.rgb * vec3(0.9, 0.95, 1.1), 0.55), 1.0); }` });

  // ---------------------------------------------------------------- magic backgrounds (she steps out first)
  filter({ id: 'space', name: 'Space', icon: '🚀', needs: { bg: true }, glsl: `
    vec4 effect(vec2 uv) {
      vec3 c = cam(uv).rgb;
      float m = smoothstep(0.09, 0.2, distance(c, bg(uv).rgb));
      vec2 g = uv * vec2(ASP, 1.0) * 60.0;
      float star = step(0.985, noise(floor(g))) * (0.5 + 0.5 * sin(u_time * 3.0 + noise(floor(g)) * 40.0));
      vec3 sky = vec3(0.02, 0.0, 0.08) + vec3(0.25, 0.05, 0.4) * pow(noise(uv * 3.0 + u_time * 0.02), 2.0) + star;
      vec2 pl = (uv - vec2(0.82, 0.25)) * vec2(ASP, 1.0);
      sky = mix(sky, vec3(1.0, 0.55, 0.25) * (1.0 - length(pl) * 5.0) + 0.2, step(length(pl), 0.12));
      return vec4(mix(sky, c, m), 1.0);
    }` });
  filter({ id: 'sea', name: 'Under the sea', icon: '🐠', needs: { bg: true }, glsl: `
    vec4 effect(vec2 uv) {
      vec3 c = cam(uv).rgb;
      float m = smoothstep(0.09, 0.2, distance(c, bg(uv).rgb));
      vec3 sea = mix(vec3(0.0, 0.55, 0.75), vec3(0.0, 0.1, 0.35), uv.y) + pow(noise(uv * 7.0 + vec2(u_time * 0.3, 0.0)), 4.0) * 0.6;
      vec2 b = fract(uv * vec2(ASP * 6.0, 5.0) + vec2(0.0, u_time * 0.3));
      sea += smoothstep(0.08, 0.05, length(b - 0.5)) * step(0.7, noise(floor(uv * vec2(ASP * 6.0, 5.0) + vec2(0.0, floor(u_time * 0.3))))) * 0.5;
      return vec4(mix(sea, c, m), 1.0);
    }` });
  filter({ id: 'invisible', name: 'Invisible', icon: '🫥', needs: { bg: true }, glsl: `
    vec4 effect(vec2 uv) {
      vec3 c = cam(uv).rgb, b = bg(uv).rgb;
      float m = smoothstep(0.09, 0.2, distance(c, b));
      vec2 q = uv + (vec2(noise(uv * 40.0 + u_time), noise(uv * 40.0 - u_time)) - 0.5) * 0.02 * m;
      return vec4(mix(b, bg(q).rgb * 1.05, m), 1.0);
    }` });

  // ---------------------------------------------------------------- face stickers: emoji
  sticker({ id: 'tophat', name: 'Top hat', icon: '🎩', emoji: '🎩', at: 'head', size: 0.95, dy: -0.12 });
  sticker({ id: 'crown', name: 'Crown', icon: '👑', emoji: '👑', at: 'head', size: 0.75, dy: 0.02 });
  sticker({ id: 'hearteyes', name: 'Heart eyes', icon: '😍', emoji: '❤️', at: 'eyes', size: 0.32 });
  sticker({ id: 'stareyes', name: 'Star eyes', icon: '🤩', emoji: '⭐', at: 'eyes', size: 0.34 });
  sticker({ id: 'flowers', name: 'Flower crown', icon: '🌸', draw(ctx, f) {
    const row = ['🌸', '🌼', '🌺', '🌷', '🌼', '🌸', '🌺'];
    row.forEach((ch, i) => { const a = (i / (row.length - 1) - 0.5) * 2.3; f.emoji(ctx, ch, 'forehead', 0.24, Math.sin(a) * 0.55, -0.12 - Math.cos(a) * 0.32, a * 0.4); });
  } });
  sticker({ id: 'butterflies', name: 'Butterflies', icon: '🦋', draw(ctx, f, t) {
    for (let i = 0; i < 3; i++) { const a = t * 1.3 + i * 2.09; f.emoji(ctx, '🦋', 'forehead', 0.22, Math.cos(a) * 0.75, -0.25 + Math.sin(a) * 0.22, Math.sin(t * 9 + i) * 0.3); }
  } });

  // ---------------------------------------------------------------- face stickers: drawn
  sticker({ id: 'cat', name: 'Kitty', icon: '🐱', draw(ctx, f) {
    for (const side of [-1, 1]) f.local(ctx, 'forehead', c => {
      c.beginPath(); c.moveTo(side * 0.18, -0.08); c.lineTo(side * 0.42, -0.5); c.lineTo(side * 0.5, -0.02); c.closePath();
      c.fillStyle = '#F2A65A'; c.fill(); c.lineWidth = 0.025; c.strokeStyle = '#5A3415'; c.stroke();
      c.beginPath(); c.moveTo(side * 0.25, -0.1); c.lineTo(side * 0.41, -0.38); c.lineTo(side * 0.45, -0.07); c.closePath(); c.fillStyle = '#FFB6C8'; c.fill();
    });
    f.local(ctx, 'nose', c => {
      c.beginPath(); c.moveTo(-0.06, -0.02); c.lineTo(0.06, -0.02); c.lineTo(0, 0.05); c.closePath(); c.fillStyle = '#FF6F9C'; c.fill();
      c.strokeStyle = '#333'; c.lineWidth = 0.012;
      for (const side of [-1, 1]) for (const k of [-1, 0, 1]) { c.beginPath(); c.moveTo(side * 0.12, 0.06 + k * 0.03); c.lineTo(side * 0.45, 0.02 + k * 0.08); c.stroke(); }
    });
  } });
  sticker({ id: 'bunny', name: 'Bunny', icon: '🐰', draw(ctx, f, t) {
    for (const side of [-1, 1]) f.local(ctx, 'head', c => {
      c.save(); c.translate(side * 0.2, 0.05); c.rotate(side * (0.18 + Math.sin(t * 2 + side) * 0.05));
      c.beginPath(); c.ellipse(0, -0.35, 0.11, 0.38, 0, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 0.02; c.strokeStyle = '#999'; c.stroke();
      c.beginPath(); c.ellipse(0, -0.33, 0.055, 0.28, 0, 0, 7); c.fillStyle = '#FFB6C8'; c.fill(); c.restore();
    });
    f.local(ctx, 'nose', c => { c.beginPath(); c.ellipse(0, 0, 0.06, 0.045, 0, 0, 7); c.fillStyle = '#FF8FB0'; c.fill(); });
    if (f.open > 0.3) f.local(ctx, 'mouth', c => { c.fillStyle = '#fff'; c.strokeStyle = '#999'; c.lineWidth = 0.01; c.fillRect(-0.06, -0.03, 0.055, 0.09); c.strokeRect(-0.06, -0.03, 0.055, 0.09); c.fillRect(0.005, -0.03, 0.055, 0.09); c.strokeRect(0.005, -0.03, 0.055, 0.09); });
  } });
  sticker({ id: 'puppy', name: 'Puppy', icon: '🐶', draw(ctx, f, t) {
    for (const side of [-1, 1]) f.local(ctx, side < 0 ? 'earL' : 'earR', c => {
      c.save(); c.rotate(side * (0.25 + Math.sin(t * 3) * 0.04));
      c.beginPath(); c.ellipse(side * 0.04, 0.05, 0.13, 0.3, 0, 0, 7); c.fillStyle = '#8B5A2B'; c.fill(); c.lineWidth = 0.02; c.strokeStyle = '#4A2C10'; c.stroke(); c.restore();
    });
    f.local(ctx, 'nose', c => { c.beginPath(); c.ellipse(0, 0, 0.1, 0.07, 0, 0, 7); c.fillStyle = '#222'; c.fill(); c.beginPath(); c.ellipse(-0.03, -0.025, 0.03, 0.018, 0, 0, 7); c.fillStyle = '#fff8'; c.fill(); });
    if (f.open > 0.3) f.local(ctx, 'mouth', c => { c.beginPath(); c.ellipse(0, 0.12 + f.open * 0.3, 0.09, 0.16 + f.open * 0.3, 0, 0, 7); c.fillStyle = '#FF6F8A'; c.fill(); c.beginPath(); c.moveTo(0, 0.02); c.lineTo(0, 0.2 + f.open * 0.4); c.strokeStyle = '#D9486A'; c.lineWidth = 0.015; c.stroke(); });
  } });
  sticker({ id: 'shades', name: 'Cool shades', icon: '😎', draw(ctx, f) {
    f.local(ctx, 'eyes', c => {
      c.fillStyle = '#111'; c.strokeStyle = '#000'; c.lineWidth = 0.03;
      for (const side of [-1, 1]) { c.beginPath(); c.roundRect ? c.roundRect(side * 0.21 - 0.17, -0.1, 0.34, 0.2, 0.07) : c.rect(side * 0.21 - 0.17, -0.1, 0.34, 0.2); c.fill(); }
      c.beginPath(); c.moveTo(-0.05, -0.05); c.quadraticCurveTo(0, -0.09, 0.05, -0.05); c.stroke();
      c.fillStyle = '#fff6'; for (const side of [-1, 1]) { c.beginPath(); c.moveTo(side * 0.21 - 0.12, -0.06); c.lineTo(side * 0.21 - 0.05, -0.06); c.lineTo(side * 0.21 - 0.1, 0.04); c.closePath(); c.fill(); }
    });
  } });
  sticker({ id: 'googly', name: 'Googly eyes', icon: '👀', draw(ctx, f, t, dt) {
    const s = this.s || (this.s = [{ x: 0, y: 0, vx: 0, vy: 0 }, { x: 0, y: 0, vx: 0, vy: 0 }]);
    const mv = f.moved || { x: 0, y: 0 };
    ['eyeL', 'eyeR'].forEach((at, i) => {
      const p = s[i]; p.vx += (-p.x * 60 - mv.x * 0.02 - p.vx * 4) * dt; p.vy += ((0.6 - p.y) * 30 - mv.y * 0.02 - p.vy * 3) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; const l = Math.hypot(p.x, p.y); if (l > 1) { p.x /= l; p.y /= l; }
      f.local(ctx, at, c => {
        c.beginPath(); c.arc(0, 0, 0.17, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 0.02; c.strokeStyle = '#222'; c.stroke();
        c.beginPath(); c.arc(p.x * 0.08, p.y * 0.08, 0.08, 0, 7); c.fillStyle = '#111'; c.fill();
      });
    });
  } });
  sticker({ id: 'clown', name: 'Clown nose', icon: '🤡', draw(ctx, f) {
    f.local(ctx, 'nose', c => { const g = c.createRadialGradient(-0.04, -0.04, 0.01, 0, 0, 0.13); g.addColorStop(0, '#FF8080'); g.addColorStop(1, '#C00'); c.beginPath(); c.arc(0, 0, 0.13, 0, 7); c.fillStyle = g; c.fill(); });
  } });
  sticker({ id: 'mustache', name: 'Mustache', icon: '🥸', draw(ctx, f) {
    f.local(ctx, 'mouth', c => {
      c.translate(0, -0.09); c.fillStyle = '#3B2414'; c.beginPath(); c.moveTo(0, -0.03);
      c.bezierCurveTo(0.08, -0.09, 0.2, -0.08, 0.28, 0.02); c.bezierCurveTo(0.2, -0.01, 0.12, 0.05, 0, 0.02);
      c.bezierCurveTo(-0.12, 0.05, -0.2, -0.01, -0.28, 0.02); c.bezierCurveTo(-0.2, -0.08, -0.08, -0.09, 0, -0.03); c.fill();
    });
  } });
  sticker({ id: 'unicorn', name: 'Unicorn horn', icon: '🦄', draw(ctx, f) {
    f.local(ctx, 'forehead', c => {
      const g = c.createLinearGradient(0, 0, 0, -0.55); g.addColorStop(0, '#FFD1F0'); g.addColorStop(0.5, '#C9B6FF'); g.addColorStop(1, '#A7F0FF');
      c.beginPath(); c.moveTo(-0.09, -0.05); c.lineTo(0, -0.6); c.lineTo(0.09, -0.05); c.closePath(); c.fillStyle = g; c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 0.015; for (let k = 1; k < 5; k++) { const y = -0.05 - k * 0.11, w = 0.09 * (1 - k * 0.2); c.beginPath(); c.moveTo(-w, y + 0.03); c.lineTo(w, y - 0.03); c.stroke(); }
    });
  } });
  sticker({ id: 'halo', name: 'Halo', icon: '😇', draw(ctx, f, t) {
    f.local(ctx, 'head', c => { c.beginPath(); c.ellipse(0, -0.12 + Math.sin(t * 2) * 0.02, 0.35, 0.09, 0, 0, 7); c.lineWidth = 0.06; c.strokeStyle = '#FFD93B'; c.shadowColor = '#FFF3A0'; c.shadowBlur = 20; c.stroke(); });
  } });
  sticker({ id: 'pirate', name: 'Pirate', icon: '🏴‍☠️', draw(ctx, f) {
    f.local(ctx, 'eyeR', c => { c.strokeStyle = '#111'; c.lineWidth = 0.025; c.beginPath(); c.moveTo(-0.6, -0.25); c.lineTo(0.5, 0.2); c.stroke(); c.beginPath(); c.ellipse(0, 0, 0.16, 0.13, 0, 0, 7); c.fillStyle = '#111'; c.fill(); });
    f.emoji(ctx, '☠️', 'head', 0.3, 0, 0.05);
  } });
  sticker({ id: 'blush', name: 'Rosy cheeks', icon: '☺️', draw(ctx, f) {
    for (const at of ['cheekL', 'cheekR']) f.local(ctx, at, c => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 0.14); g.addColorStop(0, '#FF6F9Caa'); g.addColorStop(1, '#FF6F9C00'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.14, 0, 7); c.fill(); });
  } });

  // Open your mouth for these.
  const spray = (make) => function (ctx, f, t, dt) {
    const parts = this.parts || (this.parts = []);
    if (f.open > 0.35 && f.index === 0) for (let k = 0; k < 3; k++) parts.push(make(f));
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.life -= dt; }
    this.parts = parts.filter(p => p.life > 0).slice(-160);
    for (const p of this.parts) { ctx.save(); ctx.globalAlpha = Math.min(1, p.life * 2); ctx.translate(p.x, p.y); if (p.ch) { ctx.font = `${p.size}px "Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.ch, 0, 0); } else { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 7); ctx.fillStyle = p.color; ctx.fill(); if (p.ring) { ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 2; ctx.stroke(); } } ctx.restore(); }
  };
  const down = f => f.down;
  sticker({ id: 'rainbowmouth', name: 'Rainbow mouth', icon: '🌈', hint: 'Open your mouth!', draw: spray(f => {
    const m = f.at('mouth'), d = down(f), sp = f.w * (1.2 + Math.random()), j = (Math.random() - 0.5) * 0.5;
    const cols = ['#FF3B3B', '#FF9F1C', '#FFE33B', '#3BD16F', '#3BA8FF', '#8F5BFF'];
    return { x: m.x, y: m.y, vx: (d.x + j) * sp, vy: (d.y) * sp, g: f.w * 0.6, life: 1.4, size: f.w * 0.05, color: cols[Math.floor(Math.random() * 6)] };
  }) });
  sticker({ id: 'dragon', name: 'Dragon fire', icon: '🐉', hint: 'Open your mouth!', draw: spray(f => {
    const m = f.at('mouth'), d = down(f), sp = f.w * (1.5 + Math.random()), j = (Math.random() - 0.5) * 0.6;
    return { x: m.x, y: m.y, vx: (d.x + j) * sp, vy: d.y * sp * 0.6, g: -f.w * 0.5, life: 1.0, size: f.w * (0.12 + Math.random() * 0.1), ch: '🔥' };
  }) });
  sticker({ id: 'bubbles', name: 'Bubbles', icon: '🫧', hint: 'Open your mouth!', draw: spray(f => {
    const m = f.at('mouth');
    return { x: m.x, y: m.y, vx: (Math.random() - 0.5) * f.w, vy: -f.w * (0.3 + Math.random() * 0.4), life: 2.5, size: f.w * (0.03 + Math.random() * 0.05), color: '#BFEFFF55', ring: true };
  }) });

  // ---------------------------------------------------------------- stamps
  C.stamps.push('⭐', '❤️', '🌈', '🦄', '🐶', '🐱', '🌸', '🍕', '🍦', '🎉', '✨', '🦋', '🐸', '👑', '🚀', '🌙', '☀️', '🐬', '🍓', '🎈');
})(window.CAMERA_FUN);
