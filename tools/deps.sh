#!/bin/sh
# Puts Centauri's dependencies in deps/, as `cesia pkg install` will once Cepheus and Ceres have tagged releases, and
# writes cesia.lock: the Cesia package of Cepheus from a checkout of Cepheus, and its engine, built against the Cesia
# that runs Centauri (Cepheus's docs/book/quickstart.md, step 1); the packages of Ceres that the admin pages are made
# of, from a checkout of Ceres.
#   CEPHEUS=~/cepheus ENGINE=~/cepheus/_build/default/cesia/native/cepheus.cmxs CERES=~/ceres tools/deps.sh
# CEPHEUS is ../cepheus by default, ENGINE the engine of that checkout, CERES ../ceres. A folder as argument gets the
# same deps/: tools/deps.sh examples/invoices puts Cepheus, Ceres and Centauri in the deps/ of the example.
set -e
cd "$(dirname "$0")/.."
here=$(pwd)
repo=${CEPHEUS:-../cepheus}
ceres=${CERES:-../ceres}
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
web=$into/deps/www-celestial/ceres
rm -rf "$web"
mkdir -p "$web/src" "$web/web"
cp "$ceres/cesia.toml" "$web/"
for p in web browser form; do cp -R "$ceres/src/$p" "$web/src/"; done
rm -f "$web"/src/*/*.test.ce "$web"/src/*/*.test.snap
cp "$ceres/web/ceres.js" "$web/web/"
if [ "$into" != "." ]; then
  # an app of Centauri: Centauri's own packages too
  own=$into/deps/www-celestial/centauri
  rm -rf "$own"
  mkdir -p "$own/src"
  cp cesia.toml "$own/"
  for p in src/*/; do cp -R "$p" "$own/src/"; done
  cp -R tools "$own/"
  find "$own/src" -name '*.test.ce' -delete
fi
cd "$into" && cesia run --allow read,write "$here/tools/lock.ce"
