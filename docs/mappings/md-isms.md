# Md-isms (md → org)

## Raw HTML

Raw HTML is preserved as org `#+begin_export html` blocks (block
level) and `@@html:...@@` export snippets (inline), restored verbatim
on the way back; `preserveMdisms` accepts `false` or a per-key record
(e.g. `{ html: false }`) to drop them instead.

## Frontmatter

Markdown YAML frontmatter travels verbatim, comments and multi-line
values included, in a comment block marked as morg's, leading the org
file (ADR 0005):

```org
#+begin_comment morg_frontmatter
title: A Note
tags: [a, b]
#+end_comment
```

The block is inert in Emacs and in export. No key maps to an org
keyword, `title` included: frontmatter is passive data, while keywords
like `#+TAGS`, `#+TODO` or `#+INCLUDE` act. A YAML line org would read
as a headline or keyword (`* …`, `#+…`, also indented or already
comma-escaped) gets Org's own comma escape in the block, and loses it
again on the way back. A comment block without the marker is the
user's and converts like any other. On the way back the block is found
anywhere before the first headline, below an Emacs mode line or an
org-roam property drawer say, by its own begin line (a second one
there stays a comment block, and reports via `onWarning`); keywords org
attached to it (`#+NAME:` directly above it) come back as keywords,
links and markup in a caption kept, but apart from the block, as
nothing reads them on a comment block; a dual one
(`#+CAPTION[short]: long`) comes back as the plain keyword
`#+CAPTION[SHORT]: long`, as org reads it apart. Both report via
`onWarning`. The
next md → org puts it near the top again, since Markdown frontmatter
leads the file: an Emacs mode line (`# -*- mode: org -*-`, an HTML
comment in Markdown) goes back to the first line if it is the
Markdown body's first node, the file-level drawer below it, then the
keywords and the block. A `-*-` comment below an org file's first
line, which Emacs ignores, must not get there: leading keywords
directly above one stay `#+KEY:` lines in the Markdown body, and one
that leads the Markdown body all the same (below the block or drawer,
or a blank first line) reports via `onWarning`. Keywords below another
comment stay `#+KEY:` lines below it. A `---`
line in the block would end Markdown frontmatter early; it reports via
`onWarning`.

A real org file's leading keywords (`#+TITLE`, `#+STARTUP`,
`#+FILETAGS`) travel the other way as a `morg_keywords` frontmatter
entry, an ordered sequence of one-entry maps, and come back as the same
keywords ahead of the block; order and repeats survive, keys come back
upper-cased as uniorg reads them (Org ignores keyword case), values as
written (`1.10` stays `1.10`, not the number `1.1`):

```yaml
morg_keywords:
  - TITLE: A Note
  - STARTUP: overview
  - FILETAGS: ":one:two:"
```

`morg_keywords` joins the frontmatter as one more entry, which takes a
block mapping without one of its own, or comments alone; next to a
frontmatter that is a list, a flow mapping, an indented mapping or ends
in `...`, the keywords stay `#+KEY:` lines
in the Markdown body instead (they come back as keywords all the same,
affiliated ones attached to what follows them)
and report via `onWarning`; a file-level drawer then stays `key::`
text, and reports too. Such files may not converge (a known limit):
an `#+OPTIONS: ^:{}` md → org adds can repeat, and with the Logseq
preset the page properties can end up in a block.

`morg_keywords` restores only if every entry fits a keyword line: no
line break in the value, which would end the line and inject org
structure (a headline, an `#+INCLUDE:`), and a key that reads back
as the same keyword (no spaces outside a dual value's brackets, not
`begin_…`, which begins a block). Otherwise the
entry stays in the block as written. Comments within a restored entry
stay in the block, each on a line of its own.

A file-level property drawer (org-roam's `:ID:`), which org reads as
the file's only where nothing but comments precede it, travels the
same way as a `morg_properties` entry and comes back as that drawer,
leading the file ahead of every keyword; a key with whitespace, the
key `END`, which would close the drawer, or a value with a line break
keeps the entry in the block:

```yaml
morg_properties:
  - ID: 3f1c…
  - ROAM_ALIASES: '"A b"'
```

If either entry stays in the block, so does the other: on the way back
the frontmatter would not take it again.

A restored keyword org would attach to the element below it
(`#+CAPTION`, `#+NAME` and its aliases such as `#+SOURCE`, `#+ATTR_*`)
gets a blank line after it, so it stays a document keyword.

Files written by 0.6.0 and earlier carry their frontmatter as such
keywords, so they now read as org-native keywords too.

Entries leave the frontmatter only where they can be cut out of its
text whole: from a block-style mapping, one entry per line, and not
when the frontmatter uses YAML aliases, which would lose their anchor,
or has YAML errors.
Flow-style (`{title: x}`) or aliased frontmatter stays in the block as
it is, `morg_keywords` included.

## Reference links

Reference-style links and images resolve to inline form. A link text
equal to its url becomes an autolink (`<url>`) and restores as a plain
`[[url]]`, the common Logseq bookmark pattern.

## Headings and nested lists

A heading inside a list item has no org equivalent (a headline cannot
live inside a list); its text stays as a line of the item, without the
heading level, and reports via `onWarning`. The same goes for a
heading inside a blockquote: Emacs ends a quote block at a headline.

Org ends a nested list at a line indented like its parent item's text;
md would read that line as a lazy continuation of the nested list's
last item. org → md separates it with a blank line.
