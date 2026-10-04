# 0006: Presets per side

## Status

Accepted (2026-10-03)

## Context

Up to 0.8.0 one Preset applied to both sides of a conversion: Logseq
org ↔ Logseq md. The useful job is converting between a Logseq Dialect
and Vanilla Org or Markdown. Logseq itself does not convert existing
pages between its formats, and the one community converter (a mldoc
based script) drops planning and admonitions.

## Decision

1. **Input Preset and Output Preset.** `--input-preset` and
   `--output-preset` (`inputPreset`/`outputPreset` in the config) take
   `vanilla`, `logseq` or `obsidian`; `--preset`/`preset` sets both, and
   combined with a conflicting side preset it is an error. `preset`
   leaves a side Vanilla whose format the Preset has no Dialect for
   (`--preset obsidian` converts md → org as before), while a side
   preset without one is an error. Each side
   resolves on its own: CLI side flag, `--preset`, config side key,
   config `preset`, `vanilla`; a conflict is an error only within one
   layer, across layers the higher one wins, so a config can set the
   vault and a flag override one side. `vanilla` is
   a named value so one side can be set back to it. Naming by side of
   the conversion, not by format (`markdownPreset`/`orgPreset`): a
   Preset names an editor, and `orgPreset = "obsidian"` reads as
   nonsense; a Preset that lacks the Dialect a side needs is an error
   instead.
2. **The Input Preset reads its Dialect into Vanilla, the Output
   Preset writes Vanilla into its Dialect.** A construct with no Vanilla
   equivalent the input keeps as a Carried Construct (a page ref with
   its label, not its source text), which a Dialect's writer renders in
   its own syntax: Logseq org `[[Page][x]]`, Logseq md `[x]([[Page]])`.
   So a Preset's transforms are cut by format and by reading or
   writing, not by pipeline hook: today's org→md Logseq hook mostly
   reads Logseq org, Obsidian's writes Obsidian md.
3. **No auto-detection.** Many pages carry no telling syntax, and a
   vault must convert the same way file by file. Today's default
   (Vanilla) stays.
   Amended (0.10.0): no hint either. A warning that the input looks
   like another Dialect than its Input Preset would rest on the same
   guess: the syntax that tells a Dialect apart is rare on a page, and
   what is common (`[[page]]`) is Vanilla org too, so it would be
   silent on most pages and could warn on a Vanilla one. Converters
   leave this to the user too: pandoc reads `--from` or the file
   extension, never the content.
4. **No same-format conversion, and `normalize` takes one Preset.**
   `normalize` canonicalizes within a Dialect; a dialect change within
   one format is a later feature. Corpus checks of the new directions
   chain cross-format conversions, whose intermediate file locates a
   loss better than a same-format shortcut would.
   Amended (0.10.0): within one format, two Dialects translate. A
   Translation changes only what the two Dialects write differently
   and keeps a Block's content as written, without a trip through the
   other format, which would canonicalize every line (Org's community
   docs through Logseq md: 229 of 293 files converge; translated, all
   keep their content). One Dialect on both sides is `normalize`, so
   the CLI's `morg normalize` command goes: one format and one Preset
   on both sides normalizes.
   Vanilla org and Logseq org differ in their headlines only (§5): an
   empty Block's space, and a first line that starts an element.
5. **A Block's Vanilla shape depends on the format.** In org a Block
   is a headline: Logseq org already is Vanilla org, and planning only
   reaches the Emacs agenda on headlines (corpus: every task and every
   scheduled Block is a plain Block). In Markdown a Block is a list
   item: as headings, thousands of Blocks would nest past `######`.
   A `heading` property makes a Block a heading on either side. This
   matches how Logseq (mldoc) reads files it did not write. So Vanilla
   org is read and written as Logseq org, Logseq's page properties as
   its leading keywords; only Vanilla md has a shape of its own.
   Amended (0.9.1): but for two headlines Emacs reads apart, as
   `org-element-headline-re` needs a space after the stars. An empty
   block keeps that space, which Logseq org leaves out, and a block
   whose first line starts an element running on below it (a block, a
   table, a list, its property drawer) has that line below an empty
   headline, not on the stars' line, where Emacs would read it as the
   title and cut the element off. Reading Vanilla org, such an empty
   headline's next line is the block's first again. A first line that
   ends its element (`* 1. Which`) stays the title, as Emacs files
   write numbered titles so.
6. **Block meta in Vanilla Markdown** rides inside the item. Task
   markers render as Logseq renders them (0.10, either format): `TODO`
   / `DONE` as `- [ ]` / `- [x]`; `NOW`, `LATER`, `DOING`,
   `IN-PROGRESS`, `WAIT` and `WAITING`, which Logseq shows unchecked,
   as `- [ ]` followed by the marker; `CANCELED`, which it shows without
   a checkbox, as text. Planning and properties become `key:: value`
   continuation lines (the org-ism names, `orgismKeys` applies);
   `logseq.order-list-type` an ordered list; `collapsed` and `LOGBOOK`
   are dropped with a warning.
7. **Convergence for an asymmetric pair holds from either start.**
   With f the Vanilla → Logseq step and g its return,
   `g(f(g(f(x)))) === g(f(x))` and `f(g(f(g(y)))) === f(g(y))`, per
   Preset pair and config (ADR 0001, 0002). There is no identity
   corollary: a Logseq-only construct is lost, with a warning, on the
   first trip, so how many pages come back identical is a measured
   quality figure, not a guarantee.
8. **Carry, not translate.** A Vanilla output writes a Carried
   Construct as literal text in the Dialect's own syntax for that
   format (or a code block: a query), never half-interpreted, and a
   Dialect's writer recognizes that text on the way back. Translating
   to Vanilla equivalents (a page ref to a link to the page's file)
   was rejected: it needs knowledge across files, and the return trip
   could not tell a translated page ref from a real link. That job is
   left to a later migration, which needs the graph anyway.
9. **A Block tree in the middle.** When either side is Logseq, the
   page is read into Blocks (from Logseq org or md, or from Vanilla
   headlines, headings and list items), each Block's content converted
   as a fragment, and the Blocks written out in the output's shape.
   Vanilla ↔ Vanilla stays document-wise. What spans a Vanilla md
   document is resolved before the split: a reference link becomes
   inline, a footnote definition moves to the Block of its first
   reference.
10. **Page properties are plain frontmatter in Vanilla md.** A Logseq
    page's properties become flat YAML keys (`title`, `tags`), as
    Vanilla md tools read metadata, not ADR 0005's `morg_keywords`; the
    Logseq writer already takes flat frontmatter back as page
    properties. What cannot be flat stays with the core's mapping.

## Consequences

- Vanilla output may hold foreign syntax (`[[Page]]`, `((uuid))`,
  `{{video …}}`), unrendered but intact.
- One page has two Vanilla shapes: headlines in org, a list in md.
- After a heading Block, Vanilla md has no way back to the top level:
  a later top-level Block reads back as the heading's child. It
  converges after one trip but does not come back as it was.
- Vanilla md prose outside a heading's body (after a list, before the
  first heading) becomes list items on its first trip through Logseq.
- A user's own `Key:: value` line inside a Vanilla md list item reads
  as a property, as it already does below a heading.
