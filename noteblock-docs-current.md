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

### Additional Improvements (lower priority)

- **Vendor Three.js** — copy `three.min.js` and `GLTFLoader.js` into `lib/` instead of loading from CDN. Eliminates external dependency and ensures the site works if cdnjs/jsDelivr are unavailable.
- **Loading progress** — the soundfont can be several MB. Add a byte-progress bar using `response.body` streaming or `Content-Length` + `ReadableStream`.
- **Persist background toggle** — store the BG preference in `localStorage` and restore on load.
- **Keyboard shortcuts** — spacebar for play/pause, left/right arrows for prev/next track.
- **`midilist.json` automation** — add a GitHub Action that runs `name.py` automatically whenever files are added to `midi/` via a pull request, regenerating `midilist.json` as part of the commit.
