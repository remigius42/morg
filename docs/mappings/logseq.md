# Logseq

The `logseq` preset converts between Logseq md and Logseq org. Set on
one side only, it converts between a Logseq dialect and Vanilla
([below](#logseq-on-one-side-only)).

## Page properties

A page's first block of `key:: value` lines ↔ leading `#+key: value`
lines.

- The block is plain text. An empty `key::` counts, and its keys must
  be names org reads as keyword names. It may sit below a file-level
  drawer or a mode line.
- A keyword no `key::` line can hold, such as `#+CAPTION[short]:`,
  travels as `morg_keywords` instead.
- Values travel verbatim, frontmatter values as written (`01234` stays
  `01234`).
- Keys are lower-cased on the way to Markdown: Logseq reads only lower
  case.

Flat frontmatter entries whose keys are lower case, digits, `_` and
`-` become such keywords too; other keys would not come back as
written. A sequence is written as Logseq writes it (`tags: [a, b]` →
`#+tags: a, b`). So YAML comes back as a `key::` block after one round
trip.

These stay in the frontmatter block:

- what a keyword line cannot hold: nested maps, line breaks, an item
  with a comma, a key that is no keyword name
- flow-style or aliased frontmatter, as a whole
- keys that act in Emacs or in export, as frontmatter they were
  passive data: `todo`, `startup`, `options`, `include`, `setupfile`,
  `call`, `begin` and `end` (which open and close a dynamic block),
  `bibliography`, `cite_export`, `toc`, `index`, raw export lines such
  as `html`, `latex` and `markdown`, `html_*`, `infojs_opt`, `lco` and
  the other options of org's own exporters, of ox-hugo and of
  org-re-reveal

The list is a denylist: other third-party exporters' keys and export
metadata such as `title` or `author` do map. `tags` maps too: it holds
Logseq's page tags.

A `key::` block maps whole, acting keys included, since that is how an
org page's own `#+startup:` travels through Markdown (ADR 0005). Its
acting keys act in the org page: `include:: x` becomes `#+include: x`.

## Outline

A page converts block by block, each block's content as one fragment,
as Logseq parses it.

- A block is a headline of stars, a space and the content ↔ a `-`
  bullet indented one tab per level, continuation lines two spaces
  inside it. An empty block is the bare stars.
- `:heading: N` ↔ `- ## …`.
- A heading outside the bullets is a top-level block: Logseq writes a
  page's first block so if it is a heading. Other content before the
  first bullet is page content.

## Block titles

A code block, table or rule that starts on the headline line converts
as a whole. Otherwise a block's title is inline text: a title that
looks like org line syntax (`: a`, `** a`, `- a`, `1. a`, `# a`) stays
text, escaped in Markdown (`\*\* a`, `1\. a`) as mldoc reads it. A
block that starts with a comment has it below an empty title
(`*` then `# …`), where it stays a comment.

Known limitation: Logseq reads an org title `: a` (or `:a: b`) as an
empty title and a fixed-width line. morg reads it as text, as Emacs
does.

## Drawers and planning

- A block's property drawer ↔ `key:: value` lines where it was. If the
  content starts with it, the lines go on the headline line, as Logseq
  writes a query block.
- Planning lines and other drawers (`:LOGBOOK:`) stay as written, but
  for a repeated task's state log lines: bulleted `- State …` in org,
  `* State …` in Markdown, as Logseq writes them.
- An empty drawer is dropped.

## Org blocks

An org block in a Markdown block (`#+BEGIN_SRC`…`#+END_SRC`, which
Logseq reads there too) goes to org as written, as org → md writes
them. Exceptions:

- A quote block's Markdown content converts. Logseq's `<quote` command
  writes one.
- A special block (`#+BEGIN_TIP`) stays org text, which Logseq shows as
  a box, not a GFM alert, which it shows as a quote.

A block's begin and end lines are written in upper case on either
side (`#+BEGIN_SRC sh`), as Logseq writes them; Vanilla org keeps
Emacs's lower case (`#+begin_src`).

## Links and inline syntax

- A plain `https://…` link ↔ a bare url; a bracketed `[[url]]` ↔
  `<url>`.
- An email address stays text, written bare.
- A `#tag` at the start of a line stays unescaped: mldoc reads `\#` as
  plain text, not a tag.
- Task markers and `[#A]` priorities stay text.
- Page refs `[[page]]` and labeled `[label]([[page]])` ↔ org fuzzy
  links `[[page][label]]`.
- Block refs `[label](((uuid)))` ↔ `[[((uuid))][label]]`.
- `^^highlight^^` markup and hiccup (`[:div …]`) survive verbatim,
  unescaped in Markdown.

## Logseq on one side only

`--input-preset` / `--output-preset` set `logseq` on one side only;
the other side is Vanilla (ADR 0006).

### Vanilla org

Vanilla org is read and written as Logseq org, which it nearly is:
Logseq md ↔ Vanilla org converts as Logseq md ↔ Logseq org does, but
for what Emacs reads otherwise than Logseq:

- An empty block keeps a space after its stars. Logseq org writes bare
  stars, which Emacs reads as text.
- A block whose first line starts an element that runs on below it (a
  src or other block, a table, a list, its property drawer) has that
  line below an empty headline. Logseq org puts it on the stars' line,
  where Emacs would read it as the title.
- A page whose blocks use a task marker Emacs does not know (`NOW`,
  `LATER`, `DOING`, `WAIT`, `WAITING`, `IN-PROGRESS`, `STARTED`,
  `CANCELED`, `CANCELLED`), and which its own `#+TODO:` lines do not
  declare, gets
  `#+TODO: TODO NOW LATER DOING WAIT WAITING IN-PROGRESS STARTED | DONE CANCELED CANCELLED`
  after its leading keywords in Vanilla org, and loses that line in
  Logseq org. Logseq reads no such line: a page's own one stays (a
  page property to Logseq), with a warning naming the markers Logseq
  shows as text.
- A block's `:collapsed: true` property is `:VISIBILITY: folded` in
  Vanilla org, by which Emacs folds the headline when it opens the
  file. Another `VISIBILITY` (`children`, `content`, `all`) stays, with
  a warning: Logseq has none.
- An image's size (`[[image.png]]{:height 200, :width 300}`, in Logseq
  md `![alt](image.png){:width 300}`) is its
  `#+ATTR_HTML: :height 200 :width 300` line in Vanilla org, in the
  order written, and back. This holds for an image line below a
  block's title that is a paragraph of its own. A block's title is a
  headline, which org does not size, so a title image keeps its size
  map, as it does in Vanilla md, which carries Logseq's syntax.

Translated within org (Logseq org ↔ Vanilla org), only these change.
Other lines stay as written, line endings become LF and an empty page
stays empty. A Vanilla headline whose title starts a list running on
below it (`* 3. Why?` with its body indented three spaces) stays as it
is on the way to Logseq org, but comes back with the title below empty
stars.

What Logseq reads otherwise than Emacs stays as written, with a
warning per kind; org blocks are skipped:

- a `[[*heading]]` or `[[#custom-id]]` link (labeled or not) and an
  `[[id:…]]` link without a label, which Logseq reads as refs to pages
  of that name
- a `<<<radio>>>` target, which Logseq misreads
- a `#+KEY:` line below the first headline (`#+NAME:`, `#+RESULTS:`),
  which Logseq takes for a page property

Converted to Logseq md, a `[[*heading]]` link (labeled or not) becomes
a page ref, with that warning; the other kinds are Markdown links or
text there.

### Vanilla md

Vanilla md has a shape of its own. Logseq org ↔ Vanilla md:

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

A block's title is inline text here too, but for a table or a rule on
the headline line ([Block titles](#block-titles)).

Vanilla md is read as Logseq reads a file it did not write:

- A heading is a block, nesting by heading level; the text below it,
  up to a list, is its content.
- Other text after a list is a block of its own.
- A list on an item's first line is its content: Markdown has no item
  whose content opens with a list and that has children besides.
- A reference link becomes inline before the page splits, and its
  definition goes.
- A footnote's definition moves to the block of its first reference.

With Obsidian on the other side, a page ref and a wikilink map onto
each other (`[[Page][label]]` ↔ `[[Page|label]]`).

### Within Markdown

Translated within Markdown (Logseq md ↔ Vanilla md), the outline maps
as in the table. A block's content stays as written, but for its org
blocks: a source or example block is fenced, a quote quoted, a query a
`query` code block (and back: a `query` code block is a query block);
others stay.

- Page properties are flat frontmatter keys, every key: no org is in
  the way to act on one. From Vanilla md, flat entries are page
  properties and the rest stays frontmatter.
- A rule after a Vanilla list is a block of `---`.
- A block's content loses the indentation all its lines share, and
  text after a list is read from its own column. A tab indents to the
  next tab stop (4); what of it lies right of the column cut stays as
  spaces.
- A `style` option rewrites the markers it names (bullets, emphasis,
  strong, fences, rules) and nothing else. Logseq md keeps the `-` its
  blocks need, with a warning, and a fence stays if its code holds a
  run of the new marker.
- The Markdown options apply as in a conversion (ADR 0007): a
  definition list is written in the Spelling they name, and `<dl>`,
  `<u>`, `<sup>` and `<sub>` are read where `interpretHtml` asks. Each
  block holding one converts on its own; the rest stays as written. An
  image's `#+ATTR_HTML:` size line above it is written into its
  `<img>` where `images = "html"`.

Known limitation: underline and scripts in their Markdown spelling
(`\_x\_`, `^{x}`) stay as written under `"html"` too, where a
conversion writes `<u>`, `<sup>`, `<sub>`: they are org text inside
Markdown text, which a user's own escapes look like.
