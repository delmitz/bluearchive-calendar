#!/bin/sh
# Replace the ?v=... query on asset URLs in index.html with the current time,
# so browsers fetch fresh CSS/JS after a deploy (GitHub Pages caches files).
# Run this before committing changes to styles.css or js/.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(date +%Y%m%d%H%M%S)"
sed -i '' -E "s/\?v=[0-9A-Za-z]+\"/?v=$VERSION\"/g" "$ROOT/index.html"
echo "Asset version set to $VERSION"
grep -n "?v=" "$ROOT/index.html"
