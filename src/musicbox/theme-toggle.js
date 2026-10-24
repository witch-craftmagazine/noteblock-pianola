// ─────────────────────────────────────────────────────────────────
//  THEME & BACKGROUND TOGGLE — Unified 3-mode switcher.
//
//  Cycles through three complete presentation styles via a single button (#theme-toggle):
//    1. 'dark'  : Dark navy base (#1a1a2e) + default flat controls.
//    2. 'blobs' : Procedural per-song radial-gradient blobs on #bg-canvas
//                 (from commit 984edce) + default flat controls.
//    3. 'skeu'  : Skeuomorphic Braun-radio controls + vibrant MIDI-reactive
//                 animated flow background on #flow-canvas (flow-background.js).
//
//  Persisted via localStorage key 'noteblock-pianola-theme'.
// ─────────────────────────────────────────────────────────────────

(function () {
  const btn        = document.getElementById('theme-toggle');
  const bgCanvas   = document.getElementById('bg-canvas');
  const bgCtx      = bgCanvas ? bgCanvas.getContext('2d') : null;

  const STORAGE_KEY = 'noteblock-pianola-theme';
  const MODES = ['dark', 'blobs', 'skeu'];

  let mode = 'dark';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (MODES.includes(saved)) {
      mode = saved;
    } else {
      // Migrate from prior independent keys if present
      if (localStorage.getItem('noteblock-pianola-ui-style') === 'skeu') {
        mode = 'skeu';
      } else if (localStorage.getItem('noteblock-pianola-dynamic-bg') === '1') {
        mode = 'blobs';
      }
    }
  } catch (e) { /* non-fatal */ }

  let currentMeta = null; // { title, artist, year }

  // ── 984edce Procedural Blobs Generator ──────────────────────────
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

  const YEAR_MIN = 1890, YEAR_MAX = 2030;
  function yearWarmth(year) {
    if (!year) return 0.5;
    const t = (year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
    return Math.max(0, Math.min(1, t));
  }

  const BLOB_COUNT = 5;

  function renderBlobs(meta) {
    if (!bgCanvas || !bgCtx || !meta) return;
    const w = bgCanvas.width  = window.innerWidth;
    const h = bgCanvas.height = window.innerHeight;

    const seedStr = `${meta.title || ''}|${meta.artist || ''}|${meta.year ?? 'unknown'}`;
    const rand = mulberry32(hashString(seedStr));

    const warmth = yearWarmth(meta.year);
    const baseHue = rand() * 360;

    bgCtx.clearRect(0, 0, w, h);
    bgCtx.fillStyle = `hsl(${baseHue}, 30%, 8%)`;
    bgCtx.fillRect(0, 0, w, h);

    for (let i = 0; i < BLOB_COUNT; i++) {
      const hueDrift = (rand() - 0.5) * 90;
      const warmthShift = (warmth - 0.5) * -60;
      const hue = (baseHue + hueDrift + warmthShift + 360) % 360;

      const sat = 45 + rand() * 30;
      const light = 25 + rand() * 20;
      const alpha = 0.16 + rand() * 0.14;

      const cx = rand() * w;
      const cy = rand() * h;
      const radius = (0.25 + rand() * 0.35) * Math.max(w, h);

      const grad = bgCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`);
      grad.addColorStop(1, `hsla(${hue}, ${sat}%, ${light}%, 0)`);

      bgCtx.fillStyle = grad;
      bgCtx.fillRect(0, 0, w, h);
    }
  }

  function redrawBlobs() {
    if (mode === 'blobs' && currentMeta) {
      renderBlobs(currentMeta);
    }
  }

  // ── Mode Application ─────────────────────────────────────────────
  function apply(nextMode) {
    mode = nextMode;
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) { /* non-fatal */ }

    // 1. Controls theme (flat vs. skeu)
    document.body.dataset.uiStyle = (mode === 'skeu') ? 'skeu' : 'flat';

    // 2. Procedural blobs canvas (#bg-canvas)
    if (bgCanvas) {
      bgCanvas.style.display = (mode === 'blobs') ? 'block' : 'none';
      if (mode === 'blobs') redrawBlobs();
    }

    // 3. Vibrant Flow animated background (#flow-canvas)
    if (window._flowBackground) {
      window._flowBackground.setEnabled(mode === 'skeu');
    }

    // 4. Button label and active status
    if (btn) {
      btn.classList.toggle('active', mode !== 'dark');
      switch (mode) {
        case 'dark':
          btn.textContent = '🌑 Dark';
          btn.title = 'Current theme: Classic dark navy base (flat controls). Click to switch to procedural song blobs.';
          break;
        case 'blobs':
          btn.textContent = '🎨 Blobs';
          btn.title = 'Current theme: Procedural song blobs (flat controls). Click to switch to skeuomorphic flow.';
          break;
        case 'skeu':
          btn.textContent = '📻 Skeu';
          btn.title = 'Current theme: Skeuomorphic Braun controls + vibrant flow background. Click to switch to classic dark.';
          break;
      }
    }
  }

  if (btn) {
    btn.addEventListener('click', () => {
      const curIdx = MODES.indexOf(mode);
      const nextIdx = (curIdx + 1) % MODES.length;
      apply(MODES[nextIdx]);
    });
  }

  window.addEventListener('resize', () => {
    if (mode === 'blobs') redrawBlobs();
  });

  window.addEventListener('track:changed', (e) => {
    currentMeta = e.detail || null;
    if (mode === 'blobs') redrawBlobs();
  });

  apply(mode);
})();
