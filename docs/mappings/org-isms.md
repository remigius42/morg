# Org-isms (org → md)

## Headline metadata

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

Property values are org text. Where one may read as Markdown syntax (a
url, `*`, `_`, `<…>`), org → md writes a `<!-- morg_properties -->`
comment above the lines, and md → org takes the lines below it back
as written. Unmarked lines are Markdown, as a person writes them (an
Obsidian Dataview field below a heading): their values convert, and a
paragraph whose values hold Markdown markup stays text.

## Verbatim passthrough

Verbatim passthrough (org text kept literally in Markdown, re-parsed
natively on the return trip): generic drawers (`:LOGBOOK:` …),
special blocks of no alert type (see
[GFM alerts](core.md#gfm-alerts)), center, verse and comment
blocks, fixed-width blocks,
mid-file keywords, babel calls, clocks, diary sexps, non-HTML export
blocks and `@@backend:…@@` snippets. A block or drawer comes back whole even
where its lines read as Markdown syntax (a blank line and an indented
line, a `#` or `-` line), a special block with its parameters
(`#+begin_x Title`), which uniorg drops and morg reads from the begin
line. Statistics cookies (`[1/2]`) and
`[cite:…]` citations travel as plain text the same way.

## Affiliated keywords

Affiliated keywords (`#+CAPTION:`, `#+NAME:`, `#+ATTR_*`) travel as
verbatim lines directly above their element and re-attach natively on
the return trip, a dual value included (`#+CAPTION[short]: long`,
`#+RESULTS[hash]: …`). uniorg discards an org table's at parse time
(upstream [uniorg#151](https://github.com/rasendubi/uniorg/issues/151)),
so org → md sets them apart from the table first, in a quote or other
greater block too, where they travel as keywords of their own and md →
org writes them right above it again. On a table that leads the file
they stay such lines rather than join the file's keywords in the
frontmatter.

## Comments

Org comments (`# …`) map to HTML comments (`<!-- … -->`) and back.
Both are invisible in rendered output, so the mapping is lossless in
both directions. A `-->` inside the comment body is written as
`--&gt;` (and decoded on the way back), since it would otherwise close
the HTML comment early and leak the rest of the line into the page.
A comment that starts a list item goes on the line below the bullet
(`-`, then `# …` indented): org reads `- # …` as text.

## Underline, scripts and descriptive lists

Org underline, superscript and subscript have no Markdown equivalent;
their raw org markup (`_text_`, `^{2}`, `_{2}`) is kept verbatim as
escaped text and re-parsed natively on the way back (same approach as
inline org timestamps, which survive verbatim including
active/inactive ranges). Descriptive lists become definition lists
(`term` / `:   definition`, PHP Markdown Extra's syntax, which pandoc,
kramdown and Logseq read too) and back, a term's markup and its
definition's blocks included; one with an item without a term or with
a checkbox, or a numbered one (Emacs reads it as numbered), keeps its `- term :: definition` text below a
`<!-- morg_descriptive_list -->` comment, which reads the list back as
descriptive (ADR 0007 §3). Markdown's
definitions merge into one per term, and a term without its own (one of
several above a definition) gets an empty one, both with a warning.
Known limitation: Markdown does not read a definition list inside a
list item (upstream, micromark-extension-definition-list), so a
descriptive list nested in an org list item comes back as the item's
text; it converges, but its terms are lost. In a quote or another
definition it is read. An unmarked
`- term :: definition` Markdown list item stays one: a zero-width space
before the `::` keeps org from reading a tag. A fixed-width line's `:`
is escaped (`\: text`), as a line below text that starts with a colon starts a definition.
Spelled
in HTML (`spelling: "html"`, ADR 0007) these constructs render as raw
HTML instead (`<u>`, `<sup>`, `<sub>`, `<dl>`); the HTML round-trips
to the native org construct where `interpretHtml` reads it, else as a
preserved md-ism. A `<dl>` holds text only, its markup flattened: a
descriptive list whose definition holds blocks (an image, a nested
list, a second paragraph) goes below the marker as `- term :: def`
text instead, which renders as a bullet list, not a definition list
(ADR 0007 §3: `Term` / `: def` would show such a block as code in
GFM).

## Entities

Org entities render as their character (`\alpha` → `α`), matching
org's own export (one-way normalization).
