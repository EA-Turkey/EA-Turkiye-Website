#!/bin/zsh

set -euo pipefail

ROOT_DIR="${0:A:h:h}"
cd "$ROOT_DIR"

mkdir -p static/avif

for src in assets/images/**/*.(jpg|jpeg)(N); do
  rel=${src#assets/images/}
  base=${rel%.*}
  mkdir -p "static/avif/${base:h}"

  for width in 320 480 520 560 600 640 768 800 960 1280 1440 1600; do
    out="static/avif/${base}-${width}.avif"
    tmp="${out}.tmp.avif"
    magick "$src" -resize "${width}x" -quality 55 "$tmp"
    if [[ ! -s "$tmp" ]]; then
      rm -f "$tmp"
      echo "empty output for ${out}" >&2
      exit 1
    fi
    mv "$tmp" "$out"
  done
done
