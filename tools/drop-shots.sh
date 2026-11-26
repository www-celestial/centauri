#!/bin/sh
# The pictures of the chapter When the connection drops, taken again: the invoices filled with a month
# (examples/invoices), their admin pages built, then played by Chrome without a window while the network is cut
# (examples/invoices/tools/drop-shot.ce), into docs/book/images, each picture the part of the page that the step shows.
# ImageMagick, when here, makes each a PNG of 64 colors without its metadata. CHROME names the browser, a Chrome or a
# chrome-headless-shell (chrome by default). tools/deps.sh examples/invoices first, as for the example's tests.
set -e
cd "$(dirname "$0")/.."
here=$(pwd)
chrome=${CHROME:-chrome}
command -v "$chrome" > /dev/null || { echo "drop-shots: no browser $chrome; set CHROME to a Chrome or a chrome-headless-shell" >&2; exit 1; }
tmp=${TMPDIR:-/tmp}
dir=$here/docs/book/images
mkdir -p "$dir"
(cd examples/invoices && cesia build --target wasm admin/page.ce && CHROME="$chrome" OUT="$dir" PROFILE="$tmp/centauri-drop-shots" cesia do drop-shot)
if command -v magick > /dev/null; then
  for f in "$dir"/drop-*.png; do magick "$f" -strip -colors 64 "PNG8:$f"; done
fi
du -cb "$dir"/drop-*.png | tail -1
