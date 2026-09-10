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
- `convertOrgToMarkdown(org, { preserveOrgisms, preset })` — `preserveOrgisms`
  default `true`
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

Early scaffold. Working both directions: headings, paragraphs, bold/italic,
links, lists (nested, ordered, mixed), and code (inline, fenced/src and
example blocks), and blockquotes/quote blocks. Not yet handled: tables,
images, org-isms/md-isms preservation.

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
