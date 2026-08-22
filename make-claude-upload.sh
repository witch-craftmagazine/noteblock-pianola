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
  --exclude 'noteblock-pianola-ios-shell/web' \
  --exclude 'claude-upload.zip'

# `dist/` and `noteblock-pianola-ios-shell/web/` are excluded above (build
# output + staged copy — minified/binary, not useful as text context, and
# `web/` can be huge or even self-nested if the staging rsync was run from
# the wrong directory). But whether they *exist*, what's *in* them, and
# how big they are has repeatedly been the actual bug (missing dist/main.js,
# an ios-shell staged into its own web/). So capture that as a cheap text
# manifest instead of the bytes themselves: presence/absence/size, no
# content. This is what a debugging pass actually needs.
{
  echo "# Staged build-output structure"
  echo
  echo "Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) by make-claude-upload.sh."
  echo "Full contents of these directories are excluded from this zip (see"
  echo "EXCLUDED_FROM_THIS_ZIP.md) — this is a listing only, for diagnosing"
  echo "missing/stale/duplicated build output without bloating the upload."
  echo

  echo "## dist/ (repo root — \`bun run build\` output)"
  echo '```'
  if [ -d dist ]; then
    find dist -maxdepth 3 -exec du -ah {} + | sort -k2
  else
    echo "(missing — bun run build has not been run)"
  fi
  echo '```'
  echo

  echo "## noteblock-pianola-ios-shell/web/ (staged copy for the Xcode build)"
  echo '```'
  if [ -d noteblock-pianola-ios-shell/web ]; then
    # Depth-capped: a self-nested staging run (web/ rsync'd into itself)
    # would otherwise make this listing—and the recursive du—explode.
    find noteblock-pianola-ios-shell/web -maxdepth 4 | sort
    echo
    echo "Total size: $(du -sh noteblock-pianola-ios-shell/web | cut -f1)"
    if [ -d noteblock-pianola-ios-shell/web/noteblock-pianola-ios-shell ]; then
      echo
      echo "⚠ self-nested: web/noteblock-pianola-ios-shell/ exists — the"
      echo "  staging rsync was likely run from inside noteblock-pianola-ios-shell/"
      echo "  instead of the repo root. See README.md's staging step."
    fi
    if [ ! -e noteblock-pianola-ios-shell/web/dist/main.js ]; then
      echo
      echo "⚠ noteblock-pianola-ios-shell/web/dist/main.js is missing — the"
      echo "  app will hang on the in-page loading spinner under file://."
      echo "  Run bun run build BEFORE staging, and re-stage."
    fi
  else
    echo "(missing — the iOS shell staging step has not been run)"
  fi
  echo '```'
} > "$STAGE/STAGED_STRUCTURE.md"

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
- `dist/` and `noteblock-pianola-ios-shell/web/` — build output and the
  staged copy for the Xcode build (regenerate via `bun run build` and the
  staging step in `noteblock-pianola-ios-shell/README.md`). Full contents
  aren't included, but `STAGED_STRUCTURE.md` at the root of this zip lists
  what's in them (or flags that they're missing) without the bytes.
- `node_modules/`
- Binary assets: `*.glb`, `*.sf2`, `*.webp`, `*.png`, `*.mp3`, `*.ogg`
- `lib/spessasynth_processor.min.js` (minified, not meant to be read;
  `lib/spessasynth_core.js` and `lib/spessasynth_lib.js` ARE included)
EOF

( cd "$STAGE" && zip -rq -X "$OLDPWD/$OUT" . )

SIZE=$(du -h "$OUT" | cut -f1)
echo "✓ Wrote $OUT ($SIZE)"
