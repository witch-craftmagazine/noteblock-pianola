# Noteblock Pianola — Project Documentation

**Hosted at:** `https://witch-craftmagazine.github.io/noteblock-pianola/`  
**Brand name:** Cafe Amalfi  
**Type:** Static single-page web app (no backend, no build step)

---

## What It Is

An interactive 3D music box that plays MIDI files through a Minecraft-themed soundfont. The user winds a crank on a 3D model to trigger playback. Musical note glyphs float up as particles while the music plays. A full track list of ~230 MIDI files (ragtime, jazz, classical, broadway, bossa nova, etc.) can be browsed via a floating player UI at the bottom of the screen.

There are "easter egg" overlays — full-screen animated scenes triggered by specific songs. Currently one exists: when `i_feel_pretty_1957_-_bernstein.mid` plays, a Minecraft character (loaded from a custom skin) walks across the screen, transforms into an Enderman via a particle "poof", then walks back.

---

## File Index

| File | Role |
|------|------|
| `index.html` | App shell + all inline JS (scene, crank, particles, easter eggs) |
| `script.js` | ES module: MIDI player UI, soundfont loading, playback controls |
| `midilist.json` | Ordered list of all MIDI file paths, loaded at runtime |
| `minecraft3.sf2` | Modified Minecraft soundfont (instruments transposed for music-box timbre) |
| `lib/spessasynth_lib.js` | SpessaSynth audio library (Apache 2.0) |
| `lib/spessasynth_core.js` | SpessaSynth core module (resolved via importmap) |
| `lib/spessasynth_processor.min.js` | AudioWorklet processor loaded at runtime |
| `name.py` | Dev utility: normalizes MIDI filenames and regenerates `midilist.json` |
| `inst.py` | Dev utility: scans MIDI files and reports instrument counts per file |

**Root-level assets referenced but excluded from this upload:**

| Asset | Used by |
|-------|---------|
| `musicbox.glb` | Three.js 3D model of the music box |
| `enderman.glb` | Optional GLB for Enderman character (falls back to procedural mesh) |
| `background.webp` | Optional background toggled by the BG button |
| `musicbox.webp` | OG/social preview image |
| `noteblock.png` | Favicon |
| `sweetpea.png` | Minecraft player skin for the "I Feel Pretty" easter egg |
| `midi/` | Directory of ~230 `.mid` files |

---

## Architecture

The app has no framework, no bundler, and no server. Everything runs in the browser from static files served by GitHub Pages.

### Dependency loading order (index.html)

1. **Importmap** — maps bare specifier `spessasynth_core` to `./lib/spessasynth_core.js`.
2. **Three.js r128** — loaded from cdnjs CDN.
3. **GLTFLoader** — loaded from jsDelivr CDN (Three r128 build).
4. **Inline script block 1** — Scene setup, GLB loading, animation system, crank/lid interaction, music callbacks, background toggle.
5. **Inline script block 2** — Note particle system (canvas overlay).
6. **`<script type="module" src="./script.js">`** — MIDI player.
7. **Inline script block 3** — Minecraft easter egg overlay (IIFE, hooks into music callbacks).

### Global communication pattern

Because `script.js` is an ES module and the inline scripts are classic scripts, they communicate through `window` globals:

| Global | Set by | Read by |
|--------|--------|---------|
| `window.musicPlayer` | `script.js` | `index.html` crank handler |
| `window.onMusicPlay(songFile)` | chain of IIFEs wrapping each other | each subscriber |
| `window.onMusicPause()` | same chain | same |
| `window.onMusicEnd()` | same chain | same |
| `window._currentSong` | `script.js` | MC easter egg (checks filename) |
| `window._sf2Buffer` | `script.js` init | `ensureAudioContext()` |
| `window.musicBoxAnimations` | inline script 1 | music callbacks |
| `window._registerCrankMeshes(root)` | inline script 1 | called during GLB load |
| `window._registerLidMeshes(root)` | inline script 1 | called during GLB load |

Each inline IIFE subscribes to `onMusicPlay/Pause/End` by saving the previous value and wrapping it — forming a chain. The ordering of the `<script>` blocks determines the chain order.

---

## Systems in Detail

### 1. Three.js Scene

Renders `musicbox.glb` into a full-viewport canvas (`#three-canvas`). Camera is fixed at a 30° horizontal offset, aimed at y=0.5. Four-light rig: ambient (warm), key (directional + shadow), fill, rim. Shadow map 1024×1024, PCFSoft.

`CONFIG` at the top of inline block 1 exposes tunable values: camera distance/height, light intensities, drag sensitivity, and wind threshold.

### 2. Animation System

Four named clips expected in the GLB:

| Clip name | Purpose |
|-----------|---------|
| `crank_spin` | Looping crank rotation during playback |
| `idle` | Looping ambient idle motion during playback |
| `open` | One-shot lid opening |
| `close` | One-shot lid closing |

`lid/top/cover` tracks are stripped from `crank_spin` and `idle` at load time so those loops can't fight the open/close clips. A queued-open guard handles the case where `open` is requested while `close` is still mid-play.

### 3. Crank Interaction — **Mouse Only (Touch Not Yet Wired)**

- `mousedown` on a crank mesh starts a drag session and pauses current playback.
- `mousemove` during drag accumulates wind in pixels. Vertical drag (abs value) and leftward horizontal drag both count; the dominant axis wins to avoid double-counting diagonal motion.
- `mouseup` checks accumulated wind against `CONFIG.WINDS_TO_PLAY × CONFIG.DRAG_PX_PER_REV`. If the threshold is met, `window.musicPlayer.play()` fires.
- `mousedown` on a lid mesh toggles the open/close animation.

**There are no `touchstart`, `touchmove`, or `touchend` handlers.** Touch appears to work in browsers that emulate mouse events from touch, but this is incidental and unreliable (no pointer position, no multi-touch guard, no prevention of scroll interference). Explicit touch support needs to be added.

### 4. MIDI Player (script.js)

- Fetches `midilist.json`, populates `<select>` dropdown.
- Fetches `minecraft3.sf2`, stores buffer on `window._sf2Buffer`.
- `AudioContext` created lazily on first user gesture.
- Uses SpessaSynth's `WorkletSynthesizer` and `Sequencer`. `seq.loop = false` — on `seq.isFinished`, auto-advances to next track.
- Starts on a random track at page load.
- Exposes `window.musicPlayer` with `play()`, `pause()`, `next()`, `prev()`, `shuffle()`, `isPlaying()`.

Player UI (`#music-player`) is built entirely in JS and appended to `<body>`: dark frosted-glass panel at bottom-center with track name, transport controls, seek bar, volume slider, track dropdown, and status line.

### 5. Note Particle System

A 2D canvas overlay (`#note-canvas`) drawn on every animation frame. While playing, a note glyph (♩ ♪ ♫ ♬) spawns every ~400ms (25% chance of double-spawn). Each particle drifts upward with horizontal wobble, fades out, and is drawn with a glow shadow. Colors come from a 13-stop rainbow palette, blended 65% toward white so they're not fully saturated.

### 6. Easter Egg Overlay System (current state)

Currently there is one easter egg, defined as a monolithic IIFE in inline block 3. It:
- Listens for `_currentSong === 'i_feel_pretty_1957_-_bernstein'` at `onMusicPlay` time.
- Spins up its own Three.js renderer, scene, and camera inside `#mc-canvas`.
- Builds a Minecraft player from `sweetpea.png` (UV-mapped box geometry per body part) and an Enderman from `enderman.glb` or procedural fallback.
- Runs a state machine: `player → poofing_to_enderman → enderman → poofing_to_player → player`.
- Tears down (hides) on `onMusicPause` or `onMusicEnd`.

---

## Dev Utilities

### `name.py`
Normalizes all filenames in `./midi/` to lowercase/underscores, then writes a sorted `midilist.json`. Run after adding new MIDI files.

```
pip install mido
python name.py
```

### `inst.py`
Scans all MIDI files and prints each file's MIDI program-change instrument count, sorted descending.

```
pip install mido
python inst.py
```

---

## Improvement Plan

---

### Priority 1 — Explicit Touch Support

**Problem:** The crank interaction is wired to `mousedown/mousemove/mouseup` only. Touch works incidentally in browsers that synthesize mouse events from touch, but this is not guaranteed and has known failure modes (scroll hijacking, multi-touch, no cursor feedback).

**What to do:** Refactor the three mouse handlers in inline block 1 into shared `pointerdown/pointermove/pointerup` handlers using the Pointer Events API. This handles mouse, touch, and stylus with one code path.

Key implementation notes:
- Use `canvas.setPointerCapture(e.pointerId)` on pointerdown over the crank so pointermove keeps firing even if the finger leaves the canvas.
- `touch-action: none` on the canvas prevents the browser from intercepting the touch for scrolling.
- Remove cursor logic from the pointermove handler when `e.pointerType === 'touch'` (no cursor on mobile).
- The hitTest function uses `e.clientX/clientY` which Pointer Events provides, so the raycaster logic does not need changes.

---

### Priority 2 — Easter Egg Architecture

**Problem:** The current easter egg is a 900-line IIFE directly in `index.html`. Adding a second egg means another 900-line block. There is no registry, no shared infrastructure, and the trigger logic is a hardcoded string inside the IIFE itself.

**Goal:** Each easter egg is a self-contained JS module file. `index.html` has no easter egg code — it only loads a registry. Adding a new egg means adding one file and one line to a JSON config.

#### Proposed file structure

```
/easter-eggs/
  registry.json          ← list of egg configs, loaded at runtime
  egg-loader.js          ← ES module: fetches registry, imports + mounts each egg
  minecraft/
    index.js             ← the Minecraft egg as an ES module
    sweetpea.png         ← skin asset (can live here or stay at root)
  [future-egg-name]/
    index.js
    [assets...]
```

#### `registry.json` schema

```json
[
  {
    "id": "minecraft",
    "trigger": "i_feel_pretty_1957_-_bernstein",
    "module": "./easter-eggs/minecraft/index.js"
  }
]
```

The `trigger` value is the bare filename without extension, matched against `window._currentSong`.

#### `egg-loader.js` contract

```js
// egg-loader.js (ES module, loaded via <script type="module"> in index.html)
const registry = await fetch('./easter-eggs/registry.json').then(r => r.json());

for (const egg of registry) {
  const mod = await import(egg.module);
  // Each egg module must export: { mount(overlayEl), show(), hide() }
  mod.init({ trigger: egg.trigger });
}
```

#### Egg module contract

Each egg module must export an `init({ trigger })` function that:
1. Creates its own DOM overlay element and appends it to `document.body`.
2. Hooks into `window.onMusicPlay/Pause/End` using the wrap-and-chain pattern already used by the particle system — save the old value, call it after your own logic.
3. Shows itself only when `window._currentSong` matches its `trigger`.
4. Cleans up (hides renderer loop, removes `visible` class) on pause/end.

Each egg is fully self-contained — its own renderer, scene, assets. The loader does not know what the egg renders.

#### Migrating the existing Minecraft egg

1. Copy the body of the current IIFE from `index.html` into `easter-eggs/minecraft/index.js`.
2. Wrap it in `export function init({ trigger }) { ... }` and replace the hardcoded `TRIGGER_SONG` constant with the passed `trigger` argument.
3. Move `sweetpea.png` and `enderman.glb` into `easter-eggs/minecraft/` and update the path constants inside the module.
4. Remove inline block 3 from `index.html`.
5. Add `<script type="module" src="./easter-eggs/egg-loader.js"></script>` to `index.html`.

#### Adding a future egg

1. Create `easter-eggs/[name]/index.js` exporting `init({ trigger })`.
2. Add one entry to `registry.json`.
3. No changes to `index.html` or any other file.

---

### Priority 3 — Module Refactor + GitHub Pages Deployment

**Problem:** `index.html` is ~1500 lines with all logic inline. There is no build step, which is a constraint worth keeping for GitHub Pages simplicity.

**Approach: ES modules with no bundler.** All modern browsers support native ES module imports. The refactor moves code into `.js` files, uses `import`/`export`, and GitHub Pages serves them as static files with zero build step required.

#### Proposed final file structure

```
/
├── index.html                  ← shell only: canvas, loading UI, <script> tags
├── script.js                   ← MIDI player (already a module, no change)
├── midilist.json
├── minecraft3.sf2
├── musicbox.glb
├── background.webp
├── noteblock.png
├── musicbox.webp
├── midi/
├── lib/
│   ├── spessasynth_lib.js
│   ├── spessasynth_core.js
│   └── spessasynth_processor.min.js
└── src/
    ├── scene.js                ← Three.js scene, lighting, model load, resize
    ├── animations.js           ← musicBoxAnimations object, mixer, clip logic
    ├── interaction.js          ← pointer events (crank drag, lid click, hit test)
    ├── particles.js            ← note particle canvas system
    ├── callbacks.js            ← onMusicPlay/Pause/End base implementations
    └── bg-toggle.js            ← background toggle button
└── easter-eggs/
    ├── registry.json
    ├── egg-loader.js
    └── minecraft/
        ├── index.js
        ├── sweetpea.png
        └── enderman.glb
```

Each `src/` file is an ES module. `index.html` loads only:

```html
<script type="importmap">...</script>
<script src="https://cdnjs.cloudflare.com/.../three.min.js"></script>
<script src="https://cdn.../GLTFLoader.js"></script>
<script type="module" src="./src/scene.js"></script>
<script type="module" src="./src/particles.js"></script>
<script type="module" src="./script.js"></script>
<script type="module" src="./easter-eggs/egg-loader.js"></script>
```

Initialization order: `scene.js` sets up the scene and exposes `window.musicBoxAnimations` + registers crank/lid meshes after GLB loads. `script.js` loads the soundfont and exposes `window.musicPlayer`. `particles.js` and `egg-loader.js` hook into the callback chain. This preserves the existing global communication contract while making each piece independently editable.

#### GitHub Pages deployment instructions

GitHub Pages serves any repository's static files directly — no CI, no build step, no configuration file.

**Initial setup (one time):**

1. Push your repository to GitHub (the repo can be public or private if you have GitHub Pro).
2. Go to the repository → **Settings** → **Pages**.
3. Under "Source", select **Deploy from a branch**.
4. Set the branch to `main` (or `master`) and the folder to `/ (root)`.
5. Click **Save**. GitHub will provide the URL: `https://[username].github.io/[repo-name]/`.

**Every subsequent deploy:**

```bash
git add .
git commit -m "your message"
git push
```

GitHub Pages rebuilds and deploys within ~30–60 seconds. No other steps.

**MIME type note:** GitHub Pages correctly serves `.js` files with `Content-Type: application/javascript`, `.json` as `application/json`, `.sf2` as `application/octet-stream`, and `.glb` as `model/gltf-binary`. Native ES module imports will work without any server configuration.

**importmap note:** The importmap in `index.html` must appear before any `<script type="module">` tag. This is already the case and must be preserved in the refactor.

**CORS note:** All assets are same-origin when served from GitHub Pages, so `fetch()` calls for `.sf2`, `.glb`, `.json`, and `.mid` files will succeed without any headers configuration.

**Custom domain (optional):** Add a `CNAME` file to the repo root containing your domain (e.g. `cafe-amalfi.com`), then point your DNS to GitHub's servers per their documentation. GitHub Pages handles HTTPS automatically.

---

### Priority 4 — Easier MIDI File Management

**Problem:** Adding new tracks requires: dropping a file into `midi/`, running `name.py` locally to normalize the filename and regenerate `midilist.json`, then committing both files. This requires Python, a local clone of the repo, and knowledge of the pipeline. There is no validation, no duplicate detection, and no way to add tracks from the GitHub web UI alone.

#### Part A — Automate `midilist.json` regeneration via GitHub Actions

Add a workflow file at `.github/workflows/update-midilist.yml` that triggers whenever files are pushed to or merged into `midi/`. It runs `name.py` inside the CI environment and auto-commits the updated `midilist.json` back to the branch.

```yaml
name: Update midilist.json
on:
  push:
    paths:
      - 'midi/**'
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.x'
      - run: pip install mido
      - run: python name.py
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore: regenerate midilist.json"
          file_pattern: midilist.json
```

With this in place, adding a track via the GitHub web UI (drag-and-drop into the `midi/` folder and commit) is the entire workflow — no local Python required.

#### Part B — Add a MIDI naming guide

Add a `midi/README.md` with the naming convention so contributors know what format to use before uploading:

```
Filename format:  title_year_-_artist.mid
Examples:
  maple_leaf_rag_1899_-_joplin.mid
  georgia_on_my_mind_1930_-_carmichael.mid

Rules:
- Lowercase only
- Spaces → underscores
- No special characters except hyphens and underscores
- name.py will sanitize on commit, but clean names are preferred
```

#### Part C — Duplicate detection in `name.py`

Currently `name.py` skips files if the normalized name already exists but does not warn loudly. Add a duplicate report at the end of the script that prints any filename collisions (same normalized name, different originals) so they can be resolved before the JSON is committed.

#### Part D — Track count and alphabetical sections in the UI (optional)

Once the list grows, the `<select>` dropdown becomes unwieldy. Consider replacing it with a scrollable `<ul>` panel grouped by first letter or decade, with a track count badge in the header. This is a UI-layer change with no impact on the audio pipeline.

---

### Priority 5 — Perceptual Volume Curve

**Problem:** The volume slider in `script.js` passes its raw `0–1` value directly to `synth.setMasterParameter("masterGain", v)`. Human hearing is logarithmic — equal steps in amplitude do not produce equal steps in perceived loudness. This means the top half of the slider sounds like it barely changes, while the bottom half changes dramatically, making it nearly impossible to dial in a comfortable level.

**Root cause:** The slider's `input` event fires a linear `0–1` value. SpessaSynth's `masterGain` parameter is a linear amplitude multiplier. There is no mapping between them.

**What to do:** Add a conversion function in `script.js` that maps the slider's `0–1` position to an amplitude value on an exponential (power) curve before passing it to the synth. The standard approach for a ~60 dB dynamic range uses a 4th-power curve, which closely mirrors perceptual loudness without requiring the `Math.log` overhead:

```js
// sliderValue is 0–1 from the <input type="range">
function sliderToGain(sliderValue) {
  return sliderValue ** 4;
}
```

At slider midpoint (0.5): `0.5⁴ = 0.0625` — about 24 dB below full, which is perceptually "half as loud." At 0.75: `0.75⁴ ≈ 0.316` — about 10 dB below full. This matches how hardware knobs behave.

The inverse (for initializing the slider position from a stored gain value) is:

```js
function gainToSlider(gain) {
  return gain ** (1 / 4);
}
```

**Where to change it:** In `script.js`, the `setVolume` function and the initial slider `value` attribute. The slider's `min/max/step` attributes do not need to change — only the mapping on input and on init.

```js
// Before
function setVolume(v) {
  pendingVolume = v;
  if (synth) synth.setMasterParameter("masterGain", v);
}

// After
function setVolume(sliderVal) {
  const gain = sliderVal ** 4;
  pendingVolume = gain;
  if (synth) synth.setMasterParameter("masterGain", gain);
}
```

Also update the initial `pendingVolume` assignment: the slider starts at `0.8`, so the initial gain should be `0.8⁴ ≈ 0.41` rather than `0.8`. Alternatively, start the slider at `gainToSlider(0.8) ≈ 0.947` so the perceived default volume stays the same.

---

### Priority 6 — iOS Silent Mode / Ringer Switch

**Problem:** On iOS Safari, the Web Audio API (`AudioContext`) respects the hardware ringer/silent switch. When the phone is silenced, `AudioContext` output is muted entirely, even if the user explicitly taps play. This is an Apple OS-level policy: the Web Audio API is categorized as an "ambient" audio source by default, which is silenced by the ringer switch. HTML `<audio>` and `<video>` elements are NOT silenced this way — only `AudioContext`.

**The fix — `navigator.audioSession`:** Apple shipped the `AudioSession` Web API in Safari 16.4 (iOS 16.4+, March 2023). Setting `navigator.audioSession.type = "playback"` tells iOS to treat the page's audio as music/media playback, which routes it through the media volume channel instead of the ringer channel and overrides the silent switch — the same behavior as the Music app or YouTube.

```js
// Add near the top of ensureAudioContext() in script.js, before creating AudioContext
if ('audioSession' in navigator) {
  navigator.audioSession.type = 'playback';
}
```

This one line is the correct, standards-based fix. It is feature-detected with the `'audioSession' in navigator` guard, so it degrades gracefully on Chrome, Firefox, and older Safari with no side effects.

**Browser support as of 2025:** Safari iOS 16.4+ only. Chrome and Firefox do not yet implement this API. For users on older iOS or non-Safari browsers, there is no reliable workaround — the `unmute-ios-audio` library (playing a silent `<audio>` loop) was an older hack that no longer works reliably in current Safari. The `navigator.audioSession` API is the correct long-term solution.

**Implementation location:** `ensureAudioContext()` in `script.js`, before or immediately after `new AudioContext()`. It must be called inside a user-gesture handler, which `ensureAudioContext()` already satisfies (it is called from `togglePlay()`, which is triggered by a click).

**Also add to the player UI:** A small notice in the status line on iOS when the audio context is first created: "If no sound, check volume level" — since you cannot detect the ringer state from JavaScript, a passive hint is the best UX fallback for users on older iOS.

---

### Priority 7 — Song Selection UX + Button Sound Effects

#### Part A — Improve song selection UI

**Problem:** The track selector is a native `<select>` dropdown with 230+ options. On mobile it opens the OS picker, which is fine but loses the custom styling. On desktop it's a small box with no search or filtering. Browsing is impractical.

**What to do:** Replace the `<select>` with a custom panel that supports:

- **Search/filter** — a text `<input>` that filters the visible list in real time by track name. Implemented with a simple `Array.filter()` + re-render on `input` event. No library needed.
- **Grouped display** — tracks grouped by era or genre based on the year embedded in the filename (pre-1920 = ragtime/classical, 1920s–1940s = jazz/swing, 1940s–1970s = standards/broadway, 1970s+ = modern). Groups are collapsible.
- **Now-playing highlight** — the currently playing track is visually highlighted and scrolled into view when the panel opens.

The panel should be toggled by a button rather than always visible, to avoid eating screen space on mobile.

#### Part B — Button sound effects

**What to do:** Play a short UI click/tick sound on interaction with the player controls (play, pause, prev, next, shuffle, track select). On a music box themed app, a mechanical click or a soft piano note is appropriate.

**Implementation approach:**

1. Add a short `click.ogg` or `click.mp3` file to the repo (a single soft piano note or a mechanical tick, <100KB).
2. Create a `playUiSound()` helper in `script.js` that decodes and plays it through the existing `AudioContext`. Do not create a second audio context — reuse the one already managed by `ensureAudioContext()`. Only play the sound if the context already exists (i.e. the user has interacted); do not trigger context creation just for UI sounds.

```js
let uiSoundBuffer = null;

async function loadUiSound() {
  const res = await fetch('./click.ogg');
  const buf = await res.arrayBuffer();
  uiSoundBuffer = await context.decodeAudioData(buf);
}

function playUiSound() {
  if (!context || !uiSoundBuffer) return;
  const src = context.createBufferSource();
  src.buffer = uiSoundBuffer;
  src.connect(context.destination);
  src.start();
}
```

Call `loadUiSound()` after the `AudioContext` is created in `ensureAudioContext()`, then call `playUiSound()` in each button click handler.

---

### Priority 8 — Reduce MIDI Harshness

**Problem:** MIDI playback can sound harsh or piercing, especially on tracks with many simultaneous notes or high-velocity hits. The soundfont is already modified for a music-box timbre, but the issue is likely a combination of: (a) no high-frequency limiting, (b) linear velocity-to-gain mapping in the synth, and (c) no overall dynamic range compression.

**Approaches, from simplest to most involved:**

#### Option A — Web Audio compression node (recommended starting point)

Insert a `DynamicsCompressorNode` between the synthesizer output and the audio destination. This is a single Web Audio API node that applies soft-knee compression, smoothing out peaks:

```js
// In ensureAudioContext(), after synth.connect(context.destination):
const compressor = context.createDynamicsCompressor();
compressor.threshold.value = -18;  // dB — start compressing at -18 dBFS
compressor.knee.value      =  6;   // dB of soft knee
compressor.ratio.value     =  4;   // 4:1 compression ratio
compressor.attack.value    =  0.003; // seconds
compressor.release.value   =  0.25;  // seconds

// Route: synth → compressor → destination
synth.disconnect();
synth.connect(compressor);
compressor.connect(context.destination);
```

Tune `threshold` and `ratio` to taste. Lower threshold or higher ratio = more compression = more consistent loudness but potentially more "pumping."

#### Option B — High-frequency EQ rolloff

Insert a `BiquadFilterNode` set to `lowshelf` or `highshelf` to reduce harshness above ~4 kHz:

```js
const hiShelf = context.createBiquadFilter();
hiShelf.type = 'highshelf';
hiShelf.frequency.value = 4000;  // Hz
hiShelf.gain.value = -6;         // dB cut above 4kHz
synth.connect(hiShelf);
hiShelf.connect(compressor);     // or context.destination
compressor.connect(context.destination);
```

#### Option C — SpessaSynth reverb / chorus settings

SpessaSynth has built-in effects parameters. Check its documentation for `reverbLevel`, `chorusLevel`, and `masterPitchShift`. A small amount of reverb (~10–15%) softens attack transients and adds warmth. Excessive reverb makes the mix muddy — start conservatively.

#### Option D — Velocity scaling in the soundfont (advanced)

The `minecraft3.sf2` file may have velocity layers that produce overly bright tones at high MIDI velocities. This requires editing the soundfont in a tool like Polyphone, adjusting the velocity-to-attenuation curve per instrument. This is the most impactful change but also the most labor-intensive.

**Recommended approach:** Start with Option A (compressor), test across several tracks from the MIDI list spanning different genres and tempos. Adjust the threshold and ratio until peaks feel controlled without sounding squashed. Then layer in Option B if brightness remains an issue.

---

### Priority 9 — Minecraft-Style Note Particles

**Problem:** The current particle system uses custom Unicode music glyphs (♩ ♪ ♫ ♬) with a handcrafted 13-color palette. The Minecraft note particle is visually distinct: it uses a small grayscale sprite texture (a stylized "♩" shape from `particles.png`) that gets tinted to a specific hue determined by the musical pitch of the note being played.

#### How Minecraft's note particle color system works

Minecraft maps pitch to color using a full hue rotation across the spectrum. Each of the 25 possible pitches (0–24 semitones) maps to a hue value:

```
hue = pitch / 24   (a value from 0.0 to 1.0)
```

This value is used as the H channel in HSV color space (H × 360° = degrees on the color wheel), with S = 1.0 and V = 1.0. The resulting fully-saturated color is then multiplied into the grayscale particle sprite texture — the bright white portions of the sprite take the full color, darker portions are tinted less.

The 25 pitches map roughly as:
- Pitch 0 → red (hue 0°)
- Pitch 6 → yellow-green (hue 90°)
- Pitch 12 → cyan (hue 180°)
- Pitch 18 → blue-violet (hue 270°)
- Pitch 24 → back toward red (hue 360° = 0°)

This is a continuous rainbow sweep, not a discrete palette.

#### What to change in the particle system

**Step 1 — Replace the sprite.** Extract the note particle sprite from Minecraft's `assets/minecraft/textures/particle/particles.png`. The note glyph occupies an 8×8 px region in the particle atlas. Export it as a standalone `note-particle.png` and add it to the repo. Since this is a Minecraft texture, check the [Minecraft EULA](https://www.minecraft.net/en-us/eula) — using it in a fan project is generally permitted for non-commercial use but verify before shipping.

Alternatively, draw a clean pixel-art substitute that references the same shape without directly copying.

**Step 2 — Replace the color palette.** In `particles.js`, remove the `PARTICLE_PALETTE` array and `hexToRGB`/`tintedColor` helpers. Replace with an HSV-to-RGB function that takes a pitch index (0–24) and returns a color:

```js
function pitchToColor(pitch) {
  const hue = (pitch / 24) * 360;
  // HSV(hue, 1, 1) → RGB
  const h = hue / 60;
  const i = Math.floor(h);
  const f = h - i;
  const q = 1 - f;
  const t = f;
  const table = [
    [1, t, 0], [q, 1, 0], [0, 1, t],
    [0, q, 1], [t, 0, 1], [1, 0, q]
  ];
  const [r, g, b] = table[i % 6];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
```

**Step 3 — Connect pitch to particles.** Currently, `spawnNote()` picks a random palette color. To use actual pitch data, SpessaSynth's `Sequencer` emits MIDI events as it plays. Check the SpessaSynth documentation for a note-on callback or event emitter — the MIDI note number can be passed to `pitchToColor(note % 25)` (mapping 0–127 MIDI notes to the 0–24 Minecraft pitch range by taking `note % 25` or binning by semitone).

If SpessaSynth does not expose a per-note callback, fall back to using `Math.floor(Math.random() * 25)` as the pitch input — this still produces the correct rainbow spectrum, just without pitch correlation.

**Step 4 — Render using the sprite.** Replace the `ctx.fillText` call with `ctx.drawImage(noteSprite, x, y, size, size)`. To apply the hue tint to the sprite without a shader, use a compositing trick:

```js
// Draw tinted sprite using multiply blend
ctx.save();
ctx.globalCompositeOperation = 'source-over';
ctx.drawImage(noteSprite, x, y, size, size);  // grayscale sprite
ctx.globalCompositeOperation = 'multiply';
ctx.fillStyle = `rgb(${r},${g},${b})`;
ctx.fillRect(x, y, size, size);              // color overlay
ctx.globalCompositeOperation = 'destination-in';
ctx.drawImage(noteSprite, x, y, size, size);  // restore alpha mask
ctx.restore();
```

This three-pass composite correctly tints only the opaque pixels of the sprite.

---

### Priority 10 — User MIDI Upload

**Problem:** Users cannot add their own MIDI files. The track list is fixed at build time via `midilist.json`. There is no UI to load a custom file for one-time playback.

**Approach:** Add a local file picker that loads a MIDI file into the existing `Sequencer` for immediate playback, without uploading the file to any server. The file never leaves the browser.

#### UI placement

Add a small "↑ Upload MIDI" button to the player panel in `script.js`, positioned next to or below the track dropdown. Clicking it triggers a hidden `<input type="file" accept=".mid,.midi">`.

#### Implementation

```js
// In buildUI(), add to panel HTML:
// <button id="mp-upload" title="Play your own MIDI file">↑</button>
// <input id="mp-file" type="file" accept=".mid,.midi" style="display:none">

ui.upload.addEventListener('click', () => ui.file.click());

ui.file.addEventListener('change', async () => {
  const file = ui.file.files[0];
  if (!file) return;

  await ensureAudioContext();

  const arrayBuf = await file.arrayBuffer();
  const song = { binary: arrayBuf, midiName: file.name };

  seq.loadNewSongList([song]);
  songLoaded = true;
  window._currentSong = file.name.replace(/\.midi?$/i, '');

  // Show filename in track name display
  ui.trackName.textContent = '♪  ' + file.name.replace(/\.midi?$/i, '').replace(/[_-]+/g, ' ');

  seq.play();
  playing = true;
  ui.play.innerHTML = '&#9646;&#9646;';
  setStatus('Playing uploaded file');
  if (window.onMusicPlay) window.onMusicPlay();
  startSeekLoop();
});
```

The uploaded file is read entirely in memory via `FileReader` / `arrayBuffer()`. It is passed directly to `seq.loadNewSongList()`, which is the same path used for regular tracks. No server, no persistence — the file is gone on page reload.

#### Edge cases to handle

- **File too large:** MIDI files are typically very small (<1MB), but add a size guard and show an error in the status line if the file exceeds a threshold (e.g. 5MB).
- **Invalid file:** Wrap the `seq.loadNewSongList()` call in a try/catch and show a friendly error in `#mp-status` if SpessaSynth rejects the data.
- **Uploaded track vs. list track:** The track dropdown selection and `current` index should not be updated when an uploaded file plays, so that prev/next still navigates the permanent list. The uploaded file is a transient one-shot overlay, not a list entry.
- **Easter egg trigger:** An uploaded MIDI named `i_feel_pretty_1957_-_bernstein.mid` would technically trigger the Minecraft overlay since it matches `_currentSong`. This is harmless but amusing; document it as a feature.

---

### Additional Improvements (lower priority)

- **Vendor Three.js** — copy `three.min.js` and `GLTFLoader.js` into `lib/` instead of loading from CDN. Eliminates external dependency and ensures the site works if cdnjs/jsDelivr are unavailable.
- **Loading progress** — the soundfont can be several MB. Add a byte-progress bar using `response.body` streaming or `Content-Length` + `ReadableStream`.
- **Persist background toggle** — store the BG preference in `localStorage` and restore on load.
- **Keyboard shortcuts** — spacebar for play/pause, left/right arrows for prev/next track.
- **`midilist.json` automation** — superseded by Priority 4A GitHub Action.
