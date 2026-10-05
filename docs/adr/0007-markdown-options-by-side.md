# 0007: Markdown options by side

## Status

Accepted (2026-10-04)

## Context

ADR 0006 named Presets by side of the conversion; the options stayed
named by direction (`[markdownToOrg]`, `[orgToMarkdown]`). Within one
format that shows: `md → md` normalizes through org and so runs both
directions' options, while a Translation runs neither, so
`useHtml = { descriptiveList = true }` writes `- term :: def` as a
`<dl>` when normalizing Vanilla md and leaves it as written when
translating Obsidian md to Vanilla md. The Web UI labels the option
"(Org → Markdown)" in an `md → md` conversion.

The HTML options mix two questions: what a Markdown can spell (a
property of the format and its Dialect), and which of its spellings to
write (a choice). `useHtml` and `interpretHtml` pair into four
combinations, two of them one-way doors, to answer what one value per
construct can.

The source of `- term :: def` in Markdown is org: it is how org writes
a description list, which `org → md` keeps as text so org re-parses it.
Read as Vanilla md, a user's own list item of that shape becomes a
description list, and, under `useHtml`, a `<dl>`.

## Decision

1. **Options are named by format and side**, as Presets are: an
   `input` section is about reading that format, an `output` section
   about writing it. `[markdown]` sets both sides of a Markdown option,
   `[markdown.input]` and `[markdown.output]` override one each. A
   conversion uses the sections of the formats it reads and writes:
   `md → org` reads `[markdown.input]` and `[org.output]`, `md → md`
   both Markdown sides. `[markdownToOrg]` and `[orgToMarkdown]` go,
   without aliases: there is no dependent on npm, and 1.0 is ahead.
   Amended (2026-10-05): normalizing goes through the other format
   (§8), so `org → org` normalizing uses both Markdown sides as well:
   they shape the round trip whose output is the fixed point (ADR
   0001). A translation between two org dialects uses none.

   | Option                                  | Section                          |
   | --------------------------------------- | -------------------------------- |
   | `markdownStyle`, as `style`             | `[markdown.output]`              |
   | `taskCheckboxes`                        | `[markdown.output]`              |
   | `preserveOrgisms`                       | `[markdown.output]`              |
   | a construct's spelling (§4)             | `[markdown.output]`              |
   | a construct's HTML reading (§5)         | `[markdown.input.interpretHtml]` |
   | `preserveMdisms`                        | `[org.output]`                   |
   | `recordStyle`, as `recordMarkdownStyle` | `[org.output]`                   |

   Recording a style writes a keyword into org, so it is org output,
   like `preserveMdisms`. Restoring it stays unconditional: the file
   carries its style, not the config (ADR 0004). On the command line,
   `--html` sets every construct to `"html"` on both sides, as
   `[markdown]` would, replacing `--interpret-html`; a construct of its
   own is the config's. `--record-style` becomes
   `--record-markdown-style`.

2. **Vanilla md is CommonMark, GFM, footnotes, `$` math and YAML
   frontmatter**, what remark-gfm, remark-math and remark-frontmatter
   read, close to what GitHub renders. Neither CommonMark nor GFM is a
   Preset: a Preset names an editor, and both are Vanilla's base.
3. **A construct the output cannot spell goes through verbatim**, as
   org text that org re-parses on the way back (`^{2}`, `_u_`, an
   `#+ATTR_HTML:` line). Not an option: a fallback that is not the
   source loses what the next trip needs.
   Amended (2026-10-05): a descriptive list no definition list can
   hold (an item with a checkbox, or without a term) keeps its
   `- term :: def` text below a `<!-- morg_descriptive_list -->`
   comment, in every Dialect (Logseq md hides it too). Reading
   Markdown, the list right below the marker is descriptive, its
   `::` org's (a term alone on its line joins its definition's, as
   org→md writes it), and the marker goes; one above anything else
   stays a comment. An unmarked `- term :: def` stays an ordinary
   item (§6).
   Under `definitionList = "html"`, a list whose definition holds
   blocks (an image, a nested list, a second paragraph) goes below the
   marker too: a `<dl>` is an HTML block, Markdown in it is text, and
   its reader takes only text. Rejected: falling back to `Term` /
   `: def`, which holds the blocks, as GFM (GitHub, Obsidian) reads
   no definition list and so a definition's indented block as code,
   the image shown as its source; whoever spells `"html"` likely
   renders there. Rejected: `<img>` in the `<dd>`, which covers
   images only and contradicts `images = "markdown"`. The cost: such
   a list renders as a bullet list with `term :: def` text, not as a
   definition list. Markup in a `<dl>` stays flattened to text.
4. **An org construct that Markdown cannot spell losslessly in its own
   syntax, but HTML can, has a spelling option**: `"markdown"` (the
   default) or `"html"`. Emphasis or code have none: their Markdown
   spelling loses nothing.

   | Construct        | `"markdown"`                         | `"html"`        |
   | ---------------- | ------------------------------------ | --------------- |
   | `definitionList` | `Term` / `: def`                     | `<dl>`          |
   | `images`         | `![alt](src)`, a width line verbatim | `<img … width>` |
   | `underline`      | `_x_` verbatim                       | `<u>`           |
   | `superscript`    | `^{x}` verbatim                      | `<sup>`         |
   | `subscript`      | `_{x}` verbatim                      | `<sub>`         |

   `[markdown] definitionList = "html"` means: read `<dl>` too, write
   `<dl>`; `"markdown"`: read `<dl>` as HTML, write `Term` / `: def`.

5. **The reader always reads a Dialect's own spelling**; the HTML one
   only with `[markdown.input.interpretHtml]` set for the construct.
   Ignoring `Term` / `: def` would hand org a `: def` line, a
   fixed-width element. HTML org cannot hold (`x <sup>s</sup>`, as an
   org superscript needs a character before its `^`) stays HTML, a
   preserved md-ism.
6. **Definition lists are spelled `Term` / `: def`** in Markdown
   (remark-definition-list), the Markdown Guide's extended syntax that
   pandoc, kramdown and PHP Markdown Extra read (Python-Markdown with
   an extension), and so does Logseq md: mldoc 1.6.0 parses it as a
   list item with a name, and `- term :: def` as a block of plain text.
   A `- term :: def` in Markdown, Vanilla or Logseq, is an ordinary
   list item, kept from org's re-parse.
7. **An image's width maps to org's `#+ATTR_HTML: :width`** in every
   Dialect that spells it on an image link: Obsidian
   `![alt|300](image.png)`, Logseq `![alt](image.png){:width 300}` (in
   Logseq org `[[image.png]]{:width 300}`), Vanilla `<img width>` under
   `images = "html"`. An Obsidian embed (`![[image.png|300]]`) keeps
   its size as written: it is a Carried Construct, its name no path an
   org link could hold (ADR 0006 §8). Without it, a
   Vanilla output keeps the attribute line verbatim (§3). `ATTR_HTML`,
   not `ATTR_ORG`, as it serves both readers: HTML export reads it, and
   Emacs's inline images (`org-display-inline-image--width`) take
   `ATTR_ORG`'s width first, else the first `#+ATTR_…` that has one.
   An `ATTR_ORG`-only width stays verbatim. Logseq's `:height` maps to
   `#+ATTR_HTML: :height` alongside.
   Amended (2026-10-05): for an image link alone in its paragraph,
   outside a list, as org attaches the line to a paragraph and reads
   none on a bullet's line; elsewhere a size stays as written. A
   Logseq block's title is a headline, which org cannot size, so a
   title image keeps its size map, and Vanilla md carries it as it
   does Logseq's syntax. Obsidian writes its own spelling over
   `"html"` where it can spell the size (a width in pixels, and a
   height).
8. **Translation honours the Markdown options** of its sides, as
   normalizing does. Normalizing still goes through the other format
   (ADR 0001).

## Consequences

- `useHtml` and `interpretHtml` go, and with them the four-way
  pairing in `docs/CONFIGURATION.md`. With one value in `[markdown]`
  a spelling is read back as it is written, so the round trip
  converges, per config as before (ADR 0002 §5).
- Different sides migrate: `interpretHtml` on and `"markdown"` out
  rewrites a vault's `<dl>` as `Term` / `: def` and converges after one
  trip. `"html"` out without `interpretHtml` in stays the one-way door
  `useHtml` alone was: the HTML returns as an export block.
- Canonical Markdown for description lists changes from
  `- term :: def` to `Term` / `: def`, a breaking change, as is every
  renamed key. GitHub and Obsidian render neither as a list.
- `- term :: def` in Markdown no longer becomes a description list,
  in Vanilla md or Logseq md, which agrees with Logseq (§6).
- **Rejected: `~x~` and `^x^`** for sub- and superscript. GFM reads a
  single `~` as strikethrough (`H~2~O` already comes back as
  `H~~2~~O`), and `^x^` makes literal carets significant, while only
  pandoc reads either without a plugin. A known limitation: both stay
  verbatim org or HTML.
- **Rejected: an `"org"` value.** Org text is not a way to spell a
  construct in Markdown; it is what goes through when Markdown has
  none (§3).
- **Rejected: a restore switch for a recorded style.** It would make a
  recorded file's markers depend on the converting config, silently
  lost without it, to add little `style` cannot.
- **Postponed: tables.** A GFM table loses a table without a header row and a
  mid-table rule, a `<table>` would not; but their affiliated keywords
  are lost at parse time (uniorg#151), their cells hold markup that
  would need HTML too, and which tables a GFM table loses is per
  table, not per config.
