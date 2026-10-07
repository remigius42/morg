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
# all). Warns where the baseline's run is not of main (all.sh's `.ref`):
# rerun only the corpora the commits in between touch.
set -euo pipefail

WORK=${WORK:-/tmp/morg-corpus}
BASE=${BASE:-/tmp/morg-corpus-base}
ONLY=${ONLY:-obs lsq webmd worg}
main=$(git -C "$(dirname "$0")" rev-parse --short main)

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
  base=$(cat "$BASE-$corpus/.ref" 2> /dev/null || echo unknown)
  if [ "$base" != "$main" ]; then
    echo "warning: $corpus baseline is of $base, main is $main" >&2
  fi
  for kind in convergence identity content; do
    new=$(comm -13 <(flagged "$BASE-$corpus" "$kind") \
      <(flagged "$WORK-$corpus" "$kind"))
    echo "$corpus $kind: $(printf '%s' "$new" | grep -c . || true) new"
    case $corpus in
      webmd | worg) printf '%s' "$new" | grep . | sed 's/^/  /' || true ;;
    esac
  done
done
