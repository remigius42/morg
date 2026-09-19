# 0004 — Record the source Markdown style, document-wide and opt-in

## Status

Accepted (2026-09-19)

## Context

ADR 0001 rules out byte-losslessness, in part because the formats
disagree on syntax _choices_: Markdown spells a bullet `-`, `*` or `+`
and emphasis `_` or `*`, Org spells each one way, and the return trip
has to pick. Convergence makes that a one-time reformat rather than an
open-ended loss, but the reformat still lands on every non-canonical
file.

Nothing forces it to. Org can carry the source's own choices, and
`MarkdownStyleOptions` already exists to replay them — it is just wired
to the config rather than to the file. That raises three questions: what
scope the record has, what a document that contradicts itself records,
and who pays for it.

## Decision

1. **A `#+MORG_MARKDOWN_STYLE:` keyword records the detected style**, JSON on one
   line (ADR 0002 §3), leading the document. On `org → md` it is
   consumed rather than turned into frontmatter; explicit
   `markdownStyle` options still win over it.
2. **Document-level scope only**: `bullet`, `emphasis`, `strong`,
   `fence`, `rule`, `ruleRepetition` — exactly the knobs
   `remark-stringify` takes. Per-node style (mixed bullets across
   sibling lists, reference vs. inline links, setext for some headings)
   is _not_ recorded; see Consequences.
3. **A knob used inconsistently is not recorded, and warns.** A document
   with both `-` and `*` bullets has no honest single answer, and
   guessing a majority silently restyles the minority.
4. **Opt-in** (`recordStyle`, default `false`, `--record-style`). The
   keyword is a visible morg-specific line in the format the user keeps
   and hand-edits; that cost should be chosen, not defaulted into.
5. **Asymmetric on purpose**: only `md → org` records. `uniorg-stringify`
   has no comparable knobs, so there is nothing to record going the
   other way. `morg normalize` drops the record, which is how a file
   opts back out.

## Consequences

- Convergence is unaffected: a recorded style is reproduced on the next
  trip, so the output stays a fixed point in both directions. What
  changes is the _identity_ set — a consistent non-canonical file now
  round-trips unchanged instead of being reformatted once.
- The record is inherited, not just restored. A list added to the org
  file by hand — one that never existed in any Markdown source — is
  written out in the recorded style too. That is the point: a document
  should not come back half `*` and half `-`.
- Convergence remains per-config (ADR 0002 §5) but the file now carries
  part of that config itself, so a recorded file is portable in a way a
  `markdownStyle` config entry is not.
- **Rejected: per-node style records.** Verbatim reconstruction of mixed
  style needs an anchor per inline node, which org properties cannot
  provide (the same wall ADR 0002 §2 hit with image titles). The
  alternative, a positional side-table, desynchronizes the first time
  the org file is edited by hand — and hand-editing the org file is the
  reason it is the format worth keeping. The robust version of this
  feature is precisely the version that cannot be verbatim.
- **Rejected: embedding the Markdown source** (as a keyword, base64 or
  otherwise). It would make the round trip byte-lossless for any input,
  cheaply, and is still wrong: the keep format would carry a shadow copy
  of the write format, the copy desynchronizes on the first edit of
  either side, and the org file stops being the truth and becomes an
  envelope. Byte-losslessness is available; it is not worth its price.
