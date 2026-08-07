#!/usr/bin/env bash
#
# Check whether the local index.html matches what is actually being served.
#
# Run this BEFORE editing the design and AFTER deploying. A mismatch before you
# start means your local copy is stale and edits would clobber the live design.
#
#   ./scripts/verify-live.sh

set -euo pipefail

cd "$(dirname "$0")/.."

LIVE_URL="${LIVE_URL:-https://dotbion.github.io/}"
REPO="${REPO:-DotBion/dotbion.github.io}"

if command -v shasum >/dev/null 2>&1; then
  hash_cmd() { shasum -a 256 | cut -d' ' -f1; }
else
  hash_cmd() { sha256sum | cut -d' ' -f1; }
fi

live=$(curl -fsS "$LIVE_URL" | hash_cmd)
local_copy=$(hash_cmd < index.html)
origin_main=$(git show origin/main:index.html 2>/dev/null | hash_cmd || echo "n/a")

echo "live ($LIVE_URL)  ${live}"
echo "local index.html          ${local_copy}"
echo "origin/main               ${origin_main}"
echo

if [ "$live" = "$local_copy" ]; then
  echo "MATCH — local index.html is exactly what is being served."
  exit 0
fi

echo "DIFFERENT — local index.html does not match the live site."
echo

if grep -qF '<!-- BEGIN portfolio-addons -->' index.html; then
  echo "Local has the add-on block injected, so a difference is expected until"
  echo "you deploy. To compare just the design, hash a copy with the block removed:"
  echo
  echo "  perl -0pe 's/<!-- BEGIN portfolio-addons -->.*?<!-- END portfolio-addons -->\\n?//s' \\"
  echo "    index.html | shasum -a 256"
  echo
fi

if command -v gh >/dev/null 2>&1; then
  echo "Last Pages deployment:"
  gh api "repos/${REPO}/pages/builds/latest" \
    --jq '"  commit \(.commit[0:7])  \(.status)  \(.created_at)"' 2>/dev/null \
    || echo "  (could not query the Pages API)"
  echo "  origin/main is at $(git rev-parse --short origin/main)"
fi

exit 1
