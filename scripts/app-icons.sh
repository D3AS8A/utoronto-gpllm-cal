#!/usr/bin/env bash
#
# Pad apple/android app icons over a solid bg
# scripts/app-icons.sh <#color> <padding%>

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <bg-color> <padding-percent>" >&2
  exit 1
fi

bg="$1"
pad="$2"
scale=$(awk "BEGIN{printf \"%g\", 100 - 2*$pad}")

dir="$(cd "$(dirname "$0")/.." && pwd)/public/favicon"

find -E "$dir" -maxdepth 1 -type f -iregex '.*/a[pn][pd][lr][eo]i?d?-icon.+' -print0 |
  while IFS= read -r -d '' f; do
    size=$(identify -format "%wx%h" "$f")
    magick "$f" -resize "${scale}%" -background "$bg" -gravity center -extent "$size" "$f.tmp"
    mv "$f.tmp" "$f"
    printf '%s (%s, scale %s%%)\n' "$(basename "$f")" "$size" "$scale"
  done
