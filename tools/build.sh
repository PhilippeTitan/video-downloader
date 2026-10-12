#!/usr/bin/env bash
# Build the web UI, embed it in the Theos app bundle, produce a sideloadable .ipa.
# Works on macOS (local Theos) and the GitHub Actions macOS runner.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export THEOS="${THEOS:-$HOME/theos}"

echo "==> [1/4] web build"
cd "$ROOT"
# npm install, not ci: the lockfile (generated on Windows) has no entries for
# the platform-specific optional bindings (rolldown's darwin-arm64 native
# module); npm install reconciles those for the current runner OS.
npm install --no-audit --no-fund
# ...and npm (even install) trusts the lock's package map, so the foreign
# platform binding never appears on a macOS runner — add it explicitly,
# version-matched to the installed rolldown (vite 8's bundler).
RVERSION="$(node -p "require('$ROOT/web/node_modules/rolldown/package.json').version")"
npm install --no-save --no-audit --no-fund "@rolldown/binding-darwin-arm64@$RVERSION"
npm run build
node "$ROOT/tools/inline.cjs"

echo "==> [2/4] embed web bundle into ios/www"
mkdir -p "$ROOT/ios/www"
cp -R "$ROOT/web/dist/." "$ROOT/ios/www/"

echo "==> [3/4] theos compile"
cd "$ROOT/ios"
make clean || true
make FINALPACKAGE=1

echo "==> [4/4] locate artifact"
APP="$(find "$ROOT/ios/.theos/obj" -maxdepth 3 -name 'VideoDownloader.app' -type d | head -n 1)"
if [ -z "$APP" ]; then
  echo "error: VideoDownloader.app not found under .theos/obj" >&2
  exit 1
fi

cp "$ROOT/ios/Info.plist" "$APP/Info.plist"
if [ ! -f "$APP/Info.plist" ]; then
  echo "error: Info.plist missing from app bundle" >&2
  exit 1
fi

STAGE="$ROOT/ios/packages/ipa-stage"
rm -rf "$STAGE"
mkdir -p "$STAGE/Payload"
cp -R "$APP" "$STAGE/Payload/"
cd "$STAGE"
zip -qry "$ROOT/ios/packages/VideoDownloader.ipa" Payload
echo "==> done: ios/packages/VideoDownloader.ipa"
