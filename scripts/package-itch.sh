#!/usr/bin/env bash
# Phase 15: zip the static site for itch.io upload. No build step — this
# just archives index.html and src/ (the m3x6 font included) as-is.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="dist/pixi.zip"
mkdir -p dist
rm -f "$OUT"
zip -r "$OUT" index.html src -x '*.DS_Store'

echo "Wrote $OUT — upload directly as an itch.io HTML game (index.html at the zip root)."
