#!/bin/bash
# apply_nobg.sh — Replace original GIFs with the background-removed versions
#
# Run this ONLY after reviewing the _nobg.gif files produced by remove_bg.sh
#
# Usage:
#   bash scripts/apply_nobg.sh

set -e

CHARS_DIR="assets/characters"

echo "Replacing originals with background-removed GIFs..."

for nobg in "$CHARS_DIR"/*_nobg.gif; do
  [[ -f "$nobg" ]] || continue
  original="${nobg/_nobg/}"
  mv "$nobg" "$original"
  echo "  Replaced: $(basename "$original")"
done

echo ""
echo "Done. Original GIFs replaced. Restart Expo to see the changes."
