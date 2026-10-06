# Mapping reference

How each construct maps between Markdown and Org, and which
normalizations to expect. Terms are defined in
[CONTEXT.md](../../CONTEXT.md); the design rationale lives in the
[ADRs](../adr/).

- [Core structure](core.md): both directions: headings, lists, code,
  alerts, images, links, tables, escaping, math and footnotes
- [Org-isms](org-isms.md) (org → md): headline metadata, verbatim
  passthrough, comments, descriptive lists
- [Md-isms](md-isms.md) (md → org): raw HTML, frontmatter, reference
  links
- [Logseq](logseq.md): the `logseq` preset and its dialects
- [Obsidian](obsidian.md): the `obsidian` preset and Obsidian md

## Round-trip convergence

Strict byte-losslessness between the two formats is impossible. morg's
guarantee is to be **semantically faithful and convergent** instead
(see [ADR 0001](../adr/0001-convergence-over-losslessness.md)):

- One round trip (`md → org → md` or `org → md → org`) may normalize formatting,
  but its output is a fixed point: converting again reproduces it byte-for-byte.
- Input already in canonical form is a round-trip identity. Opt-in
  `recordMarkdownStyle` widens that set: a file whose bullet, emphasis, fence
  and rule markers are used consistently has them recorded in the org
  file and restored on the way back, so it is left untouched
  ([ADR 0004](../adr/0004-record-source-markdown-style.md)).
- `md → org` preserves Markdown-only constructs ("md-isms") as `morg_`-prefixed
  org properties; `org → md` serializes Org-only constructs ("org-isms") as
  `key:: value` conventions ([ADR
  0002](../adr/0002-mdism-property-namespace.md)).
- Frontmatter travels verbatim and inert in a
  `#+begin_comment morg_frontmatter` block, not as org keywords, which
  can act in Emacs; an org file's own leading keywords travel as a
  `morg_keywords` frontmatter entry and come back as keywords, a
  file-level drawer (org-roam's `:ID:`) as `morg_properties`. The
  Logseq preset instead maps page properties natively ([ADR
  0005](../adr/0005-frontmatter-as-a-marked-comment-block.md)).
- The few constructs that cannot be carried are documented on these
  pages and reported as warnings.

## Recorded style (md → org, opt-in)

With `recordMarkdownStyle`, the markdown style the source was written in is
detected and stored as a leading `#+MORG_MARKDOWN_STYLE:` keyword (JSON on one
line), then restored by `org → md` instead of being canonicalized,
which is what makes a consistently non-canonical file a round-trip
identity rather than a one-time reformat (ADR 0004). Explicit
`style` options override a record; normalizing drops it,
unless it is itself given `recordMarkdownStyle`, which re-records the canonical
form's own markers.

Recorded: `bullet`, `emphasis`, `strong`, `fence`, `rule` and
`ruleRepetition`, the document-level knobs `remark-stringify` takes.
A marker the document uses two ways (`-` and `*` bullets, `_` and `*`
emphasis) is _not_ recorded and reports via `onWarning`. Per-node style
(mixed bullets on sibling lists, reference vs. inline links, setext for
some headings) is out of scope by design (ADR 0004).

The record is inherited, not merely restored: a list added to the org
file by hand is written out in the recorded style too.

## Normalizations

One round trip lands on canonical form (ADR 0001), or on the recorded
style where there is one; notable normalizations beyond formatting:

- link text equal to its url → autolink / plain `[[url]]`
- `[` and `]` in a url with a scheme → `%5B` / `%5D`: an org
  bracket-link path cannot hold them, and org's own backslash escaping
  is not read back by uniorg. Equivalent for query strings like
  `?a[]=1`; an IPv6 literal host (`http://[::1]/…`) does not survive
  this and is better written as a hostname. A relative path carries
  them the same way in org, but gets them back in Markdown
- per-line leading whitespace inside paragraphs is collapsed
  (insignificant in org and rendered md, but structurally meaningful
  to md parsers)
- line endings inside md inline code, or inside bold, italic or
  strikethrough spanning more than two lines → spaces: org markup
  spans at most two lines, and CommonMark renders them as spaces
  anyway
- whitespace at either end of md inline code → just outside the org
  markers, and outside any bold, italic or strikethrough ending there,
  since org markup may not start or end with whitespace; whitespace-only
  code becomes plain text and reports via `onWarning`
- org `=verbatim=` → `~code~`: Markdown has a single inline code
  construct, and org's own HTML export renders both as `<code>`. md
  code holding a `~` that would end org code early (`` `a~ b` ``)
  becomes `=a~ b=` instead; code a `=` would end early too stays
  plain text and reports via `onWarning`
- `_` inside a word → `\_` in Markdown: remark's own canonical form
  escapes it; same meaning, and wikilink targets are emitted verbatim,
  so file names in `[[…]]` keep theirs
- org `./path` links → `file:./path`
- org entities → UTF-8 characters
- inline footnotes → reference + definition
- superscript/subscript → braced form (`^{2}`, `_{2}`)
- an author's own `OPTIONS: ^:{}` in `morg_keywords` is dropped where
  the text needs it: it is then indistinguishable from the one md → org
  adds (`options: ^:{}` as plain frontmatter is inert data and stays)
