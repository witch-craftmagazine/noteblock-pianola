// ─────────────────────────────────────────────────────────────────
//  MUSIC BOX — BUNDLE ENTRY POINT
//
//  Replaces the three CDN <script> tags + ~700 lines of inline
//  <script> that used to live in index.html. Load order matters:
//  scene.js defines window.musicBoxAnimations and the first
//  window.onMusicPlay/Pause/End handlers; particles.js and
//  bg-toggle.js wrap those handlers (chain pattern), so they must
//  come after scene.js. `bun run build` bundles this file (and its
//  three.js import) into dist/musicbox.js.
// ─────────────────────────────────────────────────────────────────
import './scene.js';
import './particles.js';
import './bg-toggle.js';
