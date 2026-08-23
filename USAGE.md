# Usage & Build Guide

This covers the day-to-day workflow: adding songs, adding soundfonts, building
the JS bundle, and running the app locally. For architecture/system details,
see `noteblock-docs.md`.

## Prerequisites

- **Bun** — bundles `src/musicbox/` into `dist/main.js`. Install from
  https://bun.sh if you don't have it.
- **Node.js** — runs the `tools/*.js` scripts (`sync.js`,
  `rebuild-midilist.js`, `generate-share-pages.js`, `analyze-loudness.js`,
  `generate-soundfont-manifest.js`).
- **Python 3 + `mido`** — runs `scripts/name.py` / `scripts/inst.py`.
  ```bash
  pip install mido
  ```

Install JS dependencies once, from the repo root:

```bash
bun install
```

---

## Adding a new song

1. **Drop the MIDI file into `midi/`.**
   ```bash
   cp my_song.mid midi/
   ```

2. **Normalize the filename.**
   `scripts/name.py` lowercases the name, replaces spaces with underscores,
   strips unsafe characters (Unicode-aware — non-Latin scripts are kept),
   detects filename collisions, and rewrites `midilist.json`.
   ```bash
   python scripts/name.py
   ```
   Exits non-zero if a collision is detected — resolve it (rename/remove one
   of the conflicting files) and re-run before continuing.

3. **Run the sync pipeline.**
   `tools/sync.js` chains together the rest of the add-a-song steps:
   - `rebuild-midilist.js` — rescans `midi/*.mid`, rewrites `midilist.json`
   - `generate-share-pages.js` — regenerates `song/<slug>/index.html` OG
     preview pages
   - `analyze-loudness.js` — measures loudness and updates
     `volumeAdjustments.json` (incremental: only analyzes new tracks)
   ```bash
   node tools/sync.js            # incremental — fast, only new tracks
   node tools/sync.js --full     # also re-analyzes every track's loudness
   ```
   Run `--full` occasionally (not on every single add) since it's slower.
   `analyze-loudness.js` requires `soundfonts/minecraft3.sf2` to be present
   locally — it's not committed to the repo (too large).

4. **Commit and push.**
   ```bash
   git add midi/ midilist.json song/ volumeAdjustments.json
   git commit -m "Add: my_song"
   git push
   ```
   CI (`update-midilist.yml`) re-runs name normalization and share-page
   generation on push as a safety net, in case step 2/3 were skipped locally.

---

## Adding a new soundfont

1. Drop the `.sf2` file into `soundfonts/`.
2. Regenerate the manifest:
   ```bash
   node tools/generate-soundfont-manifest.js
   ```
   Existing entries (id/label/order) are preserved; new files on disk are
   appended with an auto-derived id/label (edit `soundfonts/manifest.json`
   afterward for nicer labels if you want).
   - `--check` — exit 1 if the manifest is stale, without writing (useful in
     CI, doesn't modify anything)
   - `--prune` — also remove manifest entries whose file no longer exists on
     disk (off by default — a missing file is only warned about, not deleted,
     so a returning visitor's saved choice isn't silently broken)
3. Commit `soundfonts/<file>.sf2` and the updated `soundfonts/manifest.json`.

---

## Building the JS bundle

The interactive scene (`scene.js`), note particles (`particles.js`),
background toggle (`bg-toggle.js`), and soundfont switcher
(`soundfont-toggle.js`) live under `src/musicbox/` as ES modules and are
bundled into `dist/main.js`, which `index.html` loads:

```bash
bun run build
```

This runs:
```
bun build ./src/musicbox/main.js --outdir ./dist --minify --sourcemap=linked
```

**`dist/` is a build artifact, not checked into the repo.** You must run
`bun run build` before serving the app locally — otherwise `index.html`
requests `./dist/main.js`, gets a 404, and everything wired up in
`src/musicbox/` (the crank/lid 3D scene, note particles, BG toggle, and the
SF/soundfont toggle button) silently fails to load, since a missing
`<script type="module">` doesn't throw a visible page error.

---

## Running locally

```bash
bun install
bun run build
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Alternatively, use the built-in dev server instead of Python's:
```bash
bun run dev     # bunx serve . -l 8080
```

Either way, `bun run build` must be run first (and re-run after any change
under `src/musicbox/`) — the dev server just serves static files, it doesn't
rebuild the bundle for you.

---

## Quick reference

| Task | Command |
|---|---|
| Install JS deps | `bun install` |
| Normalize new MIDI filenames | `python scripts/name.py` |
| Full add-a-song pipeline | `node tools/sync.js [--full]` |
| Rebuild `midilist.json` only | `node tools/rebuild-midilist.js` |
| Regenerate song share pages only | `node tools/generate-share-pages.js` |
| Re-analyze track loudness only | `node tools/analyze-loudness.js [--full]` |
| Update soundfont manifest | `node tools/generate-soundfont-manifest.js [--check] [--prune]` |
| Report per-file instrument counts | `python scripts/inst.py` |
| **Build the JS bundle (`dist/main.js`)** | `bun run build` |
| Serve locally (after building) | `python3 -m http.server 8000` or `bun run dev` |
