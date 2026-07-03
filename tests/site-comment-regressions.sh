#!/usr/bin/env bash
set -euo pipefail

if [ ! -f public/index.html ]; then
  echo "public/index.html is missing; run hugo --gc --minify first" >&2
  exit 1
fi

if grep -Eq '<a class="?updates-cta__latest' public/index.html; then
  echo "homepage still renders the latest newsletter link in the signup band" >&2
  exit 1
fi

if grep -q 'Rakamlarla EA Türkiye' public/index.html; then
  echo "homepage still renders the stats-strip eyebrow label" >&2
  exit 1
fi

if grep -Eq '<span class="?event-card__cta' public/etkinlikler/index.html; then
  echo "event archive still renders event-card CTA buttons" >&2
  exit 1
fi

if ! grep -Eq '<a class="?event-card__link' public/etkinlikler/index.html; then
  echo "event archive cards do not expose a whole-card link" >&2
  exit 1
fi

if grep -Eq '<a class="?card-cta"? href="/blog/' public/blog/index.html; then
  echo "blog landing still renders internal read-more CTA buttons" >&2
  exit 1
fi

if ! grep -Eq '<a class="?blog-featured__link' public/blog/index.html; then
  echo "featured blog card does not expose a whole-card link" >&2
  exit 1
fi
