#!/usr/bin/env bash
# Compares a run of all.sh with the baseline's: per corpus, the files
# that converge, are identical or keep their content on the baseline
# but not on this run. Prints counts, and names for the web corpora
# only: the local ones' file names never leave $WORK.
#
#   scripts/corpus/compare.sh
#
# WORK, BASE: the two runs' directory prefixes (default:
# /tmp/morg-corpus, /tmp/morg-corpus-base); ONLY: the corpora (default:
# all).
set -euo pipefail

WORK=${WORK:-/tmp/morg-corpus}
BASE=${BASE:-/tmp/morg-corpus-base}
ONLY=${ONLY:-obs lsq webmd worg}

# the files a run flags as `kind`: convergence, identity or content
flagged() {
  if [ "$2" = content ]; then
    grep '^/' "$1/content.txt" | tr / _ || true
  else
    find "$1" -maxdepth 1 -name "*.$2.diff" -printf '%f\n' |
      sed "s/\.$2\.diff\$//"
  fi | sed 's/\.\(org\|md\)$//' | sort
}

for corpus in $ONLY; do
  for kind in convergence identity content; do
    new=$(comm -13 <(flagged "$BASE-$corpus" "$kind") \
      <(flagged "$WORK-$corpus" "$kind"))
    echo "$corpus $kind: $(printf '%s' "$new" | grep -c . || true) new"
    case $corpus in
      webmd | worg) printf '%s' "$new" | grep . | sed 's/^/  /' || true ;;
    esac
  done
done
