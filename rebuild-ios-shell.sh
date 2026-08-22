#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  rebuild-ios-shell.sh
#
#  Does the full local rebuild described in
#  noteblock-pianola-ios-shell/README.md, end to end:
#    1. bun install + bun run build          (repo root -> ./dist)
#    2. wipe + restage noteblock-pianola-ios-shell/web/  (clean, so a
#       stale/self-nested previous staging can't linger)
#    3. sanity-check the staged folder (dist/main.js present, no
#       self-nested ios-shell/ copy) — fails loudly instead of
#       producing a silently-broken app
#    4. xcodegen generate
#    5. optionally build for the simulator (xcodebuild), if -b/--build
#       is passed, so you can catch build errors here instead of in Xcode
#
#  Run from the repo root:
#    bash rebuild-ios-shell.sh          # stage + regenerate project only
#    bash rebuild-ios-shell.sh --build  # also do a simulator build
#    bash rebuild-ios-shell.sh --open   # also open the .xcodeproj when done
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

DO_BUILD=0
DO_OPEN=0
for arg in "$@"; do
  case "$arg" in
    -b|--build) DO_BUILD=1 ;;
    -o|--open)  DO_OPEN=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg (use --build and/or --open)" >&2
      exit 1
      ;;
  esac
done

SHELL_DIR="noteblock-pianola-ios-shell"
WEB_DIR="$SHELL_DIR/web"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ── Preflight ──────────────────────────────────────────────────
[ -f package.json ] && [ -d "$SHELL_DIR" ] || \
  die "Run this from the repo root (package.json and $SHELL_DIR/ not found here)."
command -v bun >/dev/null      || die "bun not found. Install: https://bun.sh"
command -v rsync >/dev/null    || die "rsync not found."
command -v xcodegen >/dev/null || die "xcodegen not found. Install: brew install xcodegen"

# ── 1. Build the web app ──────────────────────────────────────
log "bun install"
bun install

log "bun run build"
rm -rf dist
bun run build
[ -f dist/main.js ] || die "bun run build did not produce dist/main.js — check the build output above."

# ── 2. Stage into the shell (clean slate every time) ──────────
log "Restaging $WEB_DIR"
rm -rf "$WEB_DIR"
mkdir -p "$WEB_DIR"
rsync -a --exclude node_modules --exclude .git --exclude 'song/' \
  --exclude "$SHELL_DIR/" \
  --exclude 'src/' --exclude 'tools/' --exclude 'scripts/' \
  --exclude '.github/' --exclude 'bun.lock' --exclude 'package.json' \
  --exclude 'make-claude-upload.sh' --exclude 'claude-upload.zip' \
  --exclude 'ios-app-plan.md' --exclude 'noteblock-docs.md' \
  --exclude 'EXCLUDED_FROM_THIS_ZIP.md' --exclude '.gitignore' \
  --exclude '.DS_Store' --exclude 'README.md' --exclude 'NOTICE' \
  --exclude 'LICENSE*' --exclude 'repomix-output.xml' \
  ./ "$WEB_DIR/"

# ── 3. Sanity-check the staged output ─────────────────────────
log "Verifying staged $WEB_DIR"

[ -f "$WEB_DIR/index.html" ] || die "$WEB_DIR/index.html is missing after staging."
[ -f "$WEB_DIR/dist/main.js" ] || die "$WEB_DIR/dist/main.js is missing — app will hang on the loading spinner under file://."

if [ -d "$WEB_DIR/$SHELL_DIR" ]; then
  die "$WEB_DIR/$SHELL_DIR/ exists — the shell got staged into its own web/ folder. This script excludes it, so if you're seeing this, something upstream (a leftover directory?) is wrong. Re-run after 'rm -rf $WEB_DIR'."
fi

SIZE=$(du -sh "$WEB_DIR" | cut -f1)
echo "  ✓ index.html present"
echo "  ✓ dist/main.js present"
echo "  ✓ no self-nested $SHELL_DIR/ copy"
echo "  Staged size: $SIZE"

# ── 4. Regenerate the Xcode project ────────────────────────────
log "xcodegen generate"
( cd "$SHELL_DIR" && xcodegen generate )

# ── 5. Optional: build for the simulator ───────────────────────
if [ "$DO_BUILD" -eq 1 ]; then
  log "xcodebuild (simulator, unsigned)"
  ( cd "$SHELL_DIR" && \
    xcodebuild -project NoteblockPianola.xcodeproj -scheme NoteblockPianola \
      -destination 'platform=iOS Simulator,name=iPhone 15' \
      CODE_SIGNING_ALLOWED=NO build )
fi

if [ "$DO_OPEN" -eq 1 ]; then
  log "Opening Xcode"
  open "$SHELL_DIR/NoteblockPianola.xcodeproj"
fi

log "Done."
