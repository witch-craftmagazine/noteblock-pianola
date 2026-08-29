// ─────────────────────────────────────────────────────────────────
//  MUSIC BOX — BUNDLE ENTRY POINT
//
//  Replaces the three CDN <script> tags + ~700 lines of inline
//  <script> that used to live in index.html. Load order matters:
//  scene.js defines window.musicBoxAnimations and the first
//  window.onMusicPlay/Pause/End handlers; particles.js wraps those
//  handlers (chain pattern), so it must come after scene.js.
//  bg-toggle.js and soundfont-toggle.js are both independent of the
//  onMusicPlay/Pause/End chain. `bun run build` bundles this file
//  (and its three.js import) into dist/main.js.
// ─────────────────────────────────────────────────────────────────
import './scene.js';
import './particles.js';
import './bg-toggle.js';
import './soundfont-toggle.js';
