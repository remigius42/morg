# 0009: Docs on the site

## Status

Accepted (2026-10-06)

## Context

The docs (docs/ and CONTEXT.md) were readable only in the repository,
in GitHub's file view, while the site's landing page pointed there for
the mapping reference and configuration. The site already parses
Markdown with remark and is styled by Pico, which styles plain HTML
(headings, tables, code) without classes.

## Decision

`scripts/write-docs.mjs` renders docs/ and CONTEXT.md as site pages
before every Web UI build and dev server start, into web/docs/, which
web/vite.config.ts builds along with the other pages. The rendering is
remark-parse and remark-gfm, as the converter reads Markdown, then
remark-rehype, rehype-slug for GitHub's heading anchors, Shiki for
code blocks, and rehype-stringify. docs/ keeps its layout under
`/docs/`, a folder's README becomes its index page, and CONTEXT.md
becomes `/docs/context.html`. A relative link to a published file goes
to its page, a link to any other file of the repository to GitHub, so
the Markdown links stay as they read on GitHub.

`/docs/index.html` is generated, not rendered from docs/README.md: it
lists every published page by its first heading, a folder's pages
nested under its index, so a new doc appears without editing a list.
docs/README.md stays the index on GitHub.

The pages' layout is VitePress's, as binarypoetry.ch's pages are: the
text keeps its reading width, 688px at 16px, as 43rem so the measure,
about 90 characters, holds as Pico scales the type up with the
viewport. Beyond that, the styling is Pico's, but for a scrolling
wrapper for wide tables and Shiki's bold and italic.

Code is highlighted at build time in binarypoetry.ch's Shiki themes,
Light Plus with the brand colors in place of the three it replaces for
contrast, and Synthwave '84, on Pico's code background. Shiki is the
one highlighter with an org grammar (highlight.js and Prism have
none). Its `light-dark()` colors follow the `color-scheme` Pico sets
for the theme toggle, so the pages ship no highlighting script.

Every page's head boilerplate, header and footer come from one place,
web/chrome.ts, which a Vite plugin fills into each page's placeholders;
the docs pages use the same placeholders, and the nav gains a Docs link.

## Consequences

- The site's docs are as current as `main`: they deploy with it, as
  the Web UI does (ADR 0003).
- The rendered pages are generated and gitignored, like the license
  lists (ADR 0008); the dev server renders them at start, not on
  every edit of a doc.
- A doc's own HTML is kept as written, as GitHub shows it, though not
  sanitized as GitHub does: the docs are the repository's own. A
  heading or code block written in HTML gets no anchor or highlighting.
- A code block in a language not loaded in scripts/docsPages.mjs
  (bash, markdown, org, toml, yaml) stays plain.
- Rejected: a static site generator such as VitePress (a second
  theme to keep matching the site, for some fifteen pages); rendering
  docs/README.md as the index (one more list to keep current by hand,
  and it leaves out the ADRs and CONTEXT.md).
