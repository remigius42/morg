# [morg](https://github.com/remigius42/morg)

Copyright 2026 [Andreas Remigius Schmidt](https://github.com/remigius42)

[![Version](https://img.shields.io/github/v/tag/remigius42/morg?label=version)](https://github.com/remigius42/morg/blob/main/CHANGELOG.md)
[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)
[![CI](https://github.com/remigius42/morg/actions/workflows/ci.yml/badge.svg)](https://github.com/remigius42/morg/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D20-lightgrey.svg)
[![Codacy grade](https://app.codacy.com/project/badge/Grade/da438d1b90e74d40b03f9fa5b3eca221)](https://app.codacy.com/gh/remigius42/morg/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)
[![Codacy coverage](https://app.codacy.com/project/badge/Coverage/da438d1b90e74d40b03f9fa5b3eca221)](https://app.codacy.com/gh/remigius42/morg/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_coverage)

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
guarantee is to be **semantically faithful and convergent** instead
(see [ADR 0001](docs/adr/0001-convergence-over-losslessness.md)):

- One round trip (`md → org → md` or `org → md → org`) may normalize formatting,
  but its output is a fixed point: converting again reproduces it byte-for-byte.
- Input already in canonical form is a round-trip identity.
- `md → org` preserves Markdown-only constructs ("md-isms") as `morg_`-prefixed
  org properties; `org → md` serializes Org-only constructs ("org-isms") as
  `key:: value` conventions ([ADR
  0002](docs/adr/0002-mdism-property-namespace.md)).
- The few constructs that cannot be carried are documented in the
  [mapping reference](docs/mappings.md) and reported as warnings.

Round-trip fixture tests are the backbone of the test suite
(`tests/roundtrip.spec.ts`).

## Usage

### Web UI

Try morg without installing anything at
[morg.binarypoetry.ch](https://morg.binarypoetry.ch) — all conversion
happens in your browser, nothing is uploaded (see [ADR
0003](docs/adr/0003-client-side-web-ui-on-github-pages.md)). The
chrome-less embed page (`/embed.html`, optionally with
`?theme=dark|light`) can be iframed into other sites.

### CLI

```bash
# Formats inferred from file extensions
morg --input notes.md --output notes.org

# stdin/stdout with explicit format
echo "# Hello" | morg --from markdown

# Apply a dialect preset
morg --input page.md --output page.org --preset logseq

# Dropped constructs are reported on stderr; -s / --silent suppresses.
# Boolean flags take an optional value, so --silent false overrides a
# morg.toml that sets it
morg --input notes.md --output notes.org --silent

# Normalize to canonical form (same format in and out); this
# canonicalizes — the one-time reformat a first conversion would
# apply anyway (ADR 0001) — it is not a style formatter like prettier
morg normalize --input notes.org --output notes.org
```

### Configuration file

Options can live in a `morg.toml` (auto-discovered in the working
directory, or passed via `--config path`). Precedence: CLI flags >
config file > defaults:

```toml
preset = "logseq"

[orgToMarkdown.markdownStyle]
emphasis = "_" # align with prettier
```

The full reference — all sections and compatibility snippets for
prettier and mdformat — is in
[docs/CONFIGURATION.md](docs/CONFIGURATION.md).

### Library

```ts
import { convertMarkdownToOrg, convertOrgToMarkdown, logseq } from "morg"

const org = convertMarkdownToOrg("# Hello\n\nWorld.")
const md = convertOrgToMarkdown(org)

// Logseq dialect
const logseqOrg = convertMarkdownToOrg(markdown, { preset: logseq() })
```

Options (flags accept `boolean` or a per-construct `Record<string, boolean>`):

- `convertMarkdownToOrg(md, { preserveMdisms, interpretHtml, preset })` —
  `preserveMdisms` default `true`; `interpretHtml` (default `false`,
  CLI `--interpret-html`) interprets the HTML vocabulary morg itself
  emits under `useHtml` (bare `<u>`, `<sup>`, `<sub>`, `<dl>`) as
  native Org constructs — the inverse of `useHtml`: with both enabled
  the round trip is lossless, with `interpretHtml` alone it converges
  away from HTML (cleanup mode); other HTML preserves as usual
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

- `markdownStyle: { bullet, emphasis, strong, fence, rule, ruleRepetition }`
  (on `convertOrgToMarkdown` and `normalizeMarkdown`; CLI `--bullet`,
  `--emphasis`, `--strong`, `--fence`, `--rule`, `--rule-repetition`)
  — Markdown output style knobs. Defaults match prettier except emphasis (`*italic*`);
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
anonymized fixtures, e.g. `tests/fixtures/logseq-vault.org`); the
client-side [Web UI](https://morg.binarypoetry.ch) is deployed from
`main`; not yet published to npm. Most of the code is written with an
AI coding agent under human direction, test-first and CI-gated — see
the [contributing guide](CONTRIBUTING.md#development-process).

How each construct maps — including deliberate normalizations and
documented drops — is covered in the
[mapping reference](docs/mappings.md). Notable changes are tracked in
the [changelog](CHANGELOG.md).

## Contributing

See the [contributing guide](CONTRIBUTING.md) for setup, conventions
and the test-first workflow; participation is governed by the
[code of conduct](CODE_OF_CONDUCT.md).

## License

[GPL-3.0-or-later](LICENSE) (required by the uniorg dependencies).
