# Logseq

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
content converts (Logseq's `<quote` command writes one); a special
block stays org text, which Logseq shows as a box (`#+BEGIN_TIP`), no
GFM alert, which it shows as a quote. A plain `https://…` link ↔ a
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
Vanilla org), only those headlines and image sizes change; other lines stay as
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
`content`, `all`) stays, with a warning, as Logseq has none. An
image's size (`[[image.png]]{:height 200, :width 300}`, in Logseq md
`![alt](image.png){:width 300}`) is its `#+ATTR_HTML: :height 200
:width 300` line in Vanilla org, in the order written, and back, for
an image line below a block's title that is a paragraph of its own; a
block's title is a headline, which org sizes not, so a title image
keeps its size map, as does Vanilla md, which carries Logseq's syntax.
What
Logseq reads otherwise than Emacs stays as written, with a warning per
kind: a `[[*heading]]` or `[[#custom-id]]` link (labeled or not) and
an `[[id:…]]` link without a label are refs to pages of that name to
Logseq, a `<<<radio>>>` target it misreads, and a `#+KEY:` line below
the first headline (`#+NAME:`, `#+RESULTS:`) it takes for a page
property; org blocks are skipped. Converted to Logseq md, a
`[[*heading]]` link (labeled or not) becomes a page ref, with that
warning; the other kinds are Markdown links or text there. Vanilla md has a shape of its own;
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
others stay. Page properties are flat frontmatter keys, every key (no
org is in the way to act on one); from Vanilla md, flat entries are
page properties and the rest stays frontmatter. A rule after a Vanilla
list is a block of `---`, a block's content loses the indentation all
its lines share, and text after a list is read from its own column; a
tab indents to the next tab stop (4), and what of it lies right of the
column cut stays as spaces. A
`style` option rewrites the markers it names (bullets,
emphasis, strong, fences, rules) and nothing else; Logseq md keeps the
`-` its blocks need, with a warning, and a fence stays whose code
holds a run of the new marker. The Markdown options apply as in a
conversion (ADR 0007): a definition list written in the Spelling they
name, `<dl>`, `<u>`, `<sup>` and `<sub>` read where `interpretHtml`
asks, each block holding one converted on its own, the rest as written;
an image's `#+ATTR_HTML:` size line above it is written into its
`<img>` where `images = "html"`. Known limitation: underline and
scripts in their Markdown spelling (`\_x\_`, `^{x}`), org text inside
Markdown text that a user's own escapes look alike to, stay as written
under `"html"` too, where a conversion writes `<u>`, `<sup>`, `<sub>`.
