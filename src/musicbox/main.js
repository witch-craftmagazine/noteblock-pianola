// ─────────────────────────────────────────────────────────────────
//  MUSIC BOX — BUNDLE ENTRY POINT
//
//  Replaces the three CDN <script> tags + ~700 lines of inline
//  <script> that used to live in index.html. Load order matters:
//  scene.js defines window.musicBoxAnimations and the first
//  window.onMusicPlay/Pause/End handlers; particles.js wraps those
//  handlers (chain pattern), so it must come after scene.js.
//  bg-toggle.js and soundfont-toggle.js are both independent of the
//  onMusicPlay/Pause/End chain — bg-toggle.js is currently dormant
//  (index.html has no #bg-toggle button; see that file's header
//  comment) but stays imported so re-adding the button is a
//  zero-JS-change operation. `bun run build` bundles this file (and
//  its three.js import) into dist/main.js.
// ─────────────────────────────────────────────────────────────────
import './scene.js';
import './particles.js';
import './bg-toggle.js';
import './soundfont-toggle.js';
