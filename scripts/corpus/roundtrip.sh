#!/usr/bin/env bash
# shellcheck disable=SC1003,SC2016 # sed's `$a\` and bash -c take literal text
# Round trips a local corpus and prints counts only, never note contents:
# per file x, a = f(x), b = g(a), c = f(b), d = g(c), with f taking
# $FORWARD flags and g $BACK flags (ADR 0001, 0006). Identical: b == x
# (modulo a final newline); converging: d == b. Diffs land in $WORK for
# local inspection.
#
#   FORWARD="--preset logseq" BACK="--preset logseq" \
#     scripts/corpus/roundtrip.sh ~/notes/pages/*.org
#
# MORG: the CLI (default: this checkout's dist/cli.js); WORK: output
# directory (default: /tmp/morg-corpus); EXCLUDE: a glob of files to skip.
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
export MORG=${MORG:-$root/dist/cli.js}
export FORWARD=${FORWARD:-} BACK=${BACK:-}
export WORK=${WORK:-/tmp/morg-corpus}

rm -rf "$WORK"
mkdir -p "$WORK"

trip() {
  local x=$1 ext=${1##*.} other
  [ "$ext" = org ] && other=md || other=org
  local c
  # the whole path: files in different directories may share a name
  c=$WORK/$(realpath "$x" | tr / _)
  c=${c%."$ext"}
  # word splitting of the flag strings is intended
  # shellcheck disable=SC2086
  if ! { node "$MORG" -s $FORWARD --input "$x" --output "$c.a.$other" &&
    node "$MORG" -s $BACK --input "$c.a.$other" --output "$c.b.$ext" &&
    node "$MORG" -s $FORWARD --input "$c.b.$ext" --output "$c.c.$other" &&
    node "$MORG" -s $BACK --input "$c.c.$other" --output "$c.d.$ext"; } 2> "$c.err"; then
    echo failing >> "$WORK/status"
    return
  fi
  rm -f "$c.err"
  if cmp -s <(sed -e '$a\' "$x") "$c.b.$ext"; then
    echo identical >> "$WORK/status"
  else
    diff <(sed -e '$a\' "$x") "$c.b.$ext" > "$c.identity.diff" || true
  fi
  if cmp -s "$c.b.$ext" "$c.d.$ext"; then
    echo converging >> "$WORK/status"
  else
    diff "$c.b.$ext" "$c.d.$ext" > "$c.convergence.diff" || true
  fi
}
export -f trip

files=()
for f in "$@"; do
  # shellcheck disable=SC2053
  [[ -n ${EXCLUDE:-} && $f == $EXCLUDE ]] || files+=("$f")
done
touch "$WORK/status"
printf '%s\0' "${files[@]}" | xargs -0 -P "$(nproc)" -I{} bash -c 'trip "$1"' _ {}

count() { grep -cx "$1" "$WORK/status" || true; }
echo "files=${#files[@]} identical=$(count identical)" \
  "converging=$(count converging) failing=$(count failing)"
