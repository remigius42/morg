# Corpus checks

The unit tests pin behavior on small inputs; the corpus checks run a
build over thousands of real files and count how many converge (ADR
0001): a round trip may normalize a file once, a second one must give
the same result. Converging is not enough: a round trip can lose
content once and then keep the loss, so they also count the files whose
round trip kept their content. This page explains the scripts, the
corpora, and the non-convergences left on purpose.

## Scripts

All live in `scripts/corpus/` and print counts only, never file
contents; the diffs stay in the work directory, for reading locally.

- `setup.sh` builds what a run needs under `/tmp`, so a reboot loses
  it: a worktree of `main` with its `dist` built (the baseline), shallow
  clones of the web corpora, and the file lists. What exists is kept.
- `roundtrip.sh` trips each file x through the other format twice: a =
  f(x), b = g(a), c = f(b), d = g(c). It counts _identical_ (b = x),
  _converging_ (d = b) and _same-content_ (`content.mjs`), and leaves
  `*.identity.diff` and `*.convergence.diff` per file in `$WORK`.
- `content.mjs` compares each x with its b: the words of the text, code
  and keywords (case aside) and the link targets, a link's kind
  included (a heading link that becomes a file link changes). Style
  does not count: emphasis markers, a reference link inlined, a url's
  percent-encoding, a link's description that only repeats its target.
  It reads org with morg's uniorg workarounds, from this checkout's
  `dist`. What differs per file goes to `$WORK/content.txt`.
- `all.sh` runs every corpus, one after another, on this checkout, or
  with `MORG=/tmp/morg-base/dist/cli.js WORK=/tmp/morg-corpus-base` on
  the baseline. Never run two at a time: a run starts node four times
  per file. A run's niceness is `NICE` (default 10), so the machine
  stays usable.
- `compare.sh` compares a run with the baseline's: per corpus, the
  files that converge, are identical or keep their content on the
  baseline but not on the run.
- `snapshot.sh` converts each file once, to compare two builds'
  output with `diff -rq`.

## Corpora

| Corpus  | Files                                                         | Trip                           |
| ------- | ------------------------------------------------------------- | ------------------------------ |
| `obs`   | an Obsidian vault (local, private)                            | md→org→md, `--preset obsidian` |
| `lsq`   | a Logseq org graph (local, private)                           | org→md→org, `--preset logseq`  |
| `webmd` | the Rust book, GitHub's and MDN's docs                        | md→org→md, `--emphasis _`      |
| `worg`  | [Worg](https://git.sr.ht/~bzg/worg), the org community's docs | org→md→org, no flags           |

The web docs write emphasis `_x_`, which `--emphasis _` keeps, so a
file's identity diff shows what changed rather than every emphasis.

The local corpora never enter the repo, and neither do their file
names: this page names files of the web corpora only. The web corpora
are clones of upstream HEAD, so counts move as upstream does; compare a
build against the baseline's run on the same clones, not against older
counts.

## Checking a change

Before committing a change that affects parsing or writing:

1. `npm run build`, then `scripts/corpus/all.sh`.
2. The baseline run (once per baseline, after `setup.sh` or moving
   `/tmp/morg-base` to a new `main`), of only the corpora the commits
   since the last one touch: `all.sh` records each run's commit in its
   directory's `.ref`, and `compare.sh` warns where the baseline's is
   not `main`.
3. `scripts/corpus/compare.sh`: a file that converges on the baseline
   must converge on the change (no new non-convergences), a file
   identical there must stay identical, and a file that keeps its
   content there must keep it.

## Status

As of 2026-10-07, branch `fix/known-limits-0.11`:

| Corpus  | Converging | Identical | Same content |
| ------- | ---------- | --------- | ------------ |
| `obs`   | 24/24      | 0         | 23           |
| `lsq`   | 407/407    | 321       | 407          |
| `webmd` | 1268/1268  | 384       | 1268         |
| `worg`  | 285/293    | 0         | 293          |

The one Obsidian file whose content differs has a heading starting
`TODO`: org reads it as the task keyword, which comes back as a
`todo:: TODO` line below the heading (ADR 0002), gaining the word
`todo`.

Worg files are identical in none: org→md→org writes org's canonical
form (keyword values single-spaced, a list's blank lines dropped, a
table's cells without padding, no blank line after an element but a
paragraph), which hand-written org rarely is.

## Known non-convergences

Each of the eight left in `worg` traces to a construct rare enough that
a fix would cost more than it saves (special cases in shared code, a
risk to files that converge now). Each converges in a later round or
differs in whitespace only, unless noted.

- **`$` runs next to math** (`org-contrib/org-export-generic`,
  `org-syntax`): lisp strings such as `"</date>$\n$$\n$"` hold `$\n$`,
  which org reads as inline math. Written back as `$…$` next to the
  literal `$`s around it, org reads the dollars differently, and each
  round trip adds a `$`. Prose rarely puts `$` right against math.
- **A newline between HTML snippets** (`org-contrib/org-drill`,
  `org-contrib/org-protocol`): an `@@html:…@@` snippet spanning lines
  comes back as one snippet per line, and the line break between two
  snippets then becomes a space. Rendered HTML is the same.
- **A footnote's continuation indent** (`org-contribute`,
  `archive/fireforg`): the continuation lines of a footnote (one
  inline in a list item, one a definition) lose their indentation one
  round trip later. Org reads the same text either way.
- **Fixed-width lines in a quote** (`org-contrib/babel/languages/ob-doc-picolisp`):
  verbatim passthrough works at the top level and in list items, not in
  a quote. A fixed-width line holding only blanks there ends in two
  spaces, which Markdown reads as a line break, written back as `\\`.
- **A definition list right after an item's text** (`org-syntax`): the
  known limitation in
  [Org-isms](mappings/org-isms.md#underline-scripts-and-descriptive-lists):
  Markdown reads no
  definition list inside a list item, so a descriptive list nested in
  a plain one becomes text.
- **A special block nesting an export block and a list**
  (`org-tutorials/images-and-xhtml-export`): Markdown does not take it
  back as one passthrough element, so its parts are read as Markdown.
  Separately, a passthrough element is written from the parse, not
  the source, and uniorg-stringify braces every script (`x_y` →
  `x_{y}`).

Fixed-width lines in a list item also lose their trailing blanks once
(org→md); the result is stable.
