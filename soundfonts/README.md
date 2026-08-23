# soundfonts/

Every `.sf2` file the player can switch between at runtime lives here,
listed in `manifest.json`.

## Adding a new soundfont

**Option A — automatic:**
1. Drop the `.sf2` file in this folder.
2. Run `npm run manifest:soundfonts` (or `node tools/generate-soundfont-manifest.js`).
   It scans this folder and appends any new file to `manifest.json`
   with an auto-derived `id`/`label`, leaving existing entries
   untouched. Open `manifest.json` afterward and tidy up the
   auto-generated label if you want something nicer than what it
   guessed from the filename.
   - `node tools/generate-soundfont-manifest.js --check` exits
     non-zero if the manifest is out of date without writing
     anything — handy in CI to catch a `.sf2` that got added without
     regenerating the manifest.
   - `node tools/generate-soundfont-manifest.js --prune` also removes
     entries whose file no longer exists in this folder (off by
     default, since deleting an entry out from under a saved id could
     silently break a returning visitor's choice).

**Option B — manual:**
1. Drop the `.sf2` file in this folder.
2. Add an entry to `manifest.json`:
   ```json
   { "id": "unique-id", "label": "Shown in the menu", "file": "your-file.sf2" }
   ```
   - `id` — stable identifier, used to remember the user's choice
     (`localStorage`) and in the `?sf=` deep-link param. Don't reuse an
     `id` for a different bank later — existing visitors' saved choice
     would silently point at new audio.
   - `label` — what shows up in the 🎼 menu.
   - `file` — filename relative to this folder.
3. That's it — `script.js` fetches `manifest.json` at load and builds
   the menu from it, no other code changes needed.

## Notes

- The first entry in `manifest.json` is the default for first-time
  visitors (and the fallback if a saved/linked id no longer exists).
- Switching soundfonts mid-session swaps the active bank in the
  running `AudioContext` (via `soundBankManager`) — no reload needed,
  and the currently loaded MIDI keeps playing with the new bank.
- The user's last pick is remembered via `localStorage` and restored
  on their next visit.
- Keep files reasonably sized — they're fetched over the network on
  first use (and cached by the browser afterwards).
