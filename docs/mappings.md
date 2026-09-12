# Mapping reference

How each construct maps between Markdown and Org, and which
normalizations to expect. Terms are defined in
[CONTEXT.md](../CONTEXT.md); the design rationale lives in the
[ADRs](adr/).

## Core structure

Both directions: headings, paragraphs, bold/italic/strikethrough,
links, lists (nested, ordered, mixed), code (inline, fenced/src and
example blocks), blockquotes/quote blocks, and horizontal rules
(md `---` ↔ org `-----`). Hard line breaks map md `\` (or two trailing
spaces) ↔ org `\\`. Markdown is parsed and serialized with GFM
enabled.

Images: org has no dedicated image syntax; links to image files map to
md images, alt text ↔ link description. Image title attributes
(`![alt](url "title")`) are dropped by design (reported via
`onWarning`): org links have no title slot, and an inline construct
has no sensible `morg_` property anchor (ADR 0002 reserves properties
for metadata-shaped md-isms).

Tables: GFM ↔ org, including column alignment via org `<l>/<r>/<c>`
cookie rows. `table.el` tables travel as `table.el`-tagged fenced
blocks and are restored verbatim.

## Org-isms (org → md)

Headline metadata serializes to `key:: value` lines directly below the
heading (`todo::`, `priority::`, `tags::`, `scheduled::`, `deadline::`,
`closed::`; property drawer entries keep their own keys) and is
restored to native org syntax on the way back — known keys become TODO
keywords, priorities, tags and planning lines, unknown keys become
property drawer entries. Key names are remappable via `orgismKeys`
(convergence is then per-config, ADR 0002). `preserveOrgisms` accepts
`false` or a per-key record to drop org-isms instead.

Verbatim passthrough (org text kept literally in Markdown, re-parsed
natively on the return trip): generic drawers (`:LOGBOOK:` …),
special / center / verse / comment blocks, fixed-width blocks,
mid-file keywords, babel calls, clocks, diary sexps, non-HTML export
blocks and `@@backend:…@@` snippets. Statistics cookies (`[1/2]`) and
`[cite:…]` citations travel as plain text the same way.

Affiliated keywords (`#+CAPTION:`, `#+NAME:`, `#+ATTR_*`) travel as
verbatim lines directly above their element and re-attach natively on
the return trip — except on org tables, which discard them at parse
time (upstream [uniorg#151](https://github.com/rasendubi/uniorg/issues/151)).

Org comments (`# …`) map to HTML comments (`<!-- … -->`) and back —
both are invisible in rendered output, so the mapping is lossless in
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

Markdown YAML frontmatter maps to leading org keywords (`title: X` ↔
`#+TITLE: X`) in both directions — both constructs are native to their
format. Single-line scalar values pass through as-is; structured YAML
values and multi-line scalars (block or folded) are JSON-encoded on a
single line in org (ADR 0002's value rule) and restored to YAML on the
way back — an org keyword is one line, so a raw newline would end it
and push the rest of the value into the document body.

Reference-style links and images resolve to inline form. A link text
equal to its url becomes an autolink (`<url>`) and restores as a plain
`[[url]]` — the common Logseq bookmark pattern.

## Math and footnotes

LaTeX math maps natively (via remark-math): inline fragments (`$x$`,
`\(x\)`) ↔ `$x$`, display fragments (`$$…$$`, `\[…\]`) and
`\begin{…}` environments ↔ `$$…$$` math blocks — delimiters MathJax,
KaTeX, Obsidian and GitHub all understand.

Footnotes convert between GFM (`[^label]` / `[^label]: …`) and org
(`[fn:label]` / `[fn:label] …`) in both directions; org inline
footnotes (`[fn:: text]`, `[fn:label: text]`) normalize to a standard
reference plus a definition hoisted to the document end (anonymous
ones get generated numeric labels).

## Normalizations

One round trip lands on canonical form (ADR 0001); notable
normalizations beyond formatting:

- link text equal to its url → autolink / plain `[[url]]`
- `[` and `]` in a link or image url → `%5B` / `%5D` (reported via
  `onWarning`): an org bracket-link path cannot hold them, and org's
  own backslash escaping is not read back by uniorg. Equivalent for
  query strings like `?a[]=1`; an IPv6 literal host
  (`http://[::1]/…`) does not survive this and is better written as a
  hostname
- per-line leading whitespace inside paragraphs is collapsed
  (insignificant in org and rendered md, but structurally meaningful
  to md parsers)
- org entities → UTF-8 characters
- inline footnotes → reference + definition
- superscript/subscript → braced form (`^{2}`, `_{2}`)

## Presets

`logseq`: `:heading:` property drawers; outline nesting (paragraphs ↔
child block headlines); `TODO`/`DONE` text markers and `[#A]`
priorities ↔ org keywords/priorities; page references `[[page]]` and
labeled forms `[label]([[page]])` ↔ org fuzzy links `[[page][label]]`;
block refs `[label](((uuid)))` ↔ `[[((uuid))][label]]`; `^^highlight^^`
markup and hiccup (`[:div …]`) survive verbatim, emitted unescaped in
Markdown.

`obsidian`: wikilinks `[[Page]]` / `[[Page|alias]]` ↔ org fuzzy links,
emitted unescaped in Markdown.
