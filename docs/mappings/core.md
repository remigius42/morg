# Core structure

Both directions: headings, paragraphs, bold/italic/strikethrough,
links, lists (nested, ordered, mixed), code (inline, fenced/src and
example blocks; a src block's switches and header arguments ↔ the
fence's meta after the language), blockquotes/quote blocks, and horizontal rules
(md `---` ↔ org `-----`). Hard line breaks map md `\` (or two trailing
spaces) ↔ org `\\`. Markdown is parsed and serialized with GFM
enabled.

## GFM alerts

GFM alerts ↔ special blocks: `> [!NOTE]` ↔ `#+begin_note`, any type
(GitHub renders NOTE, TIP, IMPORTANT, WARNING and CAUTION), Markdown
writing it upper case, org lower case. The marker line is a paragraph
of its own (`> [!NOTE]`, `>`, then the body); md → org also reads the
body on the next line, as GitHub writes it. A title on the marker line
↔ the block's parameters, as written (`> [!TIP] Stretch first` ↔
`#+begin_tip Stretch first`); a title is source text, so a quote whose
marker line ends inside markup or holds a reference or footnote stays
a quote. A type of other characters than letters,
digits, `_` and `-`, or not starting with a letter, stays org text, as
do `query` blocks (a query is no Markdown) and the names of org's own
blocks, which are no special blocks (`center`, `comment`, `example`,
`export`, `quote`, `src`, `verse`): Obsidian's `> [!example]` callout
stays a quote, its marker (and fold, `[!example]-`) unescaped. An org quote whose text starts
with an alert's marker stays a quote, the marker escaped (`\[!NOTE]`).
Known limitations: GitHub renders only those five types, and shows an
alert with a title, in a list item or in another quote as a plain
quote (pandoc's `gfm` reads no alert with a title either); a Logseq
page in Vanilla md is a list, so its alerts are list items. GitHub
reads a marker after decoding its escapes, so it shows an org quote
starting with `[!NOTE]` as an alert. A type comes back lower case
(`#+begin_Note` → `#+begin_note`). A callout of a type of other
characters than letters, digits and `_.:|-` (`> [!a/b]`) comes back
with its marker escaped.

## Images

Org has no dedicated image syntax; links to image files map to
md images, alt text ↔ link description. Image title attributes
(`![alt](url "title")`) are dropped by design (reported via
`onWarning`): org links have no title slot, and an inline construct
has no sensible `morg_` property anchor (ADR 0002 reserves properties
for metadata-shaped md-isms). An image's size, an `#+ATTR_HTML:
:width 300` line above an image link alone in its paragraph (`:height`
too), stays a verbatim line; spelled in HTML (`images = "html"`, ADR 0007) the two become `<img src="…" alt="…" width="300">`, read back
where `interpretHtml` reads images. An `<img>` below text in a list
item takes a blank line, as HTML of its kind cannot interrupt a
paragraph.

## Links

A md url without a scheme (`notes.md#Some%20Heading`,
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

Links within the file: an org link to a headline (`[[*Some Heading]]`,
or a fuzzy `[[Some Heading]]` that names one) links the slug GitHub
gives the heading (`[Some Heading](#some-heading)`), so it works where
Markdown renders; a link to a `<<target>>` or a `#+NAME:` links
`#name`. md → org looks an anchor up in the document: a target's or
name's is a fuzzy link (`[[name]]`), a heading's slug a heading link
(`[[*Some Heading]]`), so a Markdown author's `#getting-started` finds
its heading in Emacs; any other anchor is a custom ID link
(`[[#custom-id]]` ↔ `#custom-id`). Link text equal to the heading or
name is no description. Known limitations: of two headings of one
name, org finds the first (`#a-1` comes back as `[[*A]]`); a
`<<target>>` or `#+NAME:` equal to a heading's slug takes its anchor
(`* Setup` and `#+NAME: setup`: `[[*Setup]]` comes back as
`[[setup][Setup]]`, which org follows to the named element); a fuzzy
link to a name the file does not hold stays a relative path, a `file:`
link on the way back.

## Escaping

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
reads as just one [passthrough](org-isms.md#verbatim-passthrough)
element is org text, and stays
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

## Tables

GFM ↔ org, including column alignment via org `<l>/<r>/<c>`
cookie rows. `table.el` tables travel as `table.el`-tagged fenced
blocks and are restored verbatim. An escaped `\|` in a cell becomes
org's `\vert{}` entity (org has no escaped `|`), which comes back as
`\|`. In inline code, where the entity would be literal, it becomes the
lookalike `∣` (U+2223) instead and reports via `onWarning`: the org
file then holds a different character (a command copied from it, an
export). org → md turns `∣` in code in a table cell back into `\|`, an
author's own included.

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
Org ends a definition only at the next one, a headline or two blank
lines, so md → org writes two blank lines between a definition and
what follows it, unless that is a definition or a headline.
