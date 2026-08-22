# Noteblock Pianola — iOS shell

Thin WKWebView wrapper around the noteblock-pianola static site that
lives in the rest of this repo. No second implementation of the
player — this folder is just native chrome (window, audio session,
background-audio entitlement, optional deep linking) around the same
web app that runs at witch-craftmagazine.github.io/noteblock-pianola/.

This scaffold did not exist yet when this folder was created — it was
built from scratch against `ios-app-plan.md`'s description of what it
should contain, since no prior scaffold was found. If a `.xcodeproj`
or different `project.yml` already exists somewhere else, diff against
that instead of assuming this is authoritative.

This lives as a subfolder of the main repo (not a separate repo), so
"the web app" below just means "the rest of this checkout, one level
up" — there's nothing else to clone.

## Build locally

Requires a Mac with Xcode installed (`xcode-select -p` should print an
Xcode.app path, not just the Command Line Tools) and
[XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`).

```bash
# Run from the repo root, not from inside this folder.

# 1. Build the web app
bun install
bun run build

# 2. Stage it into the shell (mirrors .github/workflows/ios-build.yml —
#    see that file for the full exclude list and why each entry is there)
mkdir -p noteblock-pianola-ios-shell/web
rsync -a --exclude node_modules --exclude .git --exclude 'song/' \
  --exclude 'noteblock-pianola-ios-shell/' \
  --exclude 'src/' --exclude 'tools/' --exclude 'scripts/' \
  --exclude '.github/' --exclude 'bun.lock' --exclude 'package.json' \
  --exclude 'make-claude-upload.sh' --exclude 'claude-upload.zip' \
  --exclude 'ios-app-plan.md' --exclude 'noteblock-docs.md' \
  --exclude 'EXCLUDED_FROM_THIS_ZIP.md' --exclude '.gitignore' \
  --exclude '.DS_Store' --exclude 'README.md' --exclude 'NOTICE' \
  --exclude 'LICENSE*' \
  ./ noteblock-pianola-ios-shell/web/

# 3. Generate and build
cd noteblock-pianola-ios-shell
xcodegen generate
open NoteblockPianola.xcodeproj   # or build headlessly, see below
```

Headless build/run (no Xcode GUI), matching the project's usual
command-line workflow:

```bash
xcodebuild -project NoteblockPianola.xcodeproj -scheme NoteblockPianola \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  CODE_SIGNING_ALLOWED=NO build

# Device build + install needs a real Apple Development identity —
# -allowProvisioningUpdates fetches a profile automatically:
xcodebuild -project NoteblockPianola.xcodeproj -scheme NoteblockPianola \
  -destination 'generic/platform=iOS' -allowProvisioningUpdates \
  -derivedDataPath build/ios -archivePath build/NoteblockPianola.xcarchive archive
xcrun devicectl device install app build/ios/Build/Products/Debug-iphoneos/NoteblockPianola.app
```

## Phase 0 — the two things to verify on a real device before anything else

Neither of these can be confirmed from a Linux sandbox or in CI (no
audio hardware, no real WKWebView) — they need a physical iPhone.

1. **AudioWorklet under `file://`.** Open the app, tap/drag the crank,
   confirm sound actually comes out. If it silently fails, check
   Safari's remote Web Inspector (Settings → Safari → Advanced →
   Web Inspector on the phone, then Develop menu on the Mac) for a
   console error from `context.audioWorklet.addModule(...)` before
   assuming it's broken — it may just be a relative-path issue in how
   `web/` got staged, not an AudioWorklet/`file://` incompatibility.
2. **`fetch()` for sibling resources** (`musicbox.glb`, `minecraft3.sf2`,
   `midilist.json`, individual `.mid` files). Confirm the 3D model
   renders and the track list populates — both depend on
   `loadFileURL(_:allowingReadAccessTo:)` granting read access to the
   whole `web/` directory, not just `index.html` (this scaffold's
   `MusicBoxViewController.loadContent()` already does that).
3. **Not in the original plan, added after reading the actual code:**
   `easter-eggs/egg-loader.js` does a *dynamic* `import()` of each egg
   module, with the module path coming from `registry.json` (JSON data,
   not a static specifier baked into the source). Confirm at least one
   easter egg still fires under `file://` — dynamic `import()` support
   is a separate WebKit feature from static `<script type="module">`
   and from AudioWorklet, so it's worth checking explicitly rather than
   assuming it's covered by the other two checks.

If any of these fail, see `ios-app-plan.md` Phase 0 for the
`file://`-alternative fallback (a custom URL scheme instead) — don't
build that fallback until something is confirmed broken, not just
theoretically risky.

## What's actually new here vs. what the web app already provides

Everything native in `Sources/` is new (there was no scaffold to start
from). Everything the web app does — background audio survival is
*configured* here (`AVAudioSession`, `UIBackgroundModes`) but the
playback itself, the crank's pointer-event handling, and the easter
eggs are unchanged from the existing site. See the parent repo's
`noteblock-docs.md` for how those work — with two corrections, since
that file is stale in a couple of places as of this scaffold:

- It describes the crank as **mouse-only** ("Priority 1" improvement
  opportunity). The actual `src/musicbox/scene.js` already uses
  `pointerdown`/`pointermove`/`pointerup` with `setPointerCapture` —
  this was fixed after the doc was last updated. Good news for this
  wrapper: nothing iOS-specific is needed for touch.
- It describes Three.js and GLTFLoader as loaded from cdnjs/jsDelivr
  `<script>` CDN tags. The actual build (`src/musicbox/main.js` →
  `bun run build`) now bundles `three` as an npm dependency instead —
  there's no CDN dependency at runtime anymore, which removes a
  network-availability risk this wrapper would otherwise have to worry
  about under `file://`.

## Open items (Phase 2/3/4 from ios-app-plan.md, not started)

- **Offline vs. hybrid content** — `MusicBoxViewController.useRemoteContent`
  is the single switch; currently `false` (fully bundled). Revisit once
  `midi/`'s growth rate and how the project owner wants to maintain the
  app are both known (see plan Phase 2).
- **App icon / launch screen** — `INFOPLIST_KEY_UILaunchScreen_Generation`
  is on so the app builds without one, but there's no real icon or
  branded launch image yet. Blocks App Store/TestFlight; not blocking
  for an initial AltStore build.
- **Deep linking** — custom-scheme handler (`noteblockpianola://song/<slug>`)
  is implemented in `AppDelegate`. Universal Links are not — that needs
  an `apple-app-site-association` file hosted on
  witch-craftmagazine.github.io plus uncommenting the Associated
  Domains entitlement (see `Sources/NoteblockPianola.entitlements`).
- **iPad** — `TARGETED_DEVICE_FAMILY` is `"1"` (iPhone only). Flip to
  `"1,2"` once Phase 0 passes and someone's checked the 3D canvas/player
  panel at iPad aspect ratios.
- **Crash/analytics** — nothing wired, matches the plan (optional,
  not blocking for an initial build).
- **Real signing / ipa / AltStore-source publishing** — intentionally
  left out of `.github/workflows/ios-build.yml`. Reuse whatever
  pipeline already exists for other AltStore-distributed apps (Phase 4).
