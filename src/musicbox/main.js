// ─────────────────────────────────────────────────────────────────
//  MUSIC BOX — BUNDLE ENTRY POINT
//
//  Replaces the three CDN <script> tags + ~700 lines of inline
//  <script> that used to live in index.html. Load order matters:
//  scene.js defines window.musicBoxAnimations and the first
//  window.onMusicPlay/Pause/End handlers; particles.js wraps those
//  handlers (chain pattern), so it must come after scene.js.
//  bg-toggle.js and style-toggle.js have been unified into
//  theme-toggle.js. flow-background.js is independent (script.js's
//  own noteOn handler calls into it directly), but theme-toggle.js
//  calls window._flowBackground.setEnabled() when in 'skeu' mode, so
//  it must load after flow-background.js. `bun run build` bundles
//  this file (and its three.js import) into dist/main.js.
// ─────────────────────────────────────────────────────────────────
import './scene.js';
import './particles.js';
import './soundfont-toggle.js';
import './flow-background.js';
import './theme-toggle.js';
