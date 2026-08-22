// ─────────────────────────────────────────────────────────────────
//  NOTE PARTICLE SYSTEM
//  Minecraft-style note particles synced to onMusicPlay/Pause/End.
//  Split out of the old inline <script> in index.html — behavior is
//  unchanged. Uses #note-canvas's own parent for sizing instead of a
//  module-shared  var, since ES modules don't share scope
//  the way the old classic <script> tags did.
// ─────────────────────────────────────────────────────────────────

(function() {
  const noteCanvas = document.getElementById('note-canvas');
  const ctx = noteCanvas.getContext('2d');

  function resizeNoteCanvas() {
    noteCanvas.width  = noteCanvas.parentElement.clientWidth;
    noteCanvas.height = noteCanvas.parentElement.clientHeight;
  }
  resizeNoteCanvas();
  window.addEventListener('resize', resizeNoteCanvas);

  // ── P9: Minecraft pitch→color mapping ────────────────────────────
  // Minecraft maps note block pitch (0–24) to a full HSV hue rotation.
  // hue = (pitch / 24) * 360 degrees, S=1, V=1 → fully saturated rainbow.
  // We use pitch % 25 to wrap any MIDI note (0–127) into the 0–24 range.
  function pitchToRGB(pitch) {
    const hue = ((pitch % 25) / 24) * 360;
    const h = hue / 60;
    const i = Math.floor(h);
    const f = h - i;
    const q = 1 - f;
    const t = f;
    const table = [
      [1, t, 0], [q, 1, 0], [0, 1, t],
      [0, q, 1], [t, 0, 1], [1, 0, q]
    ];
    const [r, g, b] = table[i % 6];
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  // ── Sprite loading ─────────────────────────────────────────────
  // The sprite should be a small grayscale PNG (white note on transparent bg).
  // Color is applied once per hue bucket below (not per particle per frame) —
  // the sprite itself must be white/grey, not colored.
  const SPRITE_PATH = './textures/note_particle.png';
  let noteSprite = null;

  // Cache of pre-tinted flat sprites, one per hue bucket, built once when the
  // base sprite loads. Avoids the old per-particle/per-frame multi-pass
  // composite (drawImage x3 + fillRect + shadowBlur), which is the main cost
  // that was making this overlay heavy.
  const TINT_BUCKETS = 25; // matches the 0–24 pitch range
  const TINT_SIZE     = 32; // baked at a fixed size; canvas drawImage scales it cheaply
  let tintedSprites = null;

  function buildTintedSprites(img) {
    tintedSprites = [];
    for (let i = 0; i < TINT_BUCKETS; i++) {
      const [r, g, b] = pitchToRGB(i);
      const c = document.createElement('canvas');
      c.width = TINT_SIZE; c.height = TINT_SIZE;
      const tctx = c.getContext('2d');

      tctx.drawImage(img, 0, 0, TINT_SIZE, TINT_SIZE);
      tctx.globalCompositeOperation = 'multiply';
      tctx.fillStyle = `rgb(${r},${g},${b})`;
      tctx.fillRect(0, 0, TINT_SIZE, TINT_SIZE);
      tctx.globalCompositeOperation = 'destination-in';
      tctx.drawImage(img, 0, 0, TINT_SIZE, TINT_SIZE);

      tintedSprites.push(c);
    }
  }

  const spriteImg = new Image();
  spriteImg.onload = () => { noteSprite = spriteImg; buildTintedSprites(spriteImg); };
  spriteImg.onerror = () => {
    console.warn('[Particles] note_particle.png not found — using text glyph fallback');
  };
  spriteImg.src = SPRITE_PATH;

  // ── Fallback text glyphs (used if sprite not loaded) ──────────
  const NOTES_GLYPHS = ['♩','♪','♫','♬'];

  const particles = [];
  let isPlaying   = false;
  let spawnTimer  = 0;

  const SPAWN_INTERVAL_MS = 220;
  const SPAWN_X_MIN = 0.25;
  const SPAWN_X_MAX = 0.75;
  const SPAWN_Y     = 0.55;
  const MAX_PARTICLES = 28; // hard cap so a slow frame can't snowball into more work

  // If SpessaSynth exposes a per-note callback, wire it here to get real pitch data.
  // Until then, we pick a random pitch for each particle — still produces the full
  // Minecraft rainbow, just without pitch correlation to the actual notes playing.
  function spawnNote(pitch) {
    if (particles.length >= MAX_PARTICLES) return;
    const usePitch = (pitch !== undefined) ? pitch : Math.floor(Math.random() * 25);
    const x = (SPAWN_X_MIN + Math.random() * (SPAWN_X_MAX - SPAWN_X_MIN)) * noteCanvas.width;
    const y = SPAWN_Y * noteCanvas.height;
    particles.push({
      x,
      y,
      pitch    : usePitch,
      rgb      : pitchToRGB(usePitch),
      glyph    : NOTES_GLYPHS[Math.floor(Math.random() * NOTES_GLYPHS.length)],
      size     : 14 + Math.random() * 12,  // flatter/smaller than before
      vx       : (Math.random() - 0.5) * 0.7,
      vy       : -(0.9 + Math.random() * 1.2),
      alpha    : 1,
      fadeRate : 0.012 + Math.random() * 0.01, // fades several x faster — fewer concurrent particles
      wobble   : Math.random() * Math.PI * 2,
      wobbleAmp: 0.4 + Math.random() * 0.6,
    });
  }

  // ── Tinted sprite draw ──────────────────────────────────────────
  // Single drawImage of a pre-tinted bucket sprite. No per-frame compositing,
  // no shadowBlur — "flatter" by design, and an order of magnitude cheaper.
  function drawTintedSprite(p) {
    const s = p.size;
    const bucket = tintedSprites[p.pitch % TINT_BUCKETS];
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.drawImage(bucket, p.x - s / 2, p.y - s / 2, s, s);
  }

  // ── Text glyph fallback draw ────────────────────────────────────
  // No shadowBlur here either — flat fill only.
  function drawGlyphFallback(p) {
    const [r, g, b] = p.rgb;
    const tr = Math.round(r * 0.65 + 255 * 0.35);
    const tg = Math.round(g * 0.65 + 255 * 0.35);
    const tb = Math.round(b * 0.65 + 255 * 0.35);

    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.font        = `${p.size}px serif`;
    ctx.fillStyle   = `rgb(${tr},${tg},${tb})`;
    ctx.fillText(p.glyph, p.x, p.y);
  }

  let lastTime = null;
  const MAX_DT = 50; // ms — clamp so a slow/backgrounded frame can't fling particles

  function tickNotes(timestamp) {
    requestAnimationFrame(tickNotes);

    let dt = lastTime ? timestamp - lastTime : 16;
    dt = Math.min(dt, MAX_DT);
    lastTime = timestamp;
    const dtScale = dt / 16; // normalize motion/fade to ~60fps-equivalent steps

    if (isPlaying) {
      spawnTimer += dt;
      if (spawnTimer >= SPAWN_INTERVAL_MS) {
        spawnTimer = 0;
        spawnNote();
        if (Math.random() < 0.5) spawnNote();
        if (Math.random() < 0.2) spawnNote();
      }
    }

    ctx.clearRect(0, 0, noteCanvas.width, noteCanvas.height);
    ctx.save();

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.wobble += 0.03 * dtScale;
      p.x      += (p.vx + Math.sin(p.wobble) * p.wobbleAmp) * dtScale;
      p.y      += p.vy * dtScale;
      p.alpha  -= p.fadeRate * dtScale;

      if (p.alpha <= 0) { particles.splice(i, 1); continue; }

      if (noteSprite && tintedSprites) {
        drawTintedSprite(p);
      } else {
        drawGlyphFallback(p);
      }
    }

    ctx.restore();
  }

  requestAnimationFrame(tickNotes);

  // ── Music callback chain ────────────────────────────────────────
  const _origPlay  = window.onMusicPlay;
  const _origPause = window.onMusicPause;
  const _origEnd   = window.onMusicEnd;

  window.onMusicPlay = () => {
    isPlaying = true;
    if (_origPlay) _origPlay();
  };
  window.onMusicPause = () => {
    isPlaying = false;
    if (_origPause) _origPause();
  };
  window.onMusicEnd = () => {
    isPlaying = false;
    if (_origEnd) _origEnd();
  };

  // Expose spawnNote globally so future systems (e.g. SpessaSynth note-on
  // callback) can pass a real pitch value: window._spawnNoteParticle(pitch)
  window._spawnNoteParticle = spawnNote;
})();

export {};
