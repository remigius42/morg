#!/usr/bin/env bash
# shellcheck disable=SC2016 # bash -c takes literal text
# Converts each file of a local corpus once with $FLAGS into $OUT, to
# compare two builds' output: `diff -rq old new | wc -l` counts the files
# that differ, without showing their contents.
#
#   MORG=/tmp/morg-0.8.0/cli.js OUT=/tmp/snap-old FLAGS="--preset logseq" \
#     scripts/corpus/snapshot.sh ~/notes/pages/*.org
#
# MORG: the CLI (default: this checkout's dist/cli.js).
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
export MORG=${MORG:-$root/dist/cli.js}
export FLAGS=${FLAGS:-}
export OUT=${OUT:?OUT must name the output directory}

rm -rf "$OUT"
mkdir -p "$OUT"

convert() {
  local x=$1 ext=${1##*.} other
  [ "$ext" = org ] && other=md || other=org
  local c
  # the whole path: files in different directories may share a name
  c=$OUT/$(realpath "$x" | tr / _)
  c=${c%."$ext"}
  # word splitting of the flag string is intended
  # shellcheck disable=SC2086
  node "$MORG" -s $FLAGS --input "$x" --output "$c.$other" 2> /dev/null ||
    echo failed > "$c.$other"
}
export -f convert

printf '%s\0' "$@" | xargs -0 -P "$(nproc)" -I{} bash -c 'convert "$1"' _ {}
echo "files=$# into $OUT"
