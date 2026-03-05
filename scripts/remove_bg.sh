#!/bin/bash
# remove_bg.sh — Remove background from character GIFs using FFmpeg + rembg
#
# Usage:
#   cd <project-root>
#   bash scripts/remove_bg.sh
#
# Prerequisites:
#   brew install ffmpeg
#   pip install rembg          (first run downloads ~170 MB AI model)
#
# Output:
#   Each  assets/characters/man-young.gif   → man-young_nobg.gif  (same folder)
#   Review the _nobg files, then run:  bash scripts/apply_nobg.sh  to replace originals.
#
# ⚠️  GIF limitation: GIF only supports 1-bit transparency (fully on or off).
#     rembg produces smooth alpha edges; this script uses alpha_threshold=128
#     to convert them. Edges will be clean but hard (no feathering).
#     If you need soft edges, switch to APNG format instead.

set -e

CHARS_DIR="assets/characters"

# ── Dependency check ──────────────────────────────────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
  echo "ERROR: ffmpeg not found. Install with:  brew install ffmpeg"
  exit 1
fi
if ! command -v rembg &>/dev/null; then
  echo "ERROR: rembg not found. Install with:  pip install rembg"
  exit 1
fi

# ── Process one GIF ──────────────────────────────────────────────────────────
process_gif() {
  local input="$1"
  local name
  name=$(basename "$input" .gif)
  local tmp="/tmp/rembg_${name}"
  local output="${CHARS_DIR}/${name}_nobg.gif"

  echo ""
  echo "▶  Processing: ${name}.gif"

  # Clean temp workspace
  rm -rf "$tmp"
  mkdir -p "$tmp/frames" "$tmp/out"

  # 1. Detect original frame rate (GIFs often store as fraction e.g. 25/1)
  local fps_raw
  fps_raw=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=avg_frame_rate \
    -of default=noprint_wrappers=1:nokey=1 "$input" 2>/dev/null || echo "10/1")
  # Fallback: if fps_raw is 0/0 or empty, default to 10fps
  if [[ "$fps_raw" == "0/0" || -z "$fps_raw" ]]; then fps_raw="10/1"; fi
  echo "   Frame rate: ${fps_raw} fps"

  # 2. Extract frames as PNG
  ffmpeg -i "$input" "$tmp/frames/frame_%04d.png" -y -loglevel error
  local frame_count
  frame_count=$(ls "$tmp/frames/" | wc -l | tr -d ' ')
  echo "   Extracted:  ${frame_count} frames"

  # 3. Remove background from each frame with rembg
  echo "   Removing backgrounds (this may take a minute)..."
  for f in "$tmp/frames"/frame_*.png; do
    fname=$(basename "$f")
    rembg i "$f" "$tmp/out/$fname" 2>/dev/null
  done
  echo "   Background removal complete"

  # 4. Rebuild GIF with transparency
  #    palettegen=reserve_transparent=1  → reserves a palette slot for transparency
  #    paletteuse=alpha_threshold=128    → pixels with alpha < 128 become transparent
  echo "   Rebuilding GIF with transparency..."
  ffmpeg -framerate "$fps_raw" \
    -i "$tmp/out/frame_%04d.png" \
    -filter_complex "split[s0][s1];[s0]palettegen=reserve_transparent=1[p];[s1][p]paletteuse=alpha_threshold=128:dither=bayer:bayer_scale=3" \
    "$output" -y -loglevel error

  # 5. Cleanup temp files
  rm -rf "$tmp"

  local size
  size=$(du -sh "$output" | cut -f1)
  echo "   Done → ${name}_nobg.gif  (${size})"
}

# ── Run on all 6 character GIFs ───────────────────────────────────────────────
echo "Starting background removal for all character GIFs..."
echo "Note: first run downloads the AI model (~170 MB) — subsequent runs are fast."

for gif in "$CHARS_DIR"/man-young.gif \
           "$CHARS_DIR"/man-mid.gif \
           "$CHARS_DIR"/man-senior.gif \
           "$CHARS_DIR"/woman-young.gif \
           "$CHARS_DIR"/woman-mid.gif \
           "$CHARS_DIR"/woman-senior.gif; do
  if [[ -f "$gif" ]]; then
    process_gif "$gif"
  else
    echo "WARNING: Not found — $gif (skipping)"
  fi
done

echo ""
echo "═══════════════════════════════════════════════════"
echo "All done! Review the _nobg.gif files in assets/characters/"
echo "If they look good, run:  bash scripts/apply_nobg.sh"
echo "═══════════════════════════════════════════════════"
