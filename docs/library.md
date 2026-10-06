# Library

```bash
npm install @remigius42/morg
```

morg is ESM-only and ships its own type declarations:

```ts
import {
  convertMarkdownToOrg,
  convertOrgToMarkdown,
  logseq
} from "@remigius42/morg"

const org = convertMarkdownToOrg("# Hello\n\nWorld.")
const md = convertOrgToMarkdown(org)

// Logseq dialect
const logseqOrg = convertMarkdownToOrg(markdown, { preset: logseq() })
```

## Options

Options (flags accept `boolean` or a per-construct `Record<string, boolean>`):

- `convertMarkdownToOrg(md, { preserveMdisms, interpretHtml,
recordMarkdownStyle, preset })`:
  `preserveMdisms` default `true`; `interpretHtml` (default `false`,
  per construct: `definitionList`, `images`, `underline`,
  `superscript`, `subscript`) reads a construct's HTML spelling (bare
  `<dl>`, `<u>`, `<sup>`, `<sub>`, a sized `<img>`) as the native Org construct, the inverse of
  `spelling: "html"` (ADR 0007); other HTML preserves as usual;
  `recordMarkdownStyle` (default `false`, CLI
  `--record-markdown-style`) records the document-level markdown style
  as a `#+MORG_MARKDOWN_STYLE:` keyword so the round trip restores it
  (ADR 0004)
- `convertOrgToMarkdown(org, { preserveOrgisms, spelling, taskCheckboxes,
preset })`: `preserveOrgisms` default `true`; `spelling` (`"markdown"`
  or `"html"`, for all constructs or per construct, default
  `"markdown"`) writes a construct Markdown cannot spell losslessly as
  HTML (`<dl>`, `<img width>`, `<u>`, `<sup>`, `<sub>`) instead of
  verbatim org
  (ADR 0007; CLI `--html` sets both sides); `taskCheckboxes` (default
  `false`, CLI `--task-checkboxes`) is a lossy export mode that maps
  bare `TODO`/`DONE` leaf headlines to GFM task items (`- [ ]` /
  `- [x]`); headings become list items and do not restore on the
  return trip; anything with priority, tags or content keeps its
  heading and reports via `onWarning`
- `logseq()`: a page is Logseq's outline of blocks, converted block by
  block: a headline (stars, a space, the block's content, an empty
  block as the bare stars) ↔ a `-` bullet indented one tab per level,
  its lines below the first two spaces further in. A block's content
  is one fragment, so a code block or table that starts on the
  headline line converts as a whole. `:heading: N` ↔ `- ## …`, a
  block's property drawer ↔ `key:: value` lines; planning lines and
  other drawers (`:LOGBOOK:`) stay as written. A heading outside the
  bullets is a top-level block, as Logseq writes a page's first one.
  Page properties map both directions: a first block of
  `key:: value` lines and flat frontmatter entries ↔ leading
  `#+key: value` lines, which Logseq reads as page properties;
  frontmatter keys that act in Emacs (`todo`, `include`, …) stay inert.
  Task markers and `[#A]` priorities stay text, page
  references `[[page]]` and labeled forms `[label]([[page]])` ↔ org
  fuzzy links `[[page][label]]`, block refs `[label](((uuid)))` ↔
  `[[((uuid))][label]]`, and `^^highlight^^` markup survives verbatim
  (it would otherwise re-parse as superscripts). An image's size
  `{:width 300}` below a block's title ↔ `#+ATTR_HTML: :width 300` in
  Vanilla org.
- `obsidian()`: wikilinks `[[Page]]` / `[[Page|alias]]` ↔ org fuzzy links
  (`[[Page\|alias]]` in a table cell); an image's size
  `![alt|300](image.png)` ↔ `#+ATTR_HTML: :width 300`. Translated to Vanilla or Logseq
  Markdown, a `%%comment%%` becomes an HTML comment and an inline
  footnote `^[note]` a footnote.
- `inputPreset` / `outputPreset` (on both conversions): the dialect
  the input is read in and the one the output is written in (ADR
  0006); leaving one out is Vanilla. `preset` sets both, but leaves a
  side Vanilla whose format the preset has no dialect for (Obsidian
  writes no org); a side preset without one throws, and so does
  `preset` naming another preset than a side preset.

- `normalizeMarkdown(md, { preset })` / `normalizeOrg(org, { preset })`
  (CLI: one format and preset on both sides): one full round trip to morg's canonical
  form, a fixed point, within one dialect: different presets per side
  throw. Canonicalization, not styling: org-isms and
  md-isms are rewritten exactly as a conversion would rewrite them.
  Normalize with the same preset/config you will convert with, since
  convergence is per-config (ADR 0002).

- `translateOrg(org, { inputPreset, outputPreset })`: translates
  between two org dialects (Logseq org ↔ Vanilla org), changing only
  what they write differently: a block's content stays as written.
  The same preset on both sides throws; that is `normalizeOrg`.
  `translateMarkdown(md, { inputPreset, outputPreset })` does the same
  within Markdown (Logseq md, Obsidian md and Vanilla md, any two);
  `orgismKeys` names the
  `key::` lines Vanilla md writes planning under, as in a conversion,
  `style` rewrites the markers it names, and `spelling` and
  `interpretHtml` respell the blocks they concern (ADR 0007), leaving
  the rest as written.

- `style: { bullet, emphasis, strong, fence, rule, ruleRepetition }`
  (on `convertOrgToMarkdown`, `normalizeMarkdown` and
  `translateMarkdown`; CLI `--bullet`,
  `--emphasis`, `--strong`, `--fence`, `--rule`, `--rule-repetition`)
  are Markdown output style knobs. Defaults match prettier except
  emphasis (`*italic*`); `--emphasis _` aligns fully with prettier.
  Canonical form is
  per-config (ADR 0001): round trips must use the same style. Note
  CommonMark/GFM prescribe no style; these defaults are morg's
  canonical choices, not a standard.

## Warnings

The convert and translate functions also accept `onWarning: message => …`, called for
each construct dropped without an equivalent (e.g. image titles, LaTeX
fragments; see the [mapping reference](mappings/README.md)). The CLI wires this to stderr unless `-s` / `--silent` is
given; the library is silent unless a callback is passed.
