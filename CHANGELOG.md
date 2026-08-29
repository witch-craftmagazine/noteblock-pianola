# Changelog

## Unreleased

### Fixed
- All six easter eggs (`minecraft`, `carrotfield`, `green`, `office`, `lab`,
  `duck`) were failing to load on the live site with `ReferenceError: THREE
  is not defined`. Cause: the switch from a global `<script src="three.min.js">`
  tag to bundling three.js as a real ES import (`src/musicbox/scene.js`)
  stopped exposing `THREE` as a `window` global, but the easter-egg modules
  under `easter-eggs/*/index.js` reference the bare `THREE` global directly
  and don't import three.js themselves. `scene.js` now sets `window.THREE`
  (with `GLTFLoader` attached) right after importing three.js, restoring the
  old global for the eggs to use.

### Changed
- Replaced the `#bg-toggle` background-toggle button (top-right corner)
  with `#github-flap`, a corner ribbon linking to the GitHub repo.
  `bg-toggle.js` and its CSS are left intact and dormant — re-adding the
  `<button id="bg-toggle">` markup to `index.html` is the only step
  needed to bring the toggle back.
