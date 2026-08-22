#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  make-claude-upload.sh
#
#  Zips the parts of this repo worth uploading to Claude for code
#  review/help, leaving out the bulk that adds tokens without adding
#  context: the MIDI library, the ~278 generated share pages, vendored
#  third-party libs, binary 3D/audio/image assets, and anything
#  git/CI doesn't need to see reviewed.
#
#  Run from the repo root:
#    bash scripts/make-claude-upload.sh
#
#  Produces ./claude-upload.zip next to this script's invocation dir
#  (i.e. the repo root).
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

OUT="claude-upload.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

if [ ! -f package.json ]; then
  echo "Run this from the repo root (package.json not found here)." >&2
  exit 1
fi

rm -f "$OUT"

# rsync in everything, then prune. Easier to read/maintain than a long
# `zip -x` exclude list, and rsync's --exclude semantics are less
# surprising than zip's.
rsync -a . "$STAGE"/ \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'midi' \
  --exclude 'song' \
  --exclude '*.glb' \
  --exclude '*.sf2' \
  --exclude '*.webp' \
  --exclude '*.png' \
  --exclude '*.mp3' \
  --exclude '*.ogg' \
  --exclude 'lib/spessasynth_processor.min.js' \
  --exclude 'claude-upload.zip'

# Vendored libs are large and rarely what needs review; keep a note of
# what's excluded instead of the bytes themselves so Claude knows they
# exist without spending tokens reading minified/generated code.
cat > "$STAGE/EXCLUDED_FROM_THIS_ZIP.md" <<'EOF'
# Excluded from this upload

To keep the upload small, the following were left out. Ask for any of
these specifically if you need them read:

- `midi/` — ~278 source .mid files (binary, not useful as text context)
- `song/` — ~278 generated share pages (regenerate via
  `node tools/generate-share-pages.js`; don't hand-edit these anyway)
- `dist/` — build output (regenerate via `bun run build`)
- `node_modules/`
- Binary assets: `*.glb`, `*.sf2`, `*.webp`, `*.png`, `*.mp3`, `*.ogg`
- `lib/spessasynth_processor.min.js` (minified, not meant to be read;
  `lib/spessasynth_core.js` and `lib/spessasynth_lib.js` ARE included)
EOF

( cd "$STAGE" && zip -rq -X "$OLDPWD/$OUT" . )

SIZE=$(du -h "$OUT" | cut -f1)
echo "✓ Wrote $OUT ($SIZE)"
