# Mapping reference

How each construct maps between Markdown and Org, and which
normalizations to expect. Terms are defined in
[CONTEXT.md](../CONTEXT.md); the design rationale lives in the
[ADRs](adr/).

## Core structure

Both directions: headings, paragraphs, bold/italic/strikethrough,
links, lists (nested, ordered, mixed), code (inline, fenced/src and
example blocks; a src block's switches and header arguments ↔ the
fence's meta after the language), blockquotes/quote blocks, and horizontal rules
(md `---` ↔ org `-----`). Hard line breaks map md `\` (or two trailing
spaces) ↔ org `\\`. Markdown is parsed and serialized with GFM
enabled.

Images: org has no dedicated image syntax; links to image files map to
md images, alt text ↔ link description. Image title attributes
(`![alt](url "title")`) are dropped by design (reported via
`onWarning`): org links have no title slot, and an inline construct
has no sensible `morg_` property anchor (ADR 0002 reserves properties
for metadata-shaped md-isms).

Relative links: a md url without a scheme (`notes.md#Some%20Heading`,
`img/a.png`) is a path, but a bare org path is a fuzzy link, a
heading search. They map to org `file:` links instead, percent escapes
decoded and the `#anchor` as org's search option
(`[[file:notes.md::Some Heading]]`), which Emacs resolves to a
`<<target>>` or a headline of that name; a GitHub-style slug anchor
(`#some-heading`) round-trips, but finds no headline. org → md
reverses it, org's `./path` links included, percent-encoding `%`,
`#` and spaces.
In the org path, `[`, `]` and a colon before another colon or the
path's end are percent-encoded (`%5B`, `%5D`, `%3A`), since org reads
brackets as link syntax and `::` as the search option; a literal `%`
in front of such an escape gets `25` added (`a%5B.md` → `a%255B.md`),
so the encoding stays reversible.
Urls starting with `[` or `(` are dialect references (Logseq's
`[[page]]`), not paths.

Markup touching a word character (`` `x`s ``, `foo**bar**baz`) has no
valid org boundary; md → org inserts a zero-width space (U+200B, the
org manual's escape character) between marker and neighbor. The
reverse, literal md text org would read as markup (`/etc/`, `\*b\*`),
gets one after the opening marker. org → md drops the zero-width
spaces directly next to markup or after a marker again.

A paragraph line org would read as line syntax (an escaped `1\.`,
`\-`, `\*` or `\#`, or a lazy continuation line starting that way)
gets a leading zero-width space too, or it would turn into a list
item, headline, comment or table; org → md drops it. The same goes for
the first line of line syntax spanning lines (an escaped
`\#+begin_src`…`\#+end_src`, `\begin{equation}`…) or depending on
the headline above (`SCHEDULED: <…>`). So does a line
starting `_.` or `_)`: org reads it as text, but uniorg takes it for a
bullet and fails to parse the document (or drops the line), so org →
md guards such lines the same way before parsing. A paragraph org
reads as just one passthrough element (below) is org text, and stays
unescaped.

A literal `[fn:` in md text (`\[fn:1]`) would be a footnote reference
in org; md → org puts a zero-width space after its `[`, org → md drops
it. Likewise a literal backslash before a letter, `(` or `[` in md text
(a path like `C:\Users`, `\n`, `\alpha`), which org would read as a
LaTeX fragment or an entity, gets a zero-width space after the
backslash, except in a passthrough paragraph's org text.

Markdown text has no sub/superscripts, but org reads a bare `a_b` or
`x^y` as one. md → org therefore adds `^:{}` to `#+OPTIONS:` (org's
own switch limiting scripts to the braced `a_{b}` form, which morg
emits) whenever the text needs it; org → md honors `^:{}` in a
top-level `#+OPTIONS:` and consumes it whenever the text needs it,
keeping any other options as a `morg_keywords` entry. Where the text does not
need it, it is the author's own and stays. org → md honors the other
`^:` settings too (`nil`: no scripts at all, `t`: org's default), and
keeps them.

Tables: GFM ↔ org, including column alignment via org `<l>/<r>/<c>`
cookie rows. `table.el` tables travel as `table.el`-tagged fenced
blocks and are restored verbatim. An escaped `\|` in a cell becomes
org's `\vert{}` entity (org has no escaped `|`), which comes back as
`\|`. In inline code, where the entity would be literal, it becomes the
lookalike `∣` (U+2223) instead and reports via `onWarning`: the org
file then holds a different character (a command copied from it, an
export). org → md turns `∣` in code in a table cell back into `\|`, an
author's own included.

## Org-isms (org → md)

Headline metadata serializes to `key:: value` lines directly below the
heading (`todo::`, `priority::`, `tags::`, `scheduled::`, `deadline::`,
`closed::`; property drawer entries keep their own keys) and is
restored to native org syntax on the way back: known keys become TODO
keywords, priorities, tags and planning lines, unknown keys become
property drawer entries, an empty one (`key::`) included: a line
like `Note::` alone directly below a heading reads as an empty
property too. A known key whose value org could not carry in
that slot (a priority that is not a single letter, a drawer property
that merely happens to be named `todo`) becomes a property drawer entry
too, rather than being written onto the headline. Key names are
remappable via `orgismKeys`
(convergence is then per-config, ADR 0002). `preserveOrgisms` accepts
`false` or a per-key record to drop org-isms instead.

Verbatim passthrough (org text kept literally in Markdown, re-parsed
natively on the return trip): generic drawers (`:LOGBOOK:` …),
special / center / verse / comment blocks, fixed-width blocks,
mid-file keywords, babel calls, clocks, diary sexps, non-HTML export
blocks and `@@backend:…@@` snippets. A block or drawer comes back whole even
where its lines read as Markdown syntax (a blank line and an indented
line, a `#` or `-` line). Statistics cookies (`[1/2]`) and
`[cite:…]` citations travel as plain text the same way.

Affiliated keywords (`#+CAPTION:`, `#+NAME:`, `#+ATTR_*`) travel as
verbatim lines directly above their element and re-attach natively on
the return trip, a dual value included (`#+CAPTION[short]: long`,
`#+RESULTS[hash]: …`), except on org tables, which discard them at parse
time (upstream [uniorg#151](https://github.com/rasendubi/uniorg/issues/151)).

Org comments (`# …`) map to HTML comments (`<!-- … -->`) and back.
Both are invisible in rendered output, so the mapping is lossless in
both directions. A `-->` inside the comment body is written as
`--&gt;` (and decoded on the way back), since it would otherwise close
the HTML comment early and leak the rest of the line into the page.

Org underline, superscript and subscript have no Markdown equivalent;
their raw org markup (`_text_`, `^{2}`, `_{2}`) is kept verbatim as
escaped text and re-parsed natively on the way back (same approach as
inline org timestamps, which survive verbatim including
active/inactive ranges). Descriptive lists keep their
`- term :: definition` syntax literally in Markdown list items. With
`useHtml: true` these constructs render as raw HTML instead (`<u>`,
`<sup>`, `<sub>`, `<dl>`); the HTML then round-trips as a preserved
md-ism, not back to native org markup.

Org entities render as their character (`\alpha` → `α`), matching
org's own export (one-way normalization).

## Md-isms (md → org)

Raw HTML is preserved as org `#+begin_export html` blocks (block
level) and `@@html:...@@` export snippets (inline), restored verbatim
on the way back; `preserveMdisms` accepts `false` or a per-key record
(e.g. `{ html: false }`) to drop them instead.

Markdown YAML frontmatter travels verbatim, comments and multi-line
values included, in a comment block marked as morg's, leading the org
file (ADR 0005):

```org
#+begin_comment morg_frontmatter
title: A Note
tags: [a, b]
#+end_comment
```

The block is inert in Emacs and in export. No key maps to an org
keyword, `title` included: frontmatter is passive data, while keywords
like `#+TAGS`, `#+TODO` or `#+INCLUDE` act. A YAML line org would read
as a headline or keyword (`* …`, `#+…`, also indented or already
comma-escaped) gets Org's own comma escape in the block, and loses it
again on the way back. A comment block without the marker is the
user's and converts like any other. On the way back the block is found
anywhere before the first headline, below an Emacs mode line or an
org-roam property drawer say, by its own begin line (a second one
there stays a comment block, and reports via `onWarning`); keywords org
attached to it (`#+NAME:` directly above it) come back as keywords,
links and markup in a caption kept, but apart from the block, as
nothing reads them on a comment block; a dual one
(`#+CAPTION[short]: long`) comes back as the plain keyword
`#+CAPTION[SHORT]: long`, as org reads it apart. Both report via
`onWarning`. The
next md → org puts it near the top again, since Markdown frontmatter
leads the file: an Emacs mode line (`# -*- mode: org -*-`, an HTML
comment in Markdown) goes back to the first line if it is the
Markdown body's first node, the file-level drawer below it, then the
keywords and the block. A `-*-` comment below an org file's first
line, which Emacs ignores, must not get there: leading keywords
directly above one stay `#+KEY:` lines in the Markdown body, and one
that leads the Markdown body all the same (below the block or drawer,
or a blank first line) reports via `onWarning`. Keywords below another
comment stay `#+KEY:` lines below it. A `---`
line in the block would end Markdown frontmatter early; it reports via
`onWarning`.

A real org file's leading keywords (`#+TITLE`, `#+STARTUP`,
`#+FILETAGS`) travel the other way as a `morg_keywords` frontmatter
entry, an ordered sequence of one-entry maps, and come back as the same
keywords ahead of the block; order and repeats survive, keys come back
upper-cased as uniorg reads them (Org ignores keyword case), values as
written (`1.10` stays `1.10`, not the number `1.1`):

```yaml
morg_keywords:
  - TITLE: A Note
  - STARTUP: overview
  - FILETAGS: ":one:two:"
```

`morg_keywords` joins the frontmatter as one more entry, which takes a
block mapping without one of its own, or comments alone; next to a
frontmatter that is a list, a flow mapping, an indented mapping or ends
in `...`, the keywords stay `#+KEY:` lines
in the Markdown body instead (they come back as keywords all the same,
affiliated ones attached to what follows them)
and report via `onWarning`; a file-level drawer then stays `key::`
text, and reports too. Such files may not converge (a known limit):
an `#+OPTIONS: ^:{}` md → org adds can repeat, and with the Logseq
preset the page properties can end up in a block.

`morg_keywords` restores only if every entry fits a keyword line: no
line break in the value, which would end the line and inject org
structure (a headline, an `#+INCLUDE:`), and a key that reads back
as the same keyword (no spaces outside a dual value's brackets, not
`begin_…`, which begins a block). Otherwise the
entry stays in the block as written. Comments within a restored entry
stay in the block, each on a line of its own.

A file-level property drawer (org-roam's `:ID:`), which org reads as
the file's only where nothing but comments precede it, travels the
same way as a `morg_properties` entry and comes back as that drawer,
leading the file ahead of every keyword; a key with whitespace, the
key `END`, which would close the drawer, or a value with a line break
keeps the entry in the block:

```yaml
morg_properties:
  - ID: 3f1c…
  - ROAM_ALIASES: '"A b"'
```

If either entry stays in the block, so does the other: on the way back
the frontmatter would not take it again.

A restored keyword org would attach to the element below it
(`#+CAPTION`, `#+NAME` and its aliases such as `#+SOURCE`, `#+ATTR_*`)
gets a blank line after it, so it stays a document keyword.

Files written by 0.6.0 and earlier carry their frontmatter as such
keywords, so they now read as org-native keywords too.

Entries leave the frontmatter only where they can be cut out of its
text whole: from a block-style mapping, one entry per line, and not
when the frontmatter uses YAML aliases, which would lose their anchor,
or has YAML errors.
Flow-style (`{title: x}`) or aliased frontmatter stays in the block as
it is, `morg_keywords` included.

Reference-style links and images resolve to inline form. A link text
equal to its url becomes an autolink (`<url>`) and restores as a plain
`[[url]]`, the common Logseq bookmark pattern.

A heading inside a list item has no org equivalent (a headline cannot
live inside a list); its text stays as a line of the item, without the
heading level, and reports via `onWarning`. The same goes for a
heading inside a blockquote: Emacs ends a quote block at a headline.

Org ends a nested list at a line indented like its parent item's text;
md would read that line as a lazy continuation of the nested list's
last item. org → md separates it with a blank line.

## Math and footnotes

LaTeX math maps natively (via remark-math): inline fragments (`$x$`,
`\(x\)`) ↔ `$x$`, display fragments (`$$…$$`, `\[…\]`) and
`\begin{…}` environments ↔ `$$…$$` math blocks, delimiters MathJax,
KaTeX, Obsidian and GitHub all understand.

Footnotes convert between GFM (`[^label]` / `[^label]: …`) and org
(`[fn:label]` / `[fn:label] …`) in both directions; org inline
footnotes (`[fn:: text]`, `[fn:label: text]`) normalize to a standard
reference plus a definition hoisted to the document end (anonymous
ones get generated numeric labels).

## Recorded style (md → org, opt-in)

With `recordStyle`, the markdown style the source was written in is
detected and stored as a leading `#+MORG_MARKDOWN_STYLE:` keyword (JSON on one
line), then restored by `org → md` instead of being canonicalized,
which is what makes a consistently non-canonical file a round-trip
identity rather than a one-time reformat (ADR 0004). Explicit
`markdownStyle` options override a record; normalizing drops it,
unless it is itself given `recordStyle`, which re-records the canonical
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

## Presets

`logseq`: page properties: a page's first block of `key:: value`
lines (plain text, an empty `key::` included, keys org reads as
keyword names; below a file-level drawer or a mode line too; a keyword
no `key::` line can hold, such as `#+CAPTION[short]:`, travels as
`morg_keywords` instead) ↔ leading `#+key: value` lines, values verbatim (frontmatter
values as written, `01234` stays `01234`), keys
lower-cased on the way to Markdown (Logseq reads only lower case). Flat
frontmatter entries whose keys are lower case, digits, `_` and `-`
become such keywords too (others would not come back as written), a
sequence written as
Logseq writes it (`tags: [a, b]` → `#+tags: a, b`), so YAML comes back
as a `key::` block after one round trip; what a keyword line cannot
hold (nested maps, line breaks, an item with a comma, a key that is no
keyword name) stays in the frontmatter block, and flow-style or aliased
frontmatter stays there whole. So do keys that act in Emacs or in
export (`todo`, `startup`, `options`, `include`, `setupfile`, `call`,
`begin` and `end`, which open and close a dynamic block,
`bibliography`, `cite_export`, `toc`, `index`, raw export lines such
as `html`, `latex` and `markdown`, `html_*`, `infojs_opt`, `lco` and
the other options of org's own exporters, of ox-hugo and of
org-re-reveal): as frontmatter they were
passive data. The list is a denylist: other third-party exporters'
keys, and export metadata such as `title` or `author`, do map. `tags`
does map, being Logseq's page tags. A `key::`
block maps whole, since that is how an org page's own `#+startup:`
travels through Markdown (ADR 0005): its acting keys act in the org
page, `include:: x` as `#+include: x`. Outline: a page converts block
by block, each block's content one fragment (Logseq parses it as one):
a headline of stars, a space and the content (an empty block as the
bare stars) ↔ a `-` bullet indented one tab per level, continuation
lines two spaces inside it; a code block, table or rule that starts on
the headline line converts as a whole. A block's title is inline text
otherwise: one that looks like org line syntax (`: a`, `** a`, `- a`,
`1. a`, `# a`) stays text, escaped in Markdown (`\*\* a`, `1\. a`) as
mldoc reads it. A known limit: Logseq reads an org title `: a` (or
`:a: b`) as an empty title and a fixed-width line, which morg reads as
text, as Emacs does. `:heading: N` ↔ `- ## …`; a block's
property drawer ↔ `key:: value` lines where it was (on the headline
line if the content starts with it, as Logseq writes a query block); planning lines and
other drawers (`:LOGBOOK:`) stay as written, but for a repeated task's
state log lines, bulleted `- State …` in org and `* State …` in Markdown
as Logseq writes them; an empty drawer is
dropped. A heading outside the bullets is a top-level block (Logseq
writes a page's first block so if it is a heading); other content
before the first bullet is page content. An org block in a Markdown block
(`#+BEGIN_SRC`…`#+END_SRC`, which Logseq reads there too) goes to org as
written, as org→md writes them, except that a quote block's Markdown
content converts (Logseq's `<quote` command writes one). A plain `https://…` link ↔ a
bare url (a bracketed `[[url]]` ↔ `<url>`). An email address stays text, written bare. A `#tag` at the start of a line
stays unescaped (mldoc reads `\#` as plain text, not a tag). Task markers and `[#A]`
priorities stay text; page references `[[page]]` and labeled forms
`[label]([[page]])` ↔ org fuzzy links `[[page][label]]`; block refs
`[label](((uuid)))` ↔ `[[((uuid))][label]]`; `^^highlight^^` markup
and hiccup (`[:div …]`) survive verbatim, emitted unescaped in
Markdown.

`logseq` on one side only (`--input-preset` / `--output-preset`, ADR
0006). Vanilla org is read and written as Logseq org, which it nearly
is: Logseq md ↔ Vanilla org converts as Logseq md ↔ Logseq org does,
but for two headlines Emacs reads apart. An empty block keeps a space
after its stars (Logseq org writes bare stars, text to Emacs). A block
whose first line starts an element that runs on below it (a src or
other block, a table, a list, its property drawer) has that line below
an empty headline: Logseq org puts it on the stars' line, where Emacs
would read it as the title. Translated within org (Logseq org ↔
Vanilla org), only those headlines change; other lines stay as
written, line endings become LF and an empty page stays empty. A
Vanilla headline whose title starts a list running on below it
(`* 3. Why?` with its body indented three spaces) stays as it is on
the way to Logseq org, but comes back with the title below empty
stars. A page whose blocks use a task marker Emacs does not know
(`NOW`, `LATER`, `DOING`, `WAIT`, `WAITING`, `IN-PROGRESS`, `STARTED`,
`CANCELED`, `CANCELLED`) and its own `#+TODO:` lines do not declare
gets `#+TODO: TODO NOW LATER DOING WAIT WAITING IN-PROGRESS STARTED |
DONE CANCELED CANCELLED` after its leading keywords in Vanilla org,
and loses that line in Logseq org. Logseq reads no such line: an own
one stays (a page property to Logseq), with a warning naming the
markers Logseq shows as text. A block's `:collapsed: true` property
is `:VISIBILITY: folded` in Vanilla org, which Emacs folds the
headline by on opening the file; another `VISIBILITY` (`children`,
`content`, `all`) stays, with a warning, as Logseq has none. What
Logseq reads otherwise than Emacs stays as written, with a warning per
kind: a `[[*heading]]` or `[[#custom-id]]` link (labeled or not) and
an `[[id:…]]` link without a label are refs to pages of that name to
Logseq, a `<<<radio>>>` target it misreads, and a `#+KEY:` line below
the first headline (`#+NAME:`, `#+RESULTS:`) it takes for a page
property; org blocks are skipped. Vanilla md has a shape of its own;
Logseq org ↔ Vanilla md:

| Logseq org                                                   | Vanilla md                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| block, nested by level                                       | list item, nested two spaces (`1.` three) further                                           |
| `:heading: N` block, no list above it                        | `#`×N heading; its children start a new list                                                |
| `:heading: N` block in a list                                | `- ## …`                                                                                    |
| `logseq.order-list-type: number`                             | ordered list (`1.`, `2.`, …)                                                                |
| `TODO` / `DONE`                                              | `- [ ]` / `- [x]`                                                                           |
| `NOW` `LATER` `DOING` `IN-PROGRESS` `WAIT[ING]`              | `- [ ] MARKER …` (Logseq shows them unchecked)                                              |
| `CANCELED`                                                   | text (Logseq shows no checkbox)                                                             |
| `SCHEDULED:` / `DEADLINE:`                                   | `scheduled::` / `deadline::` lines in the item (`orgismKeys` names), one planning line back |
| property drawer                                              | `key:: value` lines in the item                                                             |
| `collapsed`, drawers (`:LOGBOOK:`)                           | dropped, with a warning                                                                     |
| `#+BEGIN_QUERY`                                              | ` ```query ` code block                                                                     |
| page properties (lower-case `#+key:`)                        | plain frontmatter keys; acting ones stay `morg_keywords`                                    |
| page and block refs, macros, `#tag`, `[#A]`, hiccup, `^^…^^` | as Logseq md writes them, as text                                                           |

A block's title is inline text here too, a table or a rule on the
headline line aside (see above). Reading Vanilla
md, as Logseq reads a file it did not write: a heading is a block,
nesting by heading level, the text below it up to a list its content;
other text after a list is a block of its own; a list on an item's
first line is its content (Markdown has no item whose content opens
with a list and that has children besides). A reference link becomes
inline before the page splits, its definition goes, and a footnote's
definition moves to the block of its first reference. With Obsidian on
the other side, a page ref and a wikilink map onto each other
(`[[Page][label]]` ↔ `[[Page|label]]`).

Translated within Markdown (Logseq md ↔ Vanilla md), the outline maps
as in the table, a block's content stays as written but for its org
blocks: a source or example block is fenced, a quote quoted, a query a
`query` code block (and back: a `query` code block is a query block);
others stay. Page properties are flat frontmatter keys, every key
(no org is in the way to act on one); from Vanilla md, flat entries
are page properties and the rest stays frontmatter. A rule after a
Vanilla list is a block of `---`, a block's content loses the
indentation all its lines share, and text after a list is read from
its own column. Obsidian md translates as Vanilla md does, but for its
links: `[[Page|label]]` (in a table `[[Page\|label]]`) ↔
`[label]([[Page]])` outside code (`[[Page]]` is both's); an embed's
size (`![[image.png|300]]`) stays. Obsidian md → Vanilla md or Logseq md writes
a `%%comment%%` as an HTML comment (`<!--comment-->`) and an inline
footnote `^[note]` as a footnote, numbered on from the page's own, its
definition at the end; their delimiters count outside code, math and
HTML only, but what they hold may be code. The way
back has nothing to do: Obsidian reads both. Wikilinks and embeds
(`[[Page]]`, `![[image.png]]`) stay in Vanilla md, which cannot
resolve a note's name to its file without the vault.

`obsidian`: wikilinks `[[Page]]` / `[[Page|alias]]` ↔ org fuzzy links,
emitted unescaped in Markdown, except for the alias pipe inside a
table cell, written `\|` as Obsidian does, since a bare `|` would
split the cell.
