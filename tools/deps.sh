#!/bin/sh
# Puts Centauri's dependency in deps/, as `cesia pkg install` will once Cepheus has a tagged release, and writes
# cesia.lock: the Cesia package of Cepheus from a checkout of Cepheus, and its engine, built against the Cesia that
# runs Centauri (Cepheus's docs/book/quickstart.md, step 1).
#   CEPHEUS=~/cepheus ENGINE=~/cepheus/_build/default/cesia/native/cepheus.cmxs tools/deps.sh
# CEPHEUS is ../cepheus by default, and ENGINE the engine of that checkout. A folder as argument gets the same deps/:
# tools/deps.sh examples/invoices puts Cepheus and Centauri in the deps/ of the example.
set -e
cd "$(dirname "$0")/.."
here=$(pwd)
repo=${CEPHEUS:-../cepheus}
engine=${ENGINE:-$repo/_build/default/cesia/native/cepheus.cmxs}
tag=$(cesia run "$repo/tools/tag.ce")
[ -f "$engine" ] || { echo "no engine at $engine: build Cepheus with CESIA_NATIVE set, or give ENGINE"; exit 1; }
into=${1:-.}
dep=$into/deps/www-celestial/cepheus
rm -rf "$dep"
mkdir -p "$dep/cesia" "$dep/native"
cp "$repo/cesia.toml" "$dep/"
cp -R "$repo/cesia/cepheus" "$dep/cesia/"
cp "$engine" "$dep/native/cepheus-$tag.cmxs"
if [ "$into" != "." ]; then
  # an app of Centauri: Centauri's own packages too
  own=$into/deps/www-celestial/centauri
  rm -rf "$own"
  mkdir -p "$own/src"
  cp cesia.toml "$own/"
  for p in app api auth apptest; do cp -R "src/$p" "$own/src/"; done
  rm -f "$own"/src/*/*.test.ce
fi
cd "$into" && cesia run --allow read,write "$here/tools/lock.ce"
