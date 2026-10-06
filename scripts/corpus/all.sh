#!/usr/bin/env bash
# Round trips each corpus setup.sh listed, one after another: never in
# parallel, as each run starts node for every file of its corpus. Prints
# one count line per corpus (roundtrip.sh's), no contents.
#
#   scripts/corpus/all.sh                                 # this checkout
#   MORG=/tmp/morg-base/dist/cli.js scripts/corpus/all.sh  # the baseline
#
# MORG: the CLI (default: this checkout's dist/cli.js); LISTS: the
# lists' prefix (default: /tmp/c); WORK: the output directories' prefix
# (default: /tmp/morg-corpus); ONLY: the corpora to run (default: all).
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
export MORG=${MORG:-$root/dist/cli.js}
LISTS=${LISTS:-/tmp/c}
WORK=${WORK:-/tmp/morg-corpus}
ONLY=${ONLY:-obs lsq webmd worg}

declare -A FLAGS=(
  [obs]="--preset obsidian"
  [lsq]="--preset logseq"
  # the web docs write emphasis `_x_`
  [webmd]="--emphasis _"
  [worg]=""
)

for corpus in $ONLY; do
  counts=$(
    EXCLUDE='*hermes*' FORWARD="${FLAGS[$corpus]}" BACK="${FLAGS[$corpus]}" \
      WORK="$WORK-$corpus" xargs -0 "$root/scripts/corpus/roundtrip.sh" \
      < "$LISTS-$corpus" | tail -1
  )
  echo "$corpus: $counts"
done
