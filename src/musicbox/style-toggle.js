// ─────────────────────────────────────────────────────────────────
//  STYLE TOGGLE — flat/dark (current) vs. Flow + skeuomorphic Braun-
//  radio style (new). One user-facing switch bundling both the
//  animated background (src/musicbox/flow-background.js) and the
//  #music-player/#mp-browse-* control panel's CSS variant (see the
//  `body[data-ui-style="skeu"]` rules added in script.js's buildUI()).
//
//  Persisted like the soundfont/dynamic-background preferences
//  (localStorage, same try/catch-non-fatal pattern as bg-toggle.js).
//  Off (flat) by default — this is a new, unproven-in-the-wild look,
//  same reasoning bg-toggle.js gives for defaulting off.
// ─────────────────────────────────────────────────────────────────
(function () {
  const btn = document.getElementById('style-toggle');
  if (!btn) return;

  const STORAGE_KEY = 'noteblock-pianola-ui-style';
  let style = 'flat';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'flat' || saved === 'skeu') style = saved;
  } catch (e) { /* non-fatal */ }

  function apply(next) {
    style = next;
    document.body.dataset.uiStyle = style;
    btn.classList.toggle('active', style === 'skeu');
    btn.textContent = style === 'skeu' ? '🎛 Skeu' : '🎛 Flat';
    btn.title = style === 'skeu'
      ? 'Switch to flat/dark controls'
      : 'Switch to Flow + skeuomorphic controls';
    if (window._flowBackground) window._flowBackground.setEnabled(style === 'skeu');
    try { localStorage.setItem(STORAGE_KEY, style); } catch (e) { /* non-fatal */ }
  }

  btn.addEventListener('click', () => {
    apply(style === 'flat' ? 'skeu' : 'flat');
  });
  apply(style);
})();
