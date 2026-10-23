// ─────────────────────────────────────────────────────────────────
//  FLOW BACKGROUND — MIDI-reactive animated gradient.
//
//  Ported from midi-gradient-mockup.html's "MODE 5 — Flow" block, per
//  port-flow-and-buttons-prompt.md: the 3D Perlin noise implementation,
//  the 96×56 offscreen-grid-then-upscale technique (drawImage +
//  imageSmoothingQuality:'high' — this is the whole reason it's cheap;
//  don't replace it with a full-resolution per-pixel loop), and
//  flowOnNote's turbulence indirection (a note speeds up/intensifies
//  the existing flow rather than painting a new shape). Tuned
//  constants (FLOW_SCALE, easing rates) carried over unchanged from
//  the mockup, not re-derived.
//
//  Colormap: the mockup's own REFERENCE_PALETTES/generatePalette/
//  newSong/rampColor system, ported verbatim rather than reusing
//  particles.js's pitchToRGB wheel — an explicit, deliberate choice
//  (see conversation/CHANGELOG): this ramp is randomized per style-
//  toggle-on and independent of pitch, which is a genuinely different
//  color philosophy from particles.js's deterministic pitch→hue wheel.
//  Same note now drives two unrelated color systems by design, not by
//  drift — if that ever needs reconciling, particles.js's pitchToRGB
//  is private to its own IIFE today and would need exporting first.
//
//  Self-contained module with its own requestAnimationFrame loop,
//  matching particles.js's tickNotes pattern (a separate 2D canvas
//  overlay has no shared loop with scene.js's WebGL renderer.render
//  call to hang off of — each canvas layer runs its own rAF here).
//  Gated off (loop skips work, canvas hidden) until style-toggle.js
//  turns it on, so it costs nothing while the flat style is active.
// ─────────────────────────────────────────────────────────────────

(function () {
  const canvas = document.getElementById('flow-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let enabled = false;
  let rafId   = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // ── 3D Perlin noise (Ken Perlin's improved noise) ──────────────
  const perlinPerm = new Uint8Array(512);
  (function initPerlin() {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) perlinPerm[i] = p[i & 255];
  })();
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(t, a, b) { return a + t * (b - a); }
  function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  function perlin3(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perlinPerm[X] + Y, AA = perlinPerm[A] + Z, AB = perlinPerm[A + 1] + Z;
    const B = perlinPerm[X + 1] + Y, BA = perlinPerm[B] + Z, BB = perlinPerm[B + 1] + Z;
    return lerp(w, lerp(v, lerp(u, grad(perlinPerm[AA], x, y, z), grad(perlinPerm[BA], x - 1, y, z)),
                            lerp(u, grad(perlinPerm[AB], x, y - 1, z), grad(perlinPerm[BB], x - 1, y - 1, z))),
                   lerp(v, lerp(u, grad(perlinPerm[AA + 1], x, y, z - 1), grad(perlinPerm[BA + 1], x - 1, y, z - 1)),
                            lerp(u, grad(perlinPerm[AB + 1], x, y - 1, z - 1), grad(perlinPerm[BB + 1], x - 1, y - 1, z - 1))));
  }
  function fbm(x, y, z, octaves) {
    let total = 0, amp = 0.5, freq = 1, max = 0;
    for (let o = 0; o < octaves; o++) {
      total += perlin3(x * freq, y * freq, z * freq) * amp;
      max += amp; amp *= 0.5; freq *= 2;
    }
    return total / max; // ~[-1, 1]
  }

  // ── Low-res noise grid, upscaled — see file header ─────────────
  const FLOW_W = 96, FLOW_H = 56;
  const flowCanvas = document.createElement('canvas');
  flowCanvas.width = FLOW_W; flowCanvas.height = FLOW_H;
  const flowCtx = flowCanvas.getContext('2d');
  const FLOW_SCALE = 1.2;

  let flowZ = 0, flowLastT = null;
  let turbulence = 0.18, targetTurbulence = 0.18;

  // ── Colormap ramp — ported verbatim, see file header ───────────
  const REFERENCE_PALETTES = [
    [[231.8,64,57],[252.1,69,58],[272.5,75,59],[352.9,59,89],[322.6,61,83],[273.3,61,74],[280.5,63,76],[306.1,69,83]],
    [[229.4,68,90],[256.2,70,90],[305.9,72,89],[303.7,59,84],[308.3,58,76],[21.3,83,61],[44.5,74,63],[77.9,57,67]],
    [[324.5,97,85],[292.2,79,83],[242.0,58,80],[193.5,63,90],[251.7,63,68],[271.7,64,62],[303.4,71,56],[318.8,75,54]],
    [[51.1,74,64],[83.7,52,73],[120.0,7,83],[63.1,63,70],[38.5,76,63],[47.3,73,57],[57.7,73,57],[89.2,72,61]],
    [[16.5,73,53],[357.7,58,65],[330.0,5,83],[350.0,21,95],[6.5,66,84],[40.3,77,62],[52.1,79,55],[335.8,88,66]],
  ];
  function generateStopPositions(n) {
    const pos = [0];
    for (let i = 1; i < n - 1; i++) {
      pos.push(i / (n - 1) + (Math.random() - 0.5) * (0.8 / (n - 1)));
    }
    pos.push(1);
    return pos.sort((a, b) => a - b);
  }
  function generatePalette(n = 8) {
    const hues = [Math.random() * 360];
    let sign = Math.random() < 0.5 ? 1 : -1;
    for (let i = 1; i < n; i++) {
      if (Math.random() < 0.4) sign *= -1;
      hues.push(hues[i - 1] + sign * (20 + Math.random() * 40));
    }
    const lo = Math.min(...hues), hi = Math.max(...hues);
    const TARGET_SPAN = 90;
    if (hi - lo < TARGET_SPAN) {
      const scale = TARGET_SPAN / (hi - lo), mid = (lo + hi) / 2;
      for (let i = 0; i < n; i++) hues[i] = mid + (hues[i] - mid) * scale;
    }
    const sats = [55 + Math.random() * 25], lights = [50 + Math.random() * 25];
    for (let i = 1; i < n; i++) {
      sats.push(Math.max(50, Math.min(92, sats[i - 1] + (Math.random() - 0.5) * 16)));
      lights.push(Math.max(50, Math.min(95, lights[i - 1] + (Math.random() - 0.5) * 16)));
    }
    const palette = hues.map((h, i) => [((h % 360) + 360) % 360, sats[i], lights[i]]);
    const score = ([, s, l]) => l - s * 0.2;
    const scores = palette.map(score);
    const best = scores.indexOf(Math.max(...scores));
    const runnerUp = Math.max(...scores.filter((_, i) => i !== best));
    if (scores[best] - runnerUp < 8) {
      palette[best][2] = Math.min(95, palette[best][2] + 10);
      palette[best][1] = Math.max(50, palette[best][1] - 8);
    }
    const positions = generateStopPositions(n);
    return palette.map((stop, i) => [...stop, positions[i]]);
  }
  const ramp = [];
  function newSong() {
    const picked = Math.random() < 0.5
      ? REFERENCE_PALETTES[Math.floor(Math.random() * REFERENCE_PALETTES.length)]
      : generatePalette();
    const hueOffset = Math.random() * 360;
    ramp.length = 0;
    picked.forEach(([hue, sat, light, pos], i) => {
      ramp.push({ hue: (hue + hueOffset) % 360, sat, light, pos: pos ?? i / (picked.length - 1) });
    });
  }
  function rampColor(t) {
    t = Math.max(0, Math.min(1, t));
    let i = 0;
    while (i < ramp.length - 2 && ramp[i + 1].pos < t) i++;
    const a = ramp[i], b = ramp[i + 1];
    const span = b.pos - a.pos;
    const f = span > 0 ? (t - a.pos) / span : 0;
    const dh = ((b.hue - a.hue) % 360 + 540) % 360 - 180;
    return [
      (a.hue + dh * f + 360) % 360,
      a.sat + (b.sat - a.sat) * f,
      a.light + (b.light - a.light) * f,
    ];
  }
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  function drawFlow(now) {
    if (flowLastT === null) flowLastT = now;
    const dt = Math.min(0.1, (now - flowLastT) / 1000);
    flowLastT = now;

    turbulence += (targetTurbulence - turbulence) * 0.03;
    targetTurbulence *= 0.99;
    flowZ += (0.022 + turbulence * 0.2) * dt;

    const img = flowCtx.createImageData(FLOW_W, FLOW_H);
    const warpAmt = 0.5 + turbulence * 0.5;
    for (let y = 0; y < FLOW_H; y++) {
      for (let x = 0; x < FLOW_W; x++) {
        const nx = (x / FLOW_W) * FLOW_SCALE;
        const ny = (y / FLOW_H) * FLOW_SCALE * (FLOW_H / FLOW_W);
        const warpX = fbm(nx * 0.6 + 50, ny * 0.6 + 50, flowZ * 0.4, 2) * warpAmt;
        const warpY = fbm(nx * 0.6 - 50, ny * 0.6 - 50, flowZ * 0.4, 2) * warpAmt;
        let n = fbm(nx + warpX, ny + warpY, flowZ, 3);
        n = (n + 1) / 2;
        n = Math.max(0, Math.min(1, 0.5 + (n - 0.5) * 1.8));
        const [hue, sat, light] = rampColor(n);
        const [r, g, b] = hslToRgb(hue, sat, light);
        const i = (y * FLOW_W + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    flowCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(flowCanvas, 0, 0, canvas.width, canvas.height);
  }

  function tick(now) {
    if (!enabled) {
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(tick);
    if (document.hidden) return;
    drawFlow(now);
  }

  function startLoop() {
    if (!rafId && enabled) {
      rafId = requestAnimationFrame(tick);
    }
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && enabled && !rafId) {
      flowLastT = null;
      startLoop();
    }
  });

  // Called from script.js's real noteOn handler — see the comment
  // added next to synth.eventHandler.addEvent('noteOn', 'note-particles', ...).
  window._flowOnNote = function (pitch, velocity) {
    if (!enabled) return;
    targetTurbulence = Math.min(0.9, targetTurbulence + (velocity / 127) * 0.35);
  };

  // Called from style-toggle.js. Reseeds a fresh palette each time the
  // style is turned on (not per-track — see file header on why this
  // differs from bg-toggle.js's per-song deterministic seeding), so the
  // background looks different each time someone switches into it.
  window._flowBackground = {
    setEnabled(next) {
      const wasEnabled = enabled;
      enabled = !!next;
      canvas.style.display = enabled ? 'block' : 'none';
      if (enabled) {
        if (!wasEnabled) newSong();
        flowLastT = null; // avoid one giant dt jump on re-enable
        startLoop();
      } else {
        stopLoop();
      }
    },
  };
})();
