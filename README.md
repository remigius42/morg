# morg

Bidirectional **Markdown ↔ Org-mode** converter, built on the
[unified](https://unifiedjs.com/) ecosystem
([remark](https://github.com/remarkjs/remark) for Markdown,
[uniorg](https://github.com/rasendubi/uniorg) for Org).

morg treats Org as a canonical plain-text format and Markdown (Obsidian,
generic) as the interop surface. Dialect conventions — such as
[Logseq](https://docs.logseq.com/)'s `heading::` properties and outline nesting
— are supported via presets.

## Round-trip convergence

Strict byte-losslessness between the two formats is impossible. morg's
correctness guarantee is **convergence** instead (see [ADR
0001](docs/adr/0001-convergence-over-losslessness.md)):

- One round trip (`md → org → md` or `org → md → org`) may normalize formatting,
  but its output is a fixed point: converting again reproduces it byte-for-byte.
- Input already in canonical form is a round-trip identity.
- `md → org` preserves Markdown-only constructs ("md-isms") as `morg_`-prefixed
  org properties; `org → md` serializes Org-only constructs ("org-isms") as
  `key:: value` conventions ([ADR
  0002](docs/adr/0002-mdism-property-namespace.md)).

Round-trip fixture tests are the backbone of the test suite
(`tests/roundtrip.spec.ts`).

## Usage

### CLI

```bash
# Formats inferred from file extensions
morg --input notes.md --output notes.org

# stdin/stdout with explicit format
echo "# Hello" | morg --from markdown

# Apply a dialect preset
morg --input page.md --output page.org --preset logseq
```

### Library

```ts
import { convertMarkdownToOrg, convertOrgToMarkdown, logseq } from "morg"

const org = convertMarkdownToOrg("# Hello\n\nWorld.")
const md = convertOrgToMarkdown(org)

// Logseq dialect
const logseqOrg = convertMarkdownToOrg(markdown, { preset: logseq() })
```

Options (flags accept `boolean` or a per-construct `Record<string, boolean>`):

- `convertMarkdownToOrg(md, { preserveMdisms, preset })` — `preserveMdisms`
  default `true`
- `convertOrgToMarkdown(org, { preserveOrgisms, useHtml, preset })` —
  `preserveOrgisms` default `true`; `useHtml` (default `false`) renders
  org-only markup as raw HTML (`<u>`, `<sup>`, `<sub>`, `<dl>`) instead
  of keeping it verbatim
- `logseq({ nestUnderHeadings })` — default `true`; content following a heading
  becomes children of that heading's block

## Architecture

Two pipelines, each with a two-phase transformation separating the
dialect-agnostic core from dialect presets:

```text
md → org:  remark-parse → mdast→uniorg (core) → preset transforms → uniorg-stringify
org → md:  uniorg-parse → preset extraction → uniorg→mdast (core) → remark-stringify
```

Formatting is controlled by shaping the AST (e.g. inserting newline text nodes),
not by custom stringifier handlers — the default, battle-tested stringifiers do
the rendering.

Project vocabulary lives in [CONTEXT.md](CONTEXT.md); design decisions in
[docs/adr/](docs/adr/).

## Status

Early scaffold. Working both directions: headings, paragraphs,
bold/italic/strikethrough, links, lists (nested, ordered, mixed), and code
(inline, fenced/src and
example blocks), blockquotes/quote blocks, images (org side: links to
image files, alt text as description), horizontal rules (md `---` ↔ org
`-----`), hard line breaks (md `\` or two spaces ↔ org `\\`), and tables
(GFM ↔ org, incl.
column alignment via org `<l>/<r>/<c>` cookie rows; `table.el` tables
are TODO). Markdown is parsed and serialized with GFM enabled.

Org-isms serialize to `key:: value` lines directly below the heading
(`todo::`, `priority::`, `tags::`, `scheduled::`, `deadline::`,
`closed::`; property drawer entries keep their own keys) and are
restored to native org syntax on the way back — known keys become
TODO keywords, priorities, tags and planning lines, unknown keys become
property drawer entries. `preserveOrgisms` accepts `false` or a
per-key record to drop them instead.

Md-isms: raw HTML is preserved as org `#+begin_export html` blocks
(block level) and `@@html:...@@` export snippets (inline), restored
verbatim on the way back; `preserveMdisms` accepts `false` or a
per-key record (e.g. `{ html: false }`) to drop them instead.

Footnotes convert between GFM (`[^label]` / `[^label]: …`) and org
(`[fn:label]` / `[fn:label] …`) in both directions.

Org underline, superscript and subscript have no Markdown equivalent;
their raw org markup (`_text_`, `^{2}`, `_{2}`) is kept verbatim as
escaped text on `org → md` and re-parsed natively on the way back
(same approach as inline timestamps). Descriptive lists keep their
`- term :: definition` syntax literally in Markdown list items and are
re-parsed as descriptive lists on the return trip. With
`useHtml: true` these constructs render as raw HTML instead (`<u>`,
`<sup>`, `<sub>`, `<dl>`); the HTML then round-trips as a preserved
md-ism (org export blocks/snippets), not back to native org markup.

Not yet handled: frontmatter and Obsidian wikilinks (preset/md-ism
territory rather than core).

## Development

```bash
npm install
npm run test:unit   # vitest watch mode (test:unit:ci for one-shot)
npm run lint        # prettier, cspell, markdownlint, eslint, typecheck
npm run build       # tsc → dist/
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/),
enforced via husky + commitlint; lint-staged runs the linters on staged files.

## License

[GPL-3.0-or-later](LICENSE) (required by the uniorg dependencies).
