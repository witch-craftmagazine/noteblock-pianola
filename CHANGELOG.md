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
- `#github-flap`, `#sf-toggle`, and `#bg-toggle` were positioned with fixed
  `top`/`left`/`right` offsets and no safe-area awareness, despite the page
  opting into edge-to-edge content (`viewport-fit=cover`). On a notched/
  Dynamic Island device with no browser chrome to push content clear — i.e.
  specifically the iOS app shell — `#github-flap` (pinned to the literal
  `top:0; right:0` corner) sat under the sensor housing and in iOS's
  reserved Control Center swipe corner, making it effectively untappable.
  All three now use `env(safe-area-inset-*)` (via `max()` for the two that
  had a fixed 14px inset). No visual change on non-notched devices/desktop
  browsers, where `env()` resolves to 0.
- **iOS shell:** `noteblock-pianola-ios-shell/web/` (the staged copy of the
  site that ships inside the app bundle) is gitignored and was only ever
  refreshed by a human running the staging steps by hand — easy to forget,
  and CI validates a fresh build without producing anything a device
  actually installs. This is why the installed app had drifted from the
  live site. `project.yml` now runs `scripts/sync-web.sh` as a
  `preBuildScripts` phase, so every single Xcode build (`Cmd+R` or
  `xcodebuild`) restages `web/` from a fresh `bun run build` first — a
  stale local `web/` is no longer possible. The script also hard-fails the
  build (rather than shipping a broken bundle) if `dist/main.js` is missing
  after staging, which is the specific condition that leaves the app stuck
  on its in-page loading spinner forever under `file://` (see
  `MusicBoxViewController.loadContent()` / `src/musicbox/scene.js`'s
  loading-spinner dismissal, which only runs once the bundle has loaded).
- **iOS shell:** `webView.scrollView.contentInsetAdjustmentBehavior` was
  left at its `.automatic` default, which could let UIKit apply its own
  safe-area content insets on top of the page's own CSS `env()`-based
  handling. Set to `.never` so WebKit's CSS-driven insets are the only
  ones in effect.

### Changed
- Replaced the `#bg-toggle` background-toggle button (top-right corner)
  with `#github-flap`, a corner ribbon linking to the GitHub repo.
  `bg-toggle.js` and its CSS are left intact and dormant — re-adding the
  `<button id="bg-toggle">` markup to `index.html` is the only step
  needed to bring the toggle back.
