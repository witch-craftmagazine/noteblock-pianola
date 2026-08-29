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

  const SPAWN_X_MIN = 0.25;
  const SPAWN_X_MAX = 0.75;
  const SPAWN_Y     = 0.55;
  const MAX_PARTICLES = 28; // hard cap so a slow frame can't snowball into more work

  // Explosion particles (cannon soundfont) get their own cap, separate
  // from MAX_PARTICLES above — each note-on spawns several of them at
  // once (a debris burst + smoke puffs), so sharing the note cap would
  // let a busy cannon passage crowd out everything else, or vice versa.
  const MAX_EXPLOSION_PARTICLES = 40;

  // Fallback pitch range if a song's real range (script.js's
  // window._songPitchRange, built alongside the crank's note-onset
  // timeline) isn't available yet — a generic piano-ish span so the
  // linear mapping below still looks reasonable.
  const FALLBACK_LOW_PITCH  = 36;
  const FALLBACK_HIGH_PITCH = 84;

  // Shared by spawnNote and spawnExplosion: maps a MIDI pitch to canvas
  // X using the song's real pitch range when available (see feature 2).
  function pitchToX(pitch) {
    const range = window._songPitchRange;
    const lowPitch  = range ? range.low  : FALLBACK_LOW_PITCH;
    const highPitch = range ? range.high : FALLBACK_HIGH_PITCH;
    const span = Math.max(1, highPitch - lowPitch); // avoid divide-by-zero on single-note ranges
    const t = Math.max(0, Math.min(1, (pitch - lowPitch) / span));
    return (SPAWN_X_MIN + t * (SPAWN_X_MAX - SPAWN_X_MIN)) * noteCanvas.width;
  }

  // Spawns one particle for a real note. X position is now a linear
  // function of pitch — low notes spawn toward the left, high notes
  // toward the right — rather than random, so the overlay reads as an
  // actual (rough) visualization of the notes playing, piano-roll style.
  function spawnNote(pitch, velocity) {
    if (particles.length >= MAX_PARTICLES) return;
    const usePitch = (pitch !== undefined) ? pitch : Math.floor(Math.random() * 25);

    const x = pitchToX(usePitch);
    const y = SPAWN_Y * noteCanvas.height;
    // Velocity (0–127, may be undefined for the old random fallback)
    // gives a subtle size/brightness boost to harder-hit notes.
    const velT = (velocity !== undefined) ? Math.max(0, Math.min(1, velocity / 127)) : 0.5;
    particles.push({
      kind     : 'note',
      x,
      y,
      pitch    : usePitch,
      rgb      : pitchToRGB(usePitch),
      glyph    : NOTES_GLYPHS[Math.floor(Math.random() * NOTES_GLYPHS.length)],
      size     : 14 + velT * 12,  // was: 14 + Math.random()*12 — now velocity-driven, not random
      vx       : (Math.random() - 0.5) * 0.7,
      vy       : -(0.9 + Math.random() * 1.2),
      alpha    : 0.7 + velT * 0.3,
      fadeRate : 0.012 + Math.random() * 0.01, // fades several x faster — fewer concurrent particles
      wobble   : Math.random() * Math.PI * 2,
      wobbleAmp: 0.4 + Math.random() * 0.6,
    });
  }

  // ── Cannon explosion particles ────────────────────────────────────
  // Two-layer burst, modeled on the "Explosive Enhancement" Minecraft
  // mod reference: a radial spray of small, fast, gray/ember debris
  // particles, plus a couple of larger, slower, soft gray smoke puffs
  // that drift and linger after the debris has faded. Both scale with
  // note velocity, matching that mod's power-scaled explosion sizing.
  // Flat-shape rendering (no sprite) — chunky/blocky reads as
  // "Minecraft particle" on its own, and needs no new image asset.
  const DEBRIS_COLORS = ['#4a4a4a', '#6e6e6e', '#c7c7c7', '#ff9d3d', '#ffd23d'];

  function spawnDebrisParticle(x, y, velT) {
    if (countByKind('debris') + countByKind('smoke') >= MAX_EXPLOSION_PARTICLES) return;
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.2 + Math.random() * 2.2) * (0.6 + velT * 0.8);
    particles.push({
      kind     : 'debris',
      x, y,
      color    : DEBRIS_COLORS[Math.floor(Math.random() * DEBRIS_COLORS.length)],
      size     : 3 + Math.random() * 3 + velT * 3,
      vx       : Math.cos(angle) * speed,
      vy       : Math.sin(angle) * speed - 0.6, // slight upward bias so the burst doesn't sink immediately
      gravity  : 0.05,
      alpha    : 1,
      fadeRate : 0.03 + Math.random() * 0.02, // debris is quick — burst, not lingering
      rotation : Math.random() * Math.PI * 2,
      spin     : (Math.random() - 0.5) * 0.3,
    });
  }

  function spawnSmokePuff(x, y, velT) {
    if (countByKind('debris') + countByKind('smoke') >= MAX_EXPLOSION_PARTICLES) return;
    particles.push({
      kind     : 'smoke',
      x, y,
      size     : (16 + Math.random() * 10) * (0.7 + velT * 0.6),
      vx       : (Math.random() - 0.5) * 0.4,
      vy       : -(0.3 + Math.random() * 0.3), // slow upward drift
      alpha    : 0.35 + velT * 0.15,
      fadeRate : 0.008 + Math.random() * 0.006, // lingers after debris fades
    });
  }

  function countByKind(kind) {
    let n = 0;
    for (const p of particles) if (p.kind === kind) n++;
    return n;
  }

  const DEBRIS_PER_EXPLOSION_MIN = 6;
  const DEBRIS_PER_EXPLOSION_MAX = 10;
  const SMOKE_PER_EXPLOSION_MIN  = 1;
  const SMOKE_PER_EXPLOSION_MAX  = 2;

  // window._spawnExplosion(pitch, velocity) — called instead of
  // spawnNote() while the cannon soundfont is active (see script.js's
  // synth 'noteOn' listener). Origin X reuses the same pitch→X mapping
  // as normal notes, so cannon mode still reads left-to-right by pitch.
  function spawnExplosion(pitch, velocity) {
    const usePitch = (pitch !== undefined) ? pitch : 60;
    const velT = (velocity !== undefined) ? Math.max(0, Math.min(1, velocity / 127)) : 0.7;

    const x = pitchToX(usePitch);
    const y = SPAWN_Y * noteCanvas.height;

    const debrisCount = DEBRIS_PER_EXPLOSION_MIN +
      Math.round(velT * (DEBRIS_PER_EXPLOSION_MAX - DEBRIS_PER_EXPLOSION_MIN));
    for (let i = 0; i < debrisCount; i++) spawnDebrisParticle(x, y, velT);

    const smokeCount = SMOKE_PER_EXPLOSION_MIN +
      Math.round(velT * (SMOKE_PER_EXPLOSION_MAX - SMOKE_PER_EXPLOSION_MIN));
    for (let i = 0; i < smokeCount; i++) spawnSmokePuff(x, y, velT);
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

  // ── Debris / smoke draw ──────────────────────────────────────────
  // Flat shapes, no sprite — small rotating squares for debris (chunky,
  // "Minecraft particle" read), soft radial-gradient blobs for smoke.
  function drawDebris(p) {
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  }

  function drawSmoke(p) {
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
    const a = Math.max(0, p.alpha);
    grad.addColorStop(0, `rgba(90,90,90,${a})`);
    grad.addColorStop(1, `rgba(90,90,90,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  let lastTime = null;
  const MAX_DT = 50; // ms — clamp so a slow/backgrounded frame can't fling particles

  function tickNotes(timestamp) {
    requestAnimationFrame(tickNotes);

    let dt = lastTime ? timestamp - lastTime : 16;
    dt = Math.min(dt, MAX_DT);
    lastTime = timestamp;
    const dtScale = dt / 16; // normalize motion/fade to ~60fps-equivalent steps

    // Spawning is now purely event-driven — window._spawnNoteParticle
    // (below) is called directly from script.js's synth 'noteOn'
    // listener for every real note played. No more random timer/cadence;
    // isPlaying is retained only for the onMusicPlay/Pause/End hooks below
    // in case a future feature needs to gate on playback state.

    ctx.clearRect(0, 0, noteCanvas.width, noteCanvas.height);
    ctx.save();

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      if (p.kind === 'debris') {
        p.vy     += p.gravity * dtScale;
        p.x      += p.vx * dtScale;
        p.y      += p.vy * dtScale;
        p.rotation += p.spin * dtScale;
        p.alpha  -= p.fadeRate * dtScale;
        if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        drawDebris(p);
        continue;
      }

      if (p.kind === 'smoke') {
        p.x     += p.vx * dtScale;
        p.y     += p.vy * dtScale;
        p.size  += 0.15 * dtScale; // slowly expands as it drifts, like a dissipating puff
        p.alpha -= p.fadeRate * dtScale;
        if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        drawSmoke(p);
        continue;
      }

      // 'note' particles (default/fallback for entries with no kind)
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

  // window._spawnNoteParticle(pitch, velocity) — called from script.js's
  // synth 'noteOn' listener for every real note played (normal playback
  // and crank stepNote() plinks alike). pitch/velocity are optional;
  // omitting them falls back to the old random-pitch behavior.
  window._spawnNoteParticle = spawnNote;

  // window._spawnExplosion(pitch, velocity) — called from the same
  // listener instead of _spawnNoteParticle while the Napoleonic Cannon
  // soundfont is active (see script.js's isCannonMode check).
  window._spawnExplosion = spawnExplosion;
})();

export {};
