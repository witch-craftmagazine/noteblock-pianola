#!/bin/bash
# scripts/sync-web.sh
#
# Builds the web app and stages it into noteblock-pianola-ios-shell/web/.
# Runs as an Xcode preBuildScripts phase (see project.yml) on every build,
# so it must be idempotent and safe to run repeatedly from $SRCROOT.
#
# Mirrors README.md's "Build locally" steps 1-2 and the staging step in
# .github/workflows/ios-build.yml — keep the --exclude list in sync with
# both if it changes.

set -euo pipefail

# Xcode build phases run with a minimal PATH (roughly /usr/bin:/bin:
# /usr/sbin:/sbin) that doesn't include Homebrew's bin dirs, even though
# an interactive shell finds `bun`/`xcodegen` fine via ~/.zshrc etc.
# Prepend both Apple Silicon and Intel Homebrew locations so this works
# on either Mac without requiring per-machine Xcode scheme env tweaks.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$PATH"

# $SRCROOT is noteblock-pianola-ios-shell/; the web app lives one level up.
REPO_ROOT="$(cd "$SRCROOT/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun not found on PATH (checked /opt/homebrew/bin," >&2
  echo "/usr/local/bin, ~/.bun/bin, and the default Xcode PATH)." >&2
  echo "Install it: https://bun.sh" >&2
  exit 1
fi

bun install
bun run build

mkdir -p noteblock-pianola-ios-shell/web
rsync -a --delete --exclude node_modules --exclude .git --exclude 'song/' \
  --exclude 'noteblock-pianola-ios-shell/' \
  --exclude 'src/' --exclude 'tools/' --exclude 'scripts/' \
  --exclude '.github/' --exclude 'bun.lock' --exclude 'package.json' \
  --exclude 'make-claude-upload.sh' --exclude 'claude-upload.zip' \
  --exclude 'ios-app-plan.md' --exclude 'noteblock-docs.md' \
  --exclude 'EXCLUDED_FROM_THIS_ZIP.md' --exclude '.gitignore' \
  --exclude '.DS_Store' --exclude 'README.md' --exclude 'NOTICE' \
  --exclude 'LICENSE*' \
  ./ noteblock-pianola-ios-shell/web/
