// ─────────────────────────────────────────────────────────────────
//  DYNAMIC BACKGROUND — procedurally generated, no image assets.
//
//  Seeded from the current track's title/artist/year (already parsed
//  by script.js's parseMeta() into window.musicPlayer's track list —
//  see getTrackMeta below), so the same song always regenerates the
//  same background, and different songs look different. Off by
//  default; the #bg-toggle button (top-right, below #github-flap)
//  turns it on/off, persisted like the soundfont preference.
//
//  Rendering: a handful of soft, low-opacity radial-gradient blobs on
//  #bg-canvas (position:fixed, behind #canvas-container — see
//  styles.css). Drawn once per song load / resize, not per-frame —
//  this is a static generated image, not an animation.
// ─────────────────────────────────────────────────────────────────
(function () {
  const btn    = document.getElementById('bg-toggle');
  const canvas = document.getElementById('bg-canvas');
  if (!btn || !canvas) return;

  const ctx = canvas.getContext('2d');
  const STORAGE_KEY = 'noteblock-pianola-dynamic-bg';

  let enabled = false;
  try { enabled = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { /* non-fatal */ }

  let currentMeta = null; // last { title, artist, year } we rendered for

  // ── Deterministic seed → PRNG ──────────────────────────────────
  // Small string hash (djb2-ish) feeding a mulberry32 generator. No
  // dependency, and both are pure/deterministic: same string in,
  // same sequence of "random" numbers out, every time.
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Year → warmth bias (0 = warm/sepia, 1 = cool/vibrant). Purely a
  // gentle hue nudge layered on top of the hash-driven base hue below —
  // it does not by itself determine the palette, so two songs from the
  // same year still look distinct from each other.
  const YEAR_MIN = 1890, YEAR_MAX = 2030;
  function yearWarmth(year) {
    if (!year) return 0.5; // no year parsed — neutral, hash-only
    const t = (year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
    return Math.max(0, Math.min(1, t));
  }

  // ── Palette + blob layout ──────────────────────────────────────
  const BLOB_COUNT = 5;

  function renderBackground(meta) {
    const w = canvas.width  = window.innerWidth;
    const h = canvas.height = window.innerHeight;

    const seedStr = `${meta.title || ''}|${meta.artist || ''}|${meta.year ?? 'unknown'}`;
    const rand = mulberry32(hashString(seedStr));

    const warmth = yearWarmth(meta.year);
    const baseHue = rand() * 360;

    ctx.clearRect(0, 0, w, h);
    // Dark base so the 3D music box and note particles stay legible —
    // the blobs are an atmospheric layer, not a busy scene.
    ctx.fillStyle = `hsl(${baseHue}, 30%, 8%)`;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < BLOB_COUNT; i++) {
      // Each blob's hue drifts off the base hue, nudged warmer/cooler
      // by the song's year — older songs skew toward amber/sepia hues,
      // newer ones skew toward blues/violets.
      const hueDrift = (rand() - 0.5) * 90;
      const warmthShift = (warmth - 0.5) * -60; // warmth=0 → +30 (toward red/amber), warmth=1 → -30 (toward blue)
      const hue = (baseHue + hueDrift + warmthShift + 360) % 360;

      const sat = 45 + rand() * 30;
      const light = 25 + rand() * 20;
      const alpha = 0.16 + rand() * 0.14;

      const cx = rand() * w;
      const cy = rand() * h;
      const radius = (0.25 + rand() * 0.35) * Math.max(w, h);

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`);
      grad.addColorStop(1, `hsla(${hue}, ${sat}%, ${light}%, 0)`);

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function redraw() {
    if (enabled && currentMeta) renderBackground(currentMeta);
  }

  function applyEnabledState() {
    canvas.style.display = enabled ? 'block' : 'none';
    btn.textContent = enabled ? '⬛ BG' : '⬜ BG';
    btn.classList.toggle('active', enabled);
    if (enabled) redraw();
  }

  btn.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (e) { /* non-fatal */ }
    applyEnabledState();
  });

  window.addEventListener('resize', redraw);

  applyEnabledState();

  // ── Track-change hook ────────────────────────────────────────────
  // script.js dispatches this after every successful track load
  // (library track or upload), with the same { title, artist, year }
  // shape produced by its parseMeta(). No dependency on MIDI parsing —
  // this metadata is available immediately, unlike the note-onset
  // timeline used by the crank/particle features.
  window.addEventListener('track:changed', (e) => {
    currentMeta = e.detail || null;
    if (enabled) redraw();
  });
})();
