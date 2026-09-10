# [morg](https://github.com/remigius42/morg)

Copyright 2026 [Andreas Remigius Schmidt](https://github.com/remigius42)

[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)
[![CI](https://github.com/remigius42/morg/actions/workflows/ci.yml/badge.svg)](https://github.com/remigius42/morg/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D20-lightgrey.svg)

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

# Dropped constructs are reported on stderr; -s / --silent suppresses
morg --input notes.md --output notes.org --silent

# Normalize to canonical form (same format in and out); this
# canonicalizes — the one-time reformat a first conversion would
# apply anyway (ADR 0001) — it is not a style formatter like prettier
morg normalize --input notes.org --output notes.org
```

### Configuration file

Options can live in a `morg.toml` (auto-discovered in the working
directory, or passed via `--config path`). Precedence: CLI flags >
config file > defaults. Sections mirror the library options objects:

```toml
preset = "logseq"
silent = false

# custom names for org-ism key:: lines (canonical = custom);
# convergence is per-config — convert with the mapping a file
# was written with (ADR 0002)
[orgismKeys]
todo = "state"
scheduled = "when"

[markdownToOrg.preserveMdisms]
html = false

[orgToMarkdown]
useHtml = false
taskCheckboxes = false

[orgToMarkdown.markdownStyle]
emphasis = "_"   # align with prettier
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
- `convertOrgToMarkdown(org, { preserveOrgisms, useHtml, taskCheckboxes,
preset })` — `preserveOrgisms` default `true`; `useHtml` (default
  `false`) renders org-only markup as raw HTML (`<u>`, `<sup>`, `<sub>`,
  `<dl>`) instead of keeping it verbatim; `taskCheckboxes` (default
  `false`, CLI `--task-checkboxes`) is a lossy export mode that maps
  bare `TODO`/`DONE` leaf headlines to GFM task items (`- [ ]` /
  `- [x]`) — headings become list items and do not restore on the
  return trip; anything with priority, tags or content keeps its
  heading and reports via `onWarning`
- `logseq({ nestUnderHeadings })` — default `true`; content following a
  heading nests as child blocks of that heading: paragraphs become child
  headlines one level deeper (in Logseq org every outline block is a
  headline), other constructs stay in the preceding block's body. The
  reverse direction restores headings from `:heading:` properties and
  turns plain block headlines back into paragraphs. Hiccup blocks
  (`[:div …]`) pass through as plain text and are emitted unescaped in
  Markdown. Logseq's own syntax maps both directions: `TODO`/`DONE`
  text markers and `[#A]` priorities ↔ org keywords/priorities, page
  references `[[page]]` and labeled forms `[label]([[page]])` ↔ org
  fuzzy links `[[page][label]]`, block refs `[label](((uuid)))` ↔
  `[[((uuid))][label]]`, and `^^highlight^^` markup survives verbatim
  (it would otherwise re-parse as superscripts).
- `obsidian()` — wikilinks `[[Page]]` / `[[Page|alias]]` ↔ org fuzzy links

- `normalizeMarkdown(md, { preset })` / `normalizeOrg(org, { preset })`
  (CLI: `morg normalize`) — one full round trip to morg's canonical
  form, a fixed point. Canonicalization, not styling: org-isms and
  md-isms are rewritten exactly as a conversion would rewrite them.
  Normalize with the same preset/config you will convert with —
  convergence is per-config (ADR 0002).

- `markdownStyle: { bullet, emphasis, strong, fence, rule }` (on
  `convertOrgToMarkdown` and `normalizeMarkdown`; CLI `--bullet`,
  `--emphasis`, `--strong`, `--fence`, `--rule`) — Markdown output
  style knobs. Defaults match prettier except emphasis (`*italic*`);
  `--emphasis _` aligns fully with prettier. Canonical form is
  per-config (ADR 0001): round trips must use the same style. Note
  CommonMark/GFM prescribe no style — these defaults are morg's
  canonical choices, not a standard.

Both convert functions also accept `onWarning: message => …`, called for
each construct dropped without an equivalent (e.g. image titles, LaTeX
fragments). The CLI wires this to stderr unless `-s` / `--silent` is
given; the library is silent unless a callback is passed.

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

The core conversion surface is feature-complete and validated against
real-world Logseq org vaults (edge cases found there live on as
anonymized fixtures, e.g. `tests/fixtures/logseq-vault.org`); not yet
published to npm.

How each construct maps — including deliberate normalizations and
documented drops — is covered in the
[mapping reference](docs/mappings.md). Notable changes are tracked in
the [changelog](CHANGELOG.md).

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
