# Obsidian

`obsidian`: wikilinks `[[Page]]` / `[[Page|alias]]` ↔ org fuzzy links,
emitted unescaped in Markdown, except for the alias pipe inside a
table cell, written `\|` as Obsidian does, since a bare `|` would
split the cell. An embed (`![[image.png]]`) keeps its `!` unescaped in
Markdown, and its size (`![[image.png|300]]`) is no alias: it stays as
written in org. An image's size (`![alt|300](image.png)`,
`![alt|300x200](image.png)`) is its `#+ATTR_HTML: :width 300
:height 200` line in org, for an image alone in its paragraph outside a
list (in a list, org reads no keyword on the bullet's line, and md→org
keeps the item's lines together); Obsidian writes it so, over the html
spelling, where the size is a width in pixels and maybe a height.
Elsewhere the `|300` stays in the link's description. A GFM alert is
a callout, its type lower case (`> [!note]`), as Obsidian writes it; a
fold after the marker ↔ the parameters' leading token
(`> [!tip]- Stretch first` ↔ `#+begin_tip - Stretch first`). A known
limit: a title starting with a lone `-` or `+` (`> [!tip] - T`) comes
back folded.

## Obsidian md

Translated within Markdown, Obsidian md translates as
[Vanilla md](logseq.md) does, but for its links: `[[Page|label]]` (in a table
`[[Page\|label]]`) ↔ `[label]([[Page]])` outside code (`[[Page]]` is
both's); an embed's size (`![[image.png|300]]`) stays, an image's
(`![alt|300](image.png)`, alone in its paragraph outside a list)
becomes the `#+ATTR_HTML:` line above `![alt](image.png)` and back,
where Obsidian can spell it (a width in pixels, and a height). Obsidian md →
Vanilla md or Logseq md writes a `%%comment%%` as an HTML comment
(`<!--comment-->`) and an inline footnote `^[note]` as a footnote,
numbered on from the page's own, its definition at the end; their
delimiters count outside code, math and HTML only, but what they hold
may be code. The way back has nothing else to do: Obsidian reads both.
Wikilinks and embeds (`[[Page]]`, `![[image.png]]`) stay in Vanilla
md, which cannot resolve a note's name to its file without the vault.
