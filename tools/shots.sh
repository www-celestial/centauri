#!/bin/sh
# The pictures of the admin pages in the book, taken again: the invoices filled with a month (examples/invoices), their
# admin pages built, then played by Chrome without a window at each step the book shows (examples/invoices/tools/
# admin-shot.ce with DOCS), in English into docs/book/images and in French into docs/fr/book/images, each picture the
# part of the page that the step shows. ImageMagick, when here, makes each a PNG of 64 colors without its metadata.
# CHROME names the browser, a Chrome or a chrome-headless-shell (chrome by default). Run it after a change of the admin
# pages: tools/deps.sh examples/invoices first, as for the example's tests.
set -e
cd "$(dirname "$0")/.."
here=$(pwd)
chrome=${CHROME:-chrome}
command -v "$chrome" > /dev/null || { echo "shots: no browser $chrome; set CHROME to a Chrome or a chrome-headless-shell" >&2; exit 1; }
tmp=${TMPDIR:-/tmp}
(cd examples/invoices && cesia build --target wasm admin/page.ce)
for lang in en fr; do
  if [ "$lang" = en ]; then dir=$here/docs/book/images; else dir=$here/docs/fr/book/images; fi
  mkdir -p "$dir"
  (cd examples/invoices && CHROME="$chrome" LANG=$lang DOCS="$dir" PROFILE="$tmp/centauri-shots-$lang" cesia do admin-shot)
  if command -v magick > /dev/null; then
    for f in "$dir"/admin-*.png; do magick "$f" -strip -colors 64 "PNG8:$f"; done
  fi
done
# the English book shows the French dashboard too, where it says what the pages do in French
cp docs/fr/book/images/admin-dashboard.png docs/book/images/admin-dashboard-fr.png
du -cb docs/book/images/admin-*.png docs/fr/book/images/admin-*.png | tail -1
