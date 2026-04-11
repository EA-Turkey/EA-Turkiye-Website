#!/bin/zsh

set -euo pipefail

ROOT_DIR="${0:A:h:h}"
cd "$ROOT_DIR"

if ! command -v cjpeg >/dev/null 2>&1; then
  echo "cjpeg not found in PATH" >&2
  exit 1
fi

mkdir -p static/jpg

for src in assets/images/**/*.(jpg|jpeg)(N); do
  rel=${src#assets/images/}
  base=${rel%.*}
  mkdir -p "static/jpg/${base:h}"

  for width in 320 480 520 560 600 640 768 800 960 1280 1440 1600; do
    magick "$src" -resize "${width}x" -strip ppm:- | \
      cjpeg -quality 90 -progressive -optimize -outfile "static/jpg/${base}-${width}.jpg"
  done
done
