#!/usr/bin/env bash
# Rebuilds what the corpus runs need, kept under /tmp and so lost on a
# reboot: a baseline worktree with its dist built, the web corpora
# (shallow clones of upstream HEAD, so a run compares against the
# baseline's run on the same clones, not against older counts) and the
# NUL-separated file lists $LISTS-{obs,lsq,webmd,worg} that all.sh reads.
# What exists is kept.
#
#   scripts/corpus/setup.sh
#
# BASE: the baseline worktree (default: /tmp/morg-base), of REF
# (default: main); WEB: the web corpora (default: /tmp/morgt); OBSIDIAN,
# LOGSEQ: the local vault and graph; LISTS: the lists' prefix
# (default: /tmp/c).
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
BASE=${BASE:-/tmp/morg-base}
REF=${REF:-main}
WEB=${WEB:-/tmp/morgt}
OBSIDIAN=${OBSIDIAN:-$HOME/Documents/obsidian}
LOGSEQ=${LOGSEQ:-$HOME/Documents/sync/logseq}
LISTS=${LISTS:-/tmp/c}

if [ ! -e "$BASE/dist/cli.js" ]; then
  git -C "$root" worktree prune
  git -C "$root" worktree add -q --detach "$BASE" "$REF"
  ln -s "$root/node_modules" "$BASE/node_modules"
  (cd "$BASE" && npm run build > /dev/null)
fi

# clone DIR URL [SPARSE_PATH...]
clone() {
  local dir=$1 url=$2
  shift 2
  [ -d "$dir" ] && return
  if [ $# -eq 0 ]; then
    git clone -q --depth 1 "$url" "$dir"
  else
    git clone -q --depth 1 --filter=blob:none --sparse "$url" "$dir"
    git -C "$dir" sparse-checkout set "$@"
  fi
}

clone "$WEB/web-md/book" https://github.com/rust-lang/book.git
clone "$WEB/web-md/docs" https://github.com/github/docs.git \
  content/get-started content/pull-requests
clone "$WEB/web-md/mdn" https://github.com/mdn/content.git \
  files/en-us/web/css/reference/properties
clone "$WEB/web-org/worg" https://git.sr.ht/~bzg/worg

find "$OBSIDIAN" -name '*.md' -not -path '*/.*' -print0 > "$LISTS-obs"
# pages and journals only: the graph's .stversions holds old copies
find "$LOGSEQ/pages" "$LOGSEQ/journals" -name '*.org' -print0 > "$LISTS-lsq"
find "$WEB/web-md" -name '*.md' -not -path '*/.git/*' -print0 > "$LISTS-webmd"
find "$WEB/web-org/worg" -name '*.org' -not -path '*/.git/*' -print0 > "$LISTS-worg"

for list in obs lsq webmd worg; do
  echo "$list: $(tr -cd '\0' < "$LISTS-$list" | wc -c) files"
done
