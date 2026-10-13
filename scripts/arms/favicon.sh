#!/usr/bin/env bash
# Builds favicons from src/assets/arms/arms-footer.png: the crest eagle's head on a Johns red rounded square.
# Needs ImageMagick 7 (magick) on PATH.
# Run: bash scripts/arms/favicon.sh
# Outputs: public/favicon.ico (16/32/48), public/favicon-32.png, public/apple-touch-icon.png
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC=src/assets/arms/arms-footer.png
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
RED='#a3162b'
ROUND=(-draw 'roundrectangle 0,0 159,159 30,30')

# Eagle head: top of the centre column of the trimmed arms, cropped above the crown
magick "$SRC" -trim +repage -gravity north -crop 40%x100%+0+0 +repage \
  -gravity northwest -crop 122x96+136+0 +repage "$TMP/head.png"

# 160px master: red rounded square, head anchored to the bottom edge, corners masked
magick -size 160x160 xc:none -fill "$RED" "${ROUND[@]}" \
  \( "$TMP/head.png" -resize 156x \) -gravity south -geometry +6+0 -composite \
  \( -size 160x160 xc:none -fill white "${ROUND[@]}" \) -compose DstIn -composite \
  "$TMP/icon.png"

magick "$TMP/icon.png" -define icon:auto-resize=48,32,16 public/favicon.ico
magick "$TMP/icon.png" -resize 32x32 public/favicon-32.png
# iOS renders transparency as black and rounds corners itself, so the touch icon is a full red square
magick -size 180x180 xc:"$RED" \( "$TMP/head.png" -resize 176x \) -gravity south -geometry +7+0 -composite \
  public/apple-touch-icon.png
