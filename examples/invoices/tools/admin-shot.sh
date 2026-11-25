#!/bin/sh
# The test of the admin pages in a browser: the pages compiled from Cesia to WebAssembly (cesia build --target wasm
# admin/page.ce), then served with the invoices filled with a month and played by Chrome without a window, which
# tools/admin-shot.ce drives (cesia do admin-shot). Pictures of each page in OUT (shots/); each step a line, ok or
# FAIL. CHROME names the browser, chrome by default.
set -e
cd "$(dirname "$0")/.."
chrome=${CHROME:-chrome}
command -v "$chrome" > /dev/null || { echo "admin-shot: no browser $chrome; set CHROME to a Chrome or a chrome-headless-shell" >&2; exit 1; }
cesia build --target wasm admin/page.ce
CHROME="$chrome" cesia do admin-shot
