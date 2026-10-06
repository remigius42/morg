<!-- markdownlint-disable MD024 -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- An image's size has a Spelling, `images` (ADR 0007): `"html"`
  writes an image link sized by `#+ATTR_HTML: :width`/`:height` as
  `<img src alt width height>` and reads that `<img>` back; under
  `"markdown"`, the default, the attribute line stays verbatim.
- Obsidian md reads an image's size (`![alt|300](image.png)`,
  `|300x200`) as its `#+ATTR_HTML: :width`/`:height` line and writes
  it back, for an image alone in its paragraph outside a list;
  translating Obsidian md to or from Vanilla md turns one into the
  other. An embed's size (`![[image.png|300]]`) stays as written.
- Logseq's image size (`[[image.png]]{:width 300}`, in Logseq md
  `![alt](image.png){:width 300}`, `:height` too) is the image's
  `#+ATTR_HTML:` line in Vanilla org and back, for an image line below
  a block's title that is a paragraph of its own. A block's title is
  a headline, which org cannot size, so a title image keeps its size.

### Changed

- **Breaking:** options are named by format and side (ADR 0007). The
  config's `[markdownToOrg]` and `[orgToMarkdown]` sections are gone,
  with an error naming their replacements: `[markdown]`,
  `[markdown.input]`, `[markdown.output]` and `[org.output]`.
  `markdownStyle` is `[markdown.output.style]`, `recordStyle` is
  `[org.output] recordMarkdownStyle` (CLI `--record-markdown-style`),
  and the library options are renamed to match (`style`,
  `recordMarkdownStyle`).
- **Breaking:** `useHtml` and `interpretHtml` give way to a Spelling
  per construct (`definitionList`, `underline`, `superscript`,
  `subscript`): `"markdown"` or `"html"`, set for both sides in
  `[markdown]` or per side. The library's `spelling` and per-construct
  `interpretHtml` replace them; CLI `--html` replaces
  `--interpret-html` and sets both sides.
- **Breaking:** org descriptive lists are written as Markdown
  definition lists (`term` / `:   definition`) rather than as their
  org text (`- term :: definition`), and read back from them. A
  Markdown list item holding `::` stays a list item, and a
  fixed-width line's `:` is escaped (`\: text`), as a line below text that starts with
  a colon now starts a definition. A descriptive list nested in a list
  item does not survive a round trip as one (a known limitation of
  the Markdown parser): it comes back as the item's text.
- Translating Markdown honours the Markdown options, as normalizing
  does: a block holding a construct they concern is converted on its
  own, in the Spelling they name; the rest stays as written.
- The Web UI's options are grouped by the side they act on, showing
  only those of the sides the conversion has (normalizing Org goes
  through Markdown, so its HTML options show too), and a compact table
  sets each construct's HTML reading and Spelling.

### Fixed

- An org descriptive list no definition list can hold (an item with a
  checkbox, or without a term) survives a round trip again: its
  `- term :: definition` text is written below a
  `<!-- morg_descriptive_list -->` comment, which reads it back as
  descriptive; it came back a plain list.
- Spelled in HTML, such a list is written the same way: as a `<dl>`, it
  lost its checkboxes and gained empty terms. So is one whose
  definition holds blocks (an image, a nested list, a second
  paragraph), which a `<dl>` dropped.
- Reading `<sup>` or `<sub>` as org (`interpretHtml`) keeps the HTML
  where a blank precedes it (`x <sup>s</sup>`): org reads a script
  only after a non-blank character, so it came back as the text
  `^{s}`.
- List item text after a quote or table (`- a\n  > b\n\n  c`) stays
  apart from it: org → md wrote no blank line between them, so
  Markdown read the text into the quote, gaining a `>` each round
  trip, or as a table row.
- HTML in a list item (org's `#+begin_export html`) stays an HTML
  block in Markdown, and so does text after it: org → md kept the
  item's indentation in the HTML, which Markdown then read as text.
- HTML in a Markdown list item keeps its own indentation in org: md →
  org lost up to the item's indentation from each line, each round
  trip.
- Markup right after other markup (`` `a`*,* ``) comes back from org
  without a stray `&#xNAN;` between them.
- Empty nested list items right below an item's text (`- a\n  -`)
  survive org → md: Markdown read the text over a lone `-` as a
  heading, losing one item each round trip.
- An org `#+OPTIONS:` line keeps an author's `^:{}` where it is: org →
  md took it out from anywhere, md → org put it back last.
- An indented code line org escapes with a comma (`,* x` after the
  indentation, in a src or export block) keeps its indentation in
  Markdown: uniorg dropped it with the comma.
- A Markdown code block without a language, or an HTML block, whose
  line org would read as a headline or keyword (`* x`, `#+end_example`)
  gets org's comma escape in its example or export block; that line
  ended the block or became a headline. Org → md drops the comma of an
  example block's line too, which uniorg left in (in a CRLF file
  too), but keeps the escapes
  of a block in a drawer or special block, which travels as org text.
- Adjacent Markdown tables stay apart in org: md → org wrote them
  with no blank line between them, which org reads as one table.
- An org table keeps its `#+NAME:`, `#+CAPTION:`, `#+RESULTS:` (an
  empty one too) and other affiliated keywords, and its `#+TBLFM:`
  formulas, as lines around the Markdown table; both were lost
  without a warning (the keywords by uniorg), in a CRLF file too.
  Several `#+TBLFM:` lines stay apart: uniorg joined them into one.
- An org link to a `//` path keeps its `%` as written: org → md
  percent-encoded it, md → org read the scheme-relative url as it is,
  so `%25` gained a `25` each round trip.
- Org keyword lines (`#+AUTHOR: Jan <jan@x.org>`, `#+CALL:`) go back
  to org as written: md → org read them as Markdown, so an address or
  url became a link nested once more each round trip, and escaped them
  (`\n:nil` in `#+OPTIONS:` gained a zero-width space).
- A headline's property values that Markdown may read as syntax (a
  url, `*`, `_`) are written below a `<!-- morg_properties -->`
  comment, and md → org takes the lines below it back as written; it
  read them as Markdown. Unmarked `key:: value` lines below a heading
  are Markdown, as a person writes them (an Obsidian Dataview field),
  and convert as before.
- An org element written verbatim to Markdown (fixed-width lines, a
  drawer, a special block) with keywords in front (`#+RESULTS:`) goes
  back to org as written: md → org read it as Markdown, so a babel
  result's `` `x` `` became `~x~`, its trailing spaces a line break.
- Markup in an org block or drawer written verbatim to Markdown
  (`*b*` in a `#+begin_note`) stays org markup: md → org escaped it
  with a zero-width space, which org then read as text.
- A definition's text after its nested list (`- T :: a\n  - b\n  c`)
  stays apart from the list: org → md wrote no blank line between
  them, so Markdown read the text into the list's last item.
- A Markdown list item's paragraphs stay apart in org: md → org wrote
  them with no blank line between them, which org reads as one
  paragraph.
- Fixed-width lines and keywords in an org list item go back to org as
  written: org → md wrote them into the item's text, where md → org
  read them as text (`: git clone git@x.org:a` gained a zero-width
  space and a mail link). They are a paragraph of their own now, set
  apart by blank lines, which makes the Markdown list loose.

## [0.10.1] - 2026-10-04

### Fixed

- Obsidian md → org keeps an embed's size (`![[image.png|300]]`); it
  became a link description (`![[image.png][300]]`).
- Obsidian org → md writes an embed's `!` unescaped; `\![[image.png]]`
  was a `!` and a link to Obsidian.
- Translating Markdown to or from Logseq md counts a tab in a list
  item's indentation to its tab stop. A fence indented with spaces among
  tab-indented lines drifted on each trip, and a tab-indented item's
  fence could become indented code.

## [0.10.0] - 2026-10-04

### Removed

- **Breaking:** the `morg normalize` subcommand. One format on both
  sides is enough: with one preset it normalizes (`--from org` and
  `--to org`, or `--input notes.org --output notes.org`), with two it
  translates.

### Added

- `translateOrg(org, { inputPreset, outputPreset })`: Logseq org ↔
  Vanilla org within org, changing only the headlines the two write
  differently (an empty block's space, a first line that starts an
  element) and keeping every other line as written (ADR 0006 §4
  amended). Logseq's task markers (`NOW`, `DOING`, `WAITING`, …) are
  declared for Emacs in a `#+TODO:` line, dropped again on the way
  back; an own `#+TODO:` line, which Logseq ignores, warns of the
  markers Logseq shows as text. A collapsed block is folded for Emacs
  (`:collapsed: true` ↔ `:VISIBILITY: folded`). Emacs syntax Logseq
  misreads (`[[*heading]]` links, `<<<radio>>>` targets, keyword lines
  below the first headline, …) stays, with a warning.
- `translateMarkdown(md, { inputPreset, outputPreset })`: Logseq
  Markdown ↔ Vanilla Markdown within Markdown, blocks ↔ list items and
  headings with their meta as before, page properties ↔ flat
  frontmatter, a block's org blocks ↔ fences, quotes and `query` code
  blocks; other content stays as written. Obsidian Markdown ↔ Logseq
  Markdown too, an aliased wikilink ↔ a labeled page ref, and
  Obsidian Markdown → Vanilla Markdown: a `%%comment%%` becomes an
  HTML comment and an inline footnote a footnote (also on the way to
  Logseq Markdown); wikilinks stay, as resolving a note's file needs
  the vault. `markdownStyle` (CLI `--bullet`, `--emphasis`, …) rewrites
  only the markers it names; Logseq Markdown keeps its `-` bullets.
- Web UI: two dialects of one format translate (Input: Markdown
  (Logseq), Output: Markdown); a translated file is saved under its
  dialect (`page.vanilla.md`). Changing the input's format still moves
  the output to the other format.
- CLI: one format on both sides with two presets translates
  (`morg --input-preset logseq --input page.md --output out.md`); it
  was an error.
- Vanilla org → Logseq Markdown warns of `[[*heading]]` links, which
  Logseq reads as refs to pages of that name.

### Changed

- **Breaking:** Node.js 24 or later (`engines.node` was `>=20`, which
  nothing tested; Node 20 is end-of-life).

## [0.9.2] - 2026-10-04

### Fixed

- Logseq org ↔ Logseq Markdown reads a block's title as inline text: a
  title that looks like org line syntax (`: a`, `- a`, `1. a`, `# a`)
  was converted as a fixed-width line, a list or a comment, and a
  `: a` title holding markup grew with each round trip. A table or a
  rule on the headline line stays one, which Logseq org → Vanilla
  Markdown now does too.

## [0.9.1] - 2026-10-04

### Fixed

- An empty Markdown heading becomes an org headline with a space after
  its stars, as Emacs needs to read it as one; it was written as bare
  stars, which Emacs and morg read as text.
- Logseq Markdown → Vanilla org writes an empty block as a headline
  with a space after its stars, which Emacs reads as one, instead of
  Logseq org's bare stars.
- Logseq Markdown → Vanilla org writes a block whose first line starts
  a src block, a table, a list or its property drawer with that line
  below an empty headline: on the stars' line, as Logseq org writes it,
  Emacs read it as the title and cut the element off (ADR 0006,
  amended).
- A multi-line HTML comment keeps an empty first or last line as an
  empty org comment line instead of losing it, so such a
  comment comes back as it was.

## [0.9.0] - 2026-10-03

### Added

- `inputPreset` and `outputPreset` conversion options: the dialect the
  input is read in and the one the output is written in, Vanilla when
  left out (ADR 0006). `preset` still sets both, leaving a side Vanilla
  whose format it has no dialect for; a side preset without one throws,
  as does `preset` together with another side preset, and `normalize*`
  with different presets per side.
- `--input-preset` / `--output-preset` and `inputPreset` /
  `outputPreset` in `morg.toml`, and the preset name `vanilla`. Each
  side resolves on its own: side flag, `--preset`, side key, `preset`;
  `preset` next to a different side preset in one place is an error.
- Logseq org → Vanilla Markdown (`--input-preset logseq`): blocks become
  a nested list, a heading block a heading whose children start a new
  list, numbered blocks an ordered list. Task markers render as Logseq
  shows them (`- [ ]`, `- [x]`, `- [ ] LATER …`); planning and
  properties become `key:: value` lines in the item, under the
  `orgismKeys` names; `collapsed` and drawers are dropped with a
  warning. A block's title stays inline text, as Logseq reads it, even
  where it looks like org line syntax (`: a`, `- a`). After a heading
  block, Markdown has no way back to the top level, so a later
  top-level block reads back as the heading's child. Logseq's inline
  syntax is carried as Logseq Markdown writes it, as text a return trip
  restores: page and block refs
  (`[[Page]]`, `[label]([[Page]])`), macros (`{{video …}}`), tags,
  priorities, hiccup, highlights; a query block becomes a `query` code
  block.
- Vanilla Markdown → Logseq org (`--output-preset logseq`), as Logseq
  reads a file it did not write: a list item is a block, its nested
  list its children; a heading is a block nesting by level, the text
  below it its content; other text after a list a block of its own.
  Task items, `key:: value` lines and ordered lists come back as task
  markers, planning, properties and numbered blocks. Reference links
  become inline before the page splits into blocks, and a footnote's
  definition moves to the block of its first reference. Logseq's syntax
  carried in Vanilla Markdown (page and block refs, macros, a `query`
  code block) is Logseq's again.
- Logseq Markdown ↔ Vanilla org: Vanilla org is read and written as
  Logseq org, which it is, page properties as leading keywords.
- Logseq page properties ↔ plain Vanilla Markdown frontmatter
  (`title: P`), as Markdown tools read metadata; a keyword that acts in
  Emacs stays in `morg_keywords`.
- Web UI: an Input and an Output select, each naming a format and its
  dialect (Org, Org (Logseq), Markdown, Markdown (Logseq), Markdown
  (Obsidian)), above their text areas, replace the direction and preset
  selects. The direction follows from the two; the same on both sides
  normalizes, and says so; a dialect change within one format is not
  offered; ⇄ swaps the sides. The demo follows the input; sides
  remembered by 0.8.0 are restored.
- Obsidian ↔ Logseq: an Obsidian wikilink and a Logseq page ref map
  onto each other (`[[Page|label]]` ↔ `[[Page][label]]`).

### Changed

- **Breaking.** A `FragmentConverter` takes a third argument, the
  preset whose syntax a Vanilla side carries. `Preset.convertOrg` and
  `Preset.convertMarkdown` get a third argument, the conversion's
  context (exported as `ConversionContext`): the side the preset is on
  (`both`, `input` or `output`), `onWarning` and `orgismKeys`.
- **Breaking.** `Preset` holds one dialect per format, each read in
  one direction and written in the other (ADR 0006):
  `markdown: { read: { mdast, org }, write }` and
  `org: { read, write }`, typed `MarkdownDialect` and `OrgDialect`.
  `applyToMdast`, `applyToUniorg` and `extractFromUniorg` are gone. The
  built-in presets convert as before.

## [0.8.0] - 2026-10-03

### Added

- `Preset.convertOrg(org, convert)` and
  `Preset.convertMarkdown(markdown, convert)`, optional hooks that take
  a whole conversion over, for a dialect whose documents are an outline
  of fragments; `convert` runs the core on one fragment (recording no
  Markdown style: a fragment's style is the preset's).
- The Web UI demo also shows a quote, a nested ordered list and a src
  block switch.
- The Web UI offers a Logseq demo page, in Logseq org or Logseq
  Markdown, while the Logseq preset is selected; an untouched demo
  follows the preset as it follows the direction.

### Changed

- **Breaking.** Logseq preset: a page converts as Logseq's outline of
  blocks. Org headlines ↔ `-` bullets indented one tab per level, an
  empty block (bare stars) ↔ `-`, `:heading: N` ↔ `- ## …`, a block's
  property drawer ↔ `key:: value` lines; a block's content converts as
  one fragment, so a code block or table that starts on the headline
  line stays whole. Blocks used to become paragraphs below the nearest
  heading, which flattened every level below it. `logseq()` takes no
  options anymore (`nestUnderHeadings` is gone).

### Fixed

- A src block's switches and header arguments
  (`#+begin_src python -n :results output`) travel as the Markdown
  fence's meta (` ```python -n :results output `) instead of being
  dropped both ways.
- A block or drawer kept as org text in Markdown (special, verse,
  center blocks, `:LOGBOOK:`, …) no longer falls apart on the way back
  when its lines read as Markdown syntax: a blank line followed by an
  indented line became a code block, a `#` line a heading, a `-` line a
  list, and
  the round trip did not converge.
- Logseq preset: a block whose content starts with its properties
  (`** :PROPERTIES:`, as Logseq writes a query block) keeps them as its
  `key::` lines instead of growing an `:END:` line per round trip.
- Logseq preset: a repeated task's `:LOGBOOK:` state lines take the
  bullet Logseq writes in each format, `- State …` in org and
  `* State …` in Markdown.
- Logseq preset: an org plain link (`https://…`) stays a bare url in
  Markdown, as Logseq writes it, and comes back plain instead of as
  `[[https://…]]`.
- Logseq preset: an email address stays text, written bare in
  Markdown as Logseq does, instead of coming back as a `mailto:` link.
- Logseq preset: a block that starts with a tag (`#meeting`) keeps it
  a tag in Markdown; it was written `\#meeting`, which Logseq reads as
  plain text.
- Logseq preset: an org block written in a Markdown block
  (`#+BEGIN_SRC`…`#+END_SRC`, which Logseq reads there too) goes to org
  instead of as escaped text that changed on every round trip; the
  Markdown content of a quote block converts.

## [0.7.0] - 2026-10-02

### Added

- Logseq preset: page properties map both ways. A page's first block of
  `key:: value` lines and flat frontmatter entries become the leading
  `#+key: value` lines Logseq reads as page properties of an org page,
  and come back as a `key::` block, values as written. Frontmatter keys
  that act in Emacs (`todo`, `include`, `setupfile`, …) stay inert in
  the frontmatter block. The block used
  to become an invalid headline (`* title:: …`).
- `Preset.applyToMdast(mdast, markdown)`, an optional hook that runs
  before the generic md → org transform, with the Markdown source at
  hand.

### Changed

- **Breaking output change.** YAML frontmatter no longer becomes org
  keywords (`tags: [a]` → `#+TAGS: a`); it travels verbatim in a
  marked comment block, `#+begin_comment morg_frontmatter`, inert in
  Emacs and in export. Upper-cased keys used to collide with keywords
  that act: `#+TAGS` declares the tag vocabulary, `#+TODO` redefines
  the TODO keywords, `#+INCLUDE` pulls a file into exports (ADR 0005).
  `transformMdastToUniorgAst` returns the block as a raw text node
  instead of keyword nodes, which `transformUniorgAstToMdast` reads
  back; a uniorg tree parsed from org text cannot carry the block's
  marker (uniorg drops it), so pass that text as its `org` option, or
  convert files with `convertOrgToMarkdown`.
- **Breaking output change.** An org file's leading keywords
  (`#+TITLE`, `#+STARTUP`, …) no longer become plain frontmatter keys;
  they travel as a `morg_keywords` frontmatter entry and come back as
  keywords, so `#+STARTUP` keeps its effect. An entry a keyword line
  cannot hold (a line break in the value, a key org does not read as a
  keyword name) stays in the frontmatter block instead.
- Migration: files written by 0.6.0 and earlier carry their frontmatter
  as keywords and now read as org-native keywords (`morg_keywords`).
  That converges, but Markdown tools no longer see `title`. Re-convert
  them from the Markdown source, or move the keywords into a
  `morg_frontmatter` block by hand.

### Fixed

- A dual affiliated keyword keeps its second value through Markdown:
  `#+CAPTION[short]: long` used to come back as a plain `#+CAPTION:`
  with the short caption glued onto the long one, and
  `#+RESULTS[hash]: …` as two separate lines.
- An Emacs mode line (`# -*- mode: org -*-`) stays on the first line
  through Markdown, where Emacs reads it, instead of landing below the
  frontmatter.
- A file-level property drawer (org-roam's `:ID:`) no longer turns into
  `ID:: abc` text in Markdown and stays text on the way back, which
  broke org-roam links. It travels as a `morg_properties` frontmatter
  entry and comes back as the drawer leading the file.
- A leading `#+CAPTION:`, `#+NAME:` or other keyword org attaches to
  the element below it (`#+SOURCE:` is an alias of `#+NAME:`) no longer
  comes back from Markdown attached to the next paragraph or keyword;
  md → org keeps it apart with a blank line.
- A literal backslash before a letter in Markdown text no longer turns
  into LaTeX or a symbol through org: a path like `C:\Users\me` used to
  come back as `C:$\Users$$\me$`, `\alpha` as `α`.
- A `|` in inline code in a Markdown table cell (`` `a \| b` ``) no
  longer splits the org table cell: it becomes the lookalike `∣`
  (U+2223) in org, reported via `onWarning`, and `\|` again in
  Markdown.
- An ordered list starting at `0.` keeps its start through org → md
  instead of being renumbered from `1.`.
- A hard line break inside a list item no longer comes back from org
  with the next line's indentation as literal leading whitespace
  (`&#x20;`).

## [0.6.0] - 2026-09-26

### Changed

- Conversion is slower than in 0.5.0: md → org takes about 1.6 to 2.8
  times as long, org → md about 10 % longer. The escapes below have to
  check how org reads the output, which takes org parses of the text
  concerned; org → md guards `_.` lines and drops the escapes again.
  A performance check in CI now keeps it from growing unnoticed.

### Fixed

Mostly found by round-tripping a real Obsidian vault, the rest by code
review and fuzzing; each of these silently changed text.

- Markup touching a word character (`` `x`s ``, `foo**bar**baz`) no
  longer comes back with literal markers. Org only reads markup next to
  whitespace or punctuation, so md → org now separates the two with a
  zero-width space, the org manual's escape character, and org → md
  drops it again.
- Literal text org would read as markup, such as the path `/etc/` or an
  escaped `\*b\*`, stays literal instead of turning italic or bold,
  also when another inline node sits between the markers
  (``\*b `x` c\*``).
- Relative links and images (`[t](notes.md#Some%20Heading)`) become
  org `file:` links (`[[file:notes.md::Some Heading][t]]`) and come
  back as the same Markdown links. They used to become bare org paths,
  which org reads as a heading search rather than a file, so Emacs
  would not open them and the `obsidian` preset turned them into
  wikilinks. A path holding a literal `%5B`, `%5D` or `::` keeps it
  instead of pointing at another file, and an org `file:` path holding
  `#` or `%` (`[[file:C# notes.md]]`) comes back pointing at that file,
  not at `C`.
- A heading inside a list item keeps its text as a line of the item
  and reports via `onWarning`, instead of silently coming back as
  literal `\*\* …`: org has no headline inside a list.
- A paragraph line that starts like org line syntax, such as an
  escaped `1\.`, `\-` or `\#`, or a lazy continuation line, stays text
  instead of turning into a list item, headline, comment or table. This
  includes a line starting with a footnote reference (`[^1] text`,
  which org reads as a footnote definition), one following a nested
  list or code block inside a list item, one inside bold or a link
  text spanning two lines, one ending in a bare bullet (`1.`), and one
  in a `logseq` block below its first line. The same goes for line
  syntax spanning lines (an escaped `\#+begin_src` … `\#+end_src`) or
  depending on the heading above (`SCHEDULED: <…>`). A paragraph that
  is exactly one of the org constructs morg writes into Markdown
  verbatim (drawers, fixed-width lines, clocks, …) still comes back as
  org.
- A line starting `_.` or `_)` converts in both directions: uniorg,
  morg's org parser, took it for a list bullet and failed on the whole
  document, or, when a list followed, silently dropped the line. Org
  reads it as text, and so does morg now.
- List item text after a nested list (`- a\n  - b\n\n  c`) stays in
  the outer item instead of moving into the nested one on the next
  round trip: org → md keeps the blank line Markdown needs there.
- A literal `\[fn:1]` in Markdown text stays text instead of becoming a
  footnote reference.
- Inline code holding a `~` that ends org code early (`` `a~ b` ``)
  becomes org `=a~ b=` instead of breaking the rest of the line. Code
  that a `=` would end early too stays plain text and reports via
  `onWarning`.
- `#+OPTIONS: ^:nil` is honored on org → md: `a_b` stays `a_b`
  instead of becoming `a\_{b}`, and the option stays.
- Bold, italic or strikethrough spanning more than two lines keeps its
  markup: org markup spans at most two lines, so its line endings
  become spaces, as Markdown renders them anyway.
- A heading inside a blockquote keeps its text as a line of the quote
  and reports via `onWarning`: Emacs ends a quote block at a headline.
- A fenced code block inside a list item keeps its indentation in both
  directions. md → org used to shrink the code's own indentation by up
  to the item's (`if x:\n    y()` lost two spaces), and org → md added
  the item's indentation to every line.
- An escaped `\|` in a Markdown table cell becomes org's `\vert{}`
  entity instead of splitting the cell, and comes back as `\|`.
- Bare underscores and carets (`my_notes_2021.md`, `x^y`, also right
  after markup or a link: `**a**_b`, or in an `obsidian` wikilink alias:
  `[[a_b.md|a_b]]`) are no longer read as org sub/superscripts. md → org adds `^:{}` to `#+OPTIONS:` when the text
  needs it; org → md honors it in a top-level `#+OPTIONS:` and consumes
  it where the text needs it, so an author's own `options: ^:{}` stays.
- Inline code spanning three or more lines converts to org; its line
  endings (LF, CRLF or CR) become spaces, which is how CommonMark
  renders them anyway.
- Inline code with whitespace at either end, as a padding typo easily
  leaves, converts to org instead of breaking the rest of the
  paragraph: org markup may not start or end with whitespace, so the
  whitespace moves just outside the code. Whitespace-only code stays
  plain text and reports via `onWarning`.
- An image with an anchor (`![a](i.svg#part)`) comes back as an image
  instead of a plain link.
- A space between text and markup inside an org table cell is kept;
  only the cell's alignment padding is trimmed.
- With the `obsidian` preset, an aliased wikilink in a table cell is
  written `[[Page\|alias]]`, as Obsidian does, instead of splitting the
  cell.

## [0.5.0] - 2026-09-19

### Added

- `morg --help`, `morg -h` and a bare `morg` print usage: the
  `normalize` command, every flag with its argument and a one-line
  description, and a few worked examples. `morg --version` prints the
  installed version. A bare invocation previously failed on formats it
  could not determine, which told a first-time reader nothing about
  what the CLI accepts; there was no way to ask at all.

  The help text is rendered from the same table the parser dispatches
  on, so it cannot document a flag that does not exist or omit one that
  does.

### Changed

- The site names the npm package and links it. The landing page says
  morg is also a CLI and a library, published as `@remigius42/morg`,
  and shows the `npx` line that runs it without an install; both pages
  carry an npm link in the nav beside GitHub. Until now the only route
  from the Web UI to the package was the repository, which documents it
  but does not hand it over.

  The nav had fit 320px exactly, so a fourth item would have put the
  whole page into a horizontal scroll: the nav lists now wrap, which
  costs a second row on the narrowest phones and leaves every wider
  viewport as it was.

### Fixed

- An unsupported format names the value it rejected, as in
  `Unsupported format 'notes.md'`, rather than only the two it
  accepts, and a value that has a file extension is answered with the
  likely correction: `--from` and `--to` take a format name, and the
  file belongs to `--input` or `--output`. They sit beside each other
  and read alike, so a file name in the wrong one is an easy mistake that
  the old message left the reader to find unaided. Failures that come
  from the invocation now also point at `morg --help`.

## [0.4.0] - 2026-09-19

### Added

- morg is distributed on npm as `@remigius42/morg` — the bare `morg`
  name is squatted — so `npx @remigius42/morg` runs the CLI without an
  install. It ships as a single ESM build carrying its own type
  declarations, with dependencies declared rather than bundled: the
  production tree is 89 packages and 13 MB, which `npx` fetches once and
  then caches, whereas inlining it would hand library consumers a frozen
  private copy of unified and remark that they could neither deduplicate
  nor upgrade. `exports` now names its `types` so `node16` and `bundler`
  resolution find the declarations outright instead of falling back to
  finding them beside the JavaScript. No compiled binaries: anyone with
  Node is already covered, and a `bun build --compile` matrix would add
  a second runtime and macOS notarization for the rest.

- `@types/mdast` is a runtime dependency rather than a dev dependency:
  the declarations for the exported `transformMdastToUniorgAst` and
  `transformUniorgAstToMdast` name mdast's `Root`, so a consumer whose
  package manager does not hoist it — pnpm's strict layout, Yarn PnP —
  could not resolve `mdast` and lost the types for the whole module.

- Published versions carry a provenance attestation, so what is on the
  registry can be traced back to the commit and the workflow run that
  built it, and each has a GitHub Release whose notes are this file's
  section for that version.

- Opt-in `recordStyle` (`--record-style`, `[markdownToOrg]`, Web UI
  checkbox) records the Markdown style a source was written in — bullet,
  emphasis, strong, fence and thematic-break markers, and the rule's
  length where it is longer than remark's own `---` — as a leading
  `#+MORG_MARKDOWN_STYLE:` keyword, and `org → md` restores it. A file
  whose markers are used consistently now survives the round trip
  untouched instead of being reformatted once. This does not weaken
  convergence: the recorded output is still a fixed point in both
  directions, and what grows is the set of inputs the round trip
  already leaves alone.

  Recording is document-wide, so a marker used two ways is skipped and
  reported via `onWarning` rather than guessed at, and per-node style
  (mixed bullets on sibling lists, reference vs. inline links) stays out
  of scope — an inline node has no anchor to hang a record on, and a
  positional side-table would desynchronize the first time the org file
  is edited by hand. Opt-in because the keyword is a morg-specific line
  in the format the user keeps and reads. `morg normalize` drops the
  keyword, since canonical form is the whole point of normalizing —
  unless it is itself given `--record-style`, which re-records the
  canonical form's own markers.
  See [ADR 0004](docs/adr/0004-record-source-markdown-style.md).

- The embed page reports its content height to the page that frames it,
  as a `{ type: "morg:height", height }` message, so a host can size the
  iframe to the converter instead of guessing at it. Every guess is
  wrong in one of two ways — too short leaves a scrollbar inside the
  frame, right next to the textareas' own, and too tall leaves dead
  space — and no host can guess better, because the height is the
  converter's to know: expanding Options or Config roughly doubles it,
  and the input and output stack below 768px. The message carries a
  number describing the page's own layout, never the document being
  converted.

### Changed

- The converter page now follows that message with its own frame, which
  had been fixed at 75% of the window: the converter no longer scrolls
  inside a page that scrolls, and opening Options no longer has to be
  read through a slot two thirds the size of what it opened. The 75%
  stays as the height a browser that never delivers the message is
  left with.

- Narrow enough that the input and output stack, Copy and Download now
  follow the input box and lead the output, instead of staying in a row
  of buttons above both — where they sat next to the input and two
  boxes away from the output they act on. Side by side nothing moves:
  the buttons still share a row above the boxes.

- The build version in the Web UI's page chrome is now linked: the tag
  (`v0.3.0`) opens the changelog on `main` — not the tag's own copy,
  which is missing everything a deploy ahead of the tag has added under
  Unreleased — and the commit part (`g0a1b2c3`) opens that commit on
  GitHub. The commit count and a `-dirty` marker stay plain text, and a
  string that is not a version (the `unknown` fallback) is not linked at
  all. The links open in a new tab, since the embed page runs inside its
  host's iframe.

## [0.3.0] - 2026-09-16

### Added

- The Web UI reads and writes local files instead of relying on the
  clipboard alone: an "Open file…" picker, drag and drop anywhere on
  the converter, and Copy / Download buttons for the result. A dropped
  `.toml` goes to the config panel and expands it; a document goes to
  the input, and its extension picks the conversion direction —
  the format half only, so a Normalize mode survives (`notes.org`
  dropped while normalizing Markdown selects "Normalize Org"). Several
  files dropped together are routed by kind, and any the converter
  cannot use are named in the warning list. The download is named after
  the opened file with the output extension (`notes.md` → `notes.org`);
  normalizing adds `.normalized` (`notes.org` → `notes.normalized.org`)
  so the result cannot be saved over its own source. Copy and Download
  are disabled while the conversion is failing. Files over 1 MB load
  with a warning that conversion may be slow. Nothing is uploaded: the
  browser reads and writes the file itself.

- Dragging files over the Web UI raises an overlay naming what the
  converter accepts, and a hint next to "Open file…" says a file can be
  dropped before any drag has started. The page-wide drop target was
  otherwise invisible.

- An end-to-end suite (`tests/e2e/`, Playwright, `npm run test:e2e`)
  driving the Web UI in Chromium and WebKit against the built pages,
  plus axe accessibility audits of every page in both color schemes and
  in the states only an interaction reaches. It covers what the
  happy-dom specs cannot decide: whether the conversion worker really
  starts, real file picking, dropping and downloading, the clipboard and
  its selection-copy fallback, and the theme crossing into the embedded
  frame. It runs in CI after the builds, and the Web UI no longer
  deploys unless it passes.

### Changed

- Copy and Download are disabled in the Web UI while a conversion is
  running. The output box still holds the previous result until the new
  one arrives, and saving that wrote one document's conversion under
  the next document's name. A conversion still running after 150 ms
  says so; a faster one passes without comment.

- The Web UI converts in a web worker, so the page no longer freezes
  while a large document is converted. A browser that has no workers
  falls back to converting in place, as before. The conversion pipeline
  now loads with the worker rather than with the page: the converter's
  own bundle dropped from 338 kB to 20 kB, and the fallback copy is
  only fetched if it is actually needed. The large-file notice no
  longer promises an unresponsive page, only a wait.

- The Web UI converts once typing pauses (200 ms) rather than on every
  keystroke. A full conversion per keystroke made a large document
  painful to type into. Selects and checkboxes still convert
  immediately — they fire once per interaction, and delaying a click
  reads as lag. The conversion is now asynchronous, and a result that
  a newer edit has overtaken is discarded instead of painted.

- `.markdown` is no longer recognized as a Markdown extension in the
  Web UI. It never was in the CLI, and one extension table is now
  shared by both (`src/fileNames.ts`); the file picker still offers
  `.markdown` files, it just leaves the direction to you.

### Fixed

- Web UI: the "Try the converter" button failed WCAG AA contrast in
  dark mode (4.27:1). Its label took the link color rather than the
  page text, because Pico redefines `--pico-color` on every anchor.
- Web UI: `convert.html` presented two `main` landmarks — its own and
  the embedded converter's — with nothing to tell them apart, and the
  drag-and-drop overlay was appended outside every landmark, where
  landmark navigation skips it.
- Web UI: inserting a config snippet left the config panel's summary
  saying no config was in force, until the config was edited by hand.
- A file name is now split on its last path segment, so a path the CLI
  is given (`docs/.org`) follows the same dotfile rule as a name the
  Web UI reads off a dropped file. `morg docs/.org` no longer infers a
  format from a hidden file's name.
- Web UI: a conversion that could not be run at all — rather than one
  that failed on its input — left the page locked: "Converting…" up,
  Copy and Download disabled, and no message. The worker now reports a
  request structured clone refuses, a reply that did not survive the
  trip, and a stand-in conversion whose code could not be fetched;
  the page shows the failure and carries on.
- Web UI: coming back to a restored "Markdown → Org" and switching to
  "Org → Markdown" left the Markdown demo in the input, to be converted
  as Org. The untouched-demo swap now compares against the restored
  direction rather than the page's default.
- Web UI: a dropped file that is not text — a png, a pdf, an archive —
  was decoded as UTF-8 and its replacement characters converted. It is
  named in the warning list instead. Text files the picker's filter
  does not cover (`README`, `notes.txt`) still open as before.
- Web UI: opening `notes.md` and then selecting "Org → Markdown" offered
  the download as `notes.md` — the source file. A direction that no
  longer reads the opened file's format falls back to the generic
  timestamped name; "Normalize Markdown" still reads it, so it keeps the
  name.
- Web UI: a refused copy says so in its own notice instead of the
  conversion error slot, where it read as a failed conversion and was
  wiped by the next keystroke before it could be acted on. The fallback
  copy also gives the caret back, instead of leaving the focus on the
  output.
- Web UI: a dropped `morg.toml` over 1 MB no longer produces a warning
  about how long converting it will take; a config is read, not
  converted.
- Web UI: the download kept the opened file's name after the input had
  been replaced, so converting `notes.org`, saving `notes.md`, then
  pasting an unrelated document and saving again wrote the second over
  the first. The name is dropped as soon as the input is edited: an
  edit and a paste of a different document cannot be told apart, so the
  name is not kept on the chance that it is still the same document.
  Content with no source file is now saved as
  `morg-output-20260914T193015.md` — a timestamp, so a
  paste-convert-save loop over several snippets cannot collide with
  itself either.
- Web UI: a file name whose extension collided with an `Object`
  property (`notes.constructor`, `notes.__proto__`) selected a
  nonexistent direction, blanking the dropdown and failing every later
  conversion.
- Web UI: a file that could not be read — a dropped folder, a file
  moved between picking and reading — failed silently; the drop now
  reports the error instead of appearing to do nothing.
- Web UI: dragging a text selection into either textarea no longer has
  its default cancelled by the page-wide file-drop handler.
- Web UI: the download object URL is no longer revoked in the same task
  as the click, which could abort the save in Firefox and Safari.
- Web UI: the clipboard fallback works on iOS Safari (which refuses to
  select a `readonly` textarea) and says so when a copy is refused
  outright, instead of failing indistinguishably from success.
- Web UI: a config restored from a previous visit is marked as active
  on the Config panel, rather than taking effect with no indication.

## [0.2.0] - 2026-09-12

### Added

- Opt-in `interpretHtml` flag (`--interpret-html`,
  `[markdownToOrg] interpretHtml`, Web UI checkbox): during md → org,
  the HTML vocabulary morg itself emits under `useHtml` (bare `<u>`,
  `<sup>`, `<sub>`, `<dl>/<dt>/<dd>`) becomes native Org constructs
  instead of a preserved md-ism. Inverse of `useHtml`: with both
  enabled the round trip is lossless; with `interpretHtml` alone it
  converges away from HTML (cleanup mode). Default `false`.
- Boolean CLI flags accept an optional value (`--silent false`,
  `--task-checkboxes false`, `--interpret-html false`); the bare flag
  still means `true`. This is what makes the documented
  `CLI > config > defaults` precedence hold in both directions — a
  config setting `true` can now be turned off from the command line.
- The Web UI shows its build version (`git describe --tags`, injected at
  build time) in the page chrome, including the embed page. The Web UI
  deploys from every push to `main`, so it is usually ahead of the
  latest tag: the string reads `v0.2.0` on a release and
  `v0.2.0-3-g<sha>` three commits later.

### Changed

- A YAML frontmatter sequence maps to a repeated org keyword
  (`tags: [a, b]` ↔ `#+TAGS: a` + `#+TAGS: b`) instead of a
  JSON-encoded array on one line. Repeating a keyword is legal org and
  is how several values for one key are carried, so the mapping is now
  lossless in both directions. **Migration:** org files written by
  0.1.0 that contain a JSON array value (`#+TAGS: ["a","b"]`) convert
  to the repeated form on the next `morg` run; a one-element sequence
  normalizes to a plain scalar. Structured (non-sequence) values are
  still JSON-encoded.

### Fixed

- CLI stdin is decoded as one UTF-8 stream instead of per chunk: a
  multi-byte character straddling a 64 KiB chunk boundary no longer
  becomes U+FFFD, which silently corrupted any non-ASCII document over
  64 KiB piped in
- Value-taking CLI flags reject a missing value instead of substituting
  `""`: `morg --bullet` no longer overrides the canonical `-` with an
  empty marker (making remark fall back to `*`), and `morg --config`
  no longer ignores the config file. A following flag counts as a
  missing value; a lone `-` stays a valid bullet character
- `morg normalize` rejects a conflicting `--to` or output extension
  instead of overwriting it with the source format, which silently
  wrote Markdown into a `.org` file
- Multi-line YAML frontmatter values (block, folded or multi-line
  quoted scalars) are JSON-encoded like structured values. An org
  keyword is a single line, so a raw newline ended it and pushed the
  remaining lines into the document body
- Repeated leading org keywords keep every value instead of collapsing
  to the last one (see Changed, above)
- `todo::`, `priority::`, `tags::` and the planning keys are only
  written onto the headline when the value fits that slot; an org
  property drawer entry that merely shares one of those names (or a
  hand-written line) stays a drawer property instead of corrupting the
  title (`:todo: something` became `* something Head`)
- `[` and `]` in a link or image url are percent-encoded: an org
  bracket-link path cannot hold them, so a query array (`?a[]=1`) or an
  IPv6 literal host produced a link org could not parse. Documented in
  [docs/mappings.md](docs/mappings.md), including the IPv6 caveat
- An org comment body containing `-->` is escaped to `--&gt;` (and
  decoded on the way back); the HTML comment previously closed at the
  first terminator and leaked the rest of the line into the page
- Under `useHtml`, descriptive list terms and definitions are
  HTML-escaped, so a term containing `<` or `&` no longer produces
  markup that `interpretHtml` cannot read back — restoring the
  documented lossless `useHtml` + `interpretHtml` pair
- `logseq` preset: the `:heading:` property joins the existing property
  drawer below the planning line instead of being inserted directly
  after the headline, where it displaced both and made them re-parse as
  body text; the extract direction looks past a planning line for it
  instead of demoting the headline to a paragraph
- `logseq` preset: labeled page refs whose page name has no space
  (`[label]([[soil]])`) are rewritten to `[[soil][label]]`. remark
  parses that form as a real link — unlike `[[other page]]`, whose
  space makes it an invalid destination — so the rewrite never fired
  and produced a nested org link that org cannot parse
- Web UI: an unknown conversion direction reports an error instead of
  returning `undefined` as a success (which showed the literal string
  "undefined" in the output field), and a persisted direction the
  select does not offer is ignored rather than leaving it blank

## [0.1.0] - 2026-09-10

### Added

- Bidirectional Markdown ↔ Org conversion with round-trip convergence
  as the correctness guarantee (ADR 0001); full construct coverage is
  documented in [docs/mappings.md](docs/mappings.md)
- Org-ism `key:: value` serialization with remappable key names
  (`orgismKeys`), md-ism preservation via export blocks/snippets
  (ADR 0002)
- Verbatim passthrough for org-only constructs (drawers, special
  blocks, affiliated keywords, exports, timestamps, citations, …)
- LaTeX math ↔ `$…$`/`$$…$$` (remark-math), entities → UTF-8,
  frontmatter ↔ `#+KEY:` keywords, org comments ↔ HTML comments
- `logseq` preset: outline nesting, `:heading:` drawers, task markers
  and priorities, page/block references, highlight and hiccup
- `obsidian` preset: wikilinks ↔ org fuzzy links
- `morg normalize` canonicalizer command and
  `normalizeMarkdown`/`normalizeOrg` library functions
- `morg.toml` configuration file (`--config`, precedence
  CLI > config > defaults)
- Markdown style knobs (`markdownStyle` / `--bullet`, `--emphasis`,
  `--strong`, `--fence`, `--rule`, `--rule-repetition`)
- Formatter compatibility snippets for prettier (test-verified fixed
  point) and mdformat in
  [docs/CONFIGURATION.md](docs/CONFIGURATION.md), loadable in the Web
  UI's config panel
- Opt-in lossy export flag `taskCheckboxes` (`--task-checkboxes`):
  bare TODO/DONE leaf headlines → GFM task items
- Drop reporting via `onWarning`; CLI reports to stderr, `-s` /
  `--silent` suppresses
- Client-side Web UI at
  [morg.binarypoetry.ch](https://morg.binarypoetry.ch), deployed to
  GitHub Pages from `main` (ADR 0003): converter with presets, options,
  normalize modes, `morg.toml` paste and a preloaded demo, iframable
  embed page with `?theme` override, light/dark switcher

[unreleased]: https://github.com/remigius42/morg/compare/v0.10.1...HEAD
[0.10.1]: https://github.com/remigius42/morg/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/remigius42/morg/compare/v0.9.2...v0.10.0
[0.9.2]: https://github.com/remigius42/morg/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/remigius42/morg/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/remigius42/morg/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/remigius42/morg/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/remigius42/morg/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/remigius42/morg/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/remigius42/morg/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/remigius42/morg/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/remigius42/morg/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/remigius42/morg/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/remigius42/morg/releases/tag/v0.1.0
