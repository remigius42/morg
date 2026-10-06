# [morg](https://github.com/remigius42/morg)

Copyright 2026 [Andreas Remigius Schmidt](https://github.com/remigius42)

[![npm](https://img.shields.io/npm/v/%40remigius42%2Fmorg?label=npm)](https://www.npmjs.com/package/@remigius42/morg)
[![Changelog](https://img.shields.io/github/v/tag/remigius42/morg?label=changelog)](https://github.com/remigius42/morg/blob/main/CHANGELOG.md)
[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)
[![CI](https://github.com/remigius42/morg/actions/workflows/ci.yml/badge.svg)](https://github.com/remigius42/morg/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D24-lightgrey.svg)
[![Codacy grade](https://app.codacy.com/project/badge/Grade/da438d1b90e74d40b03f9fa5b3eca221)](https://app.codacy.com/gh/remigius42/morg/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)
[![Codacy coverage](https://app.codacy.com/project/badge/Coverage/da438d1b90e74d40b03f9fa5b3eca221)](https://app.codacy.com/gh/remigius42/morg/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_coverage)

Bidirectional **Markdown ↔ Org-mode** converter, built on the
[unified](https://unifiedjs.com/) ecosystem
([remark](https://github.com/remarkjs/remark) for Markdown,
[uniorg](https://github.com/rasendubi/uniorg) for Org).

morg treats Org as a canonical plain-text format and Markdown (Obsidian,
generic) as the interop surface. Dialect conventions, such as
[Logseq](https://docs.logseq.com/)'s outline of blocks and page
properties, are supported via presets. Within one format, morg
translates between two dialects (Logseq Markdown ↔ Markdown, Obsidian
↔ Logseq), changing only what they write differently.

## Round-trip convergence

Strict byte-losslessness between the two formats is impossible. morg's
guarantee is to be **semantically faithful and convergent** instead
(see [ADR 0001](docs/adr/0001-convergence-over-losslessness.md)):

- One round trip (`md → org → md` or `org → md → org`) may normalize formatting,
  but its output is a fixed point: converting again reproduces it byte-for-byte.
- Input already in canonical form is a round-trip identity. Opt-in
  `recordMarkdownStyle` widens that set: a file whose bullet, emphasis, fence
  and rule markers are used consistently has them recorded in the org
  file and restored on the way back, so it is left untouched
  ([ADR 0004](docs/adr/0004-record-source-markdown-style.md)).
- `md → org` preserves Markdown-only constructs ("md-isms") as `morg_`-prefixed
  org properties; `org → md` serializes Org-only constructs ("org-isms") as
  `key:: value` conventions ([ADR
  0002](docs/adr/0002-mdism-property-namespace.md)).
- Frontmatter travels verbatim and inert in a
  `#+begin_comment morg_frontmatter` block, not as org keywords, which
  can act in Emacs; an org file's own leading keywords travel as a
  `morg_keywords` frontmatter entry and come back as keywords, a
  file-level drawer (org-roam's `:ID:`) as `morg_properties`. The
  Logseq preset instead maps page properties natively ([ADR
  0005](docs/adr/0005-frontmatter-as-a-marked-comment-block.md)).
- The few constructs that cannot be carried are documented in the
  [mapping reference](docs/mappings/README.md) and reported as warnings.

Round-trip fixture tests are the backbone of the test suite
(`tests/roundtrip.spec.ts`). The Web UI is covered by vitest specs under
happy-dom and by a Playwright suite (`tests/e2e/`) that drives the built
pages in Chromium and WebKit, including axe accessibility audits in both
color schemes.

## Usage

### Web UI

Try morg without installing anything at
[morg.binarypoetry.ch](https://morg.binarypoetry.ch): paste or drop a
file, pick the formats and dialects, copy or download the result. All
conversion happens in your browser, nothing is uploaded. Its options,
file handling and the embed page are described in the [Web UI
guide](docs/web-ui.md).

### CLI

```bash
npx @remigius42/morg --input notes.md --output notes.org
```

The formats follow from the file extensions. Every flag and the
`morg.toml` config file are described in the [CLI
reference](docs/cli.md).

### Library

```bash
npm install @remigius42/morg
```

```ts
import { convertMarkdownToOrg, convertOrgToMarkdown } from "@remigius42/morg"

const org = convertMarkdownToOrg("# Hello\n\nWorld.")
const md = convertOrgToMarkdown(org)
```

Every function and option is described in the
[library reference](docs/library.md).

## Architecture

Two pipelines, each with a two-phase transformation separating the
dialect-agnostic core from dialect presets:

```text
md → org:  remark-parse → mdast→uniorg (core) → read md dialect → write org dialect → uniorg-stringify
org → md:  uniorg-parse → read org dialect → write md dialect → uniorg→mdast (core) → remark-stringify
```

Formatting is controlled by shaping the AST (e.g. inserting newline text nodes),
not by custom stringifier handlers. The default, battle-tested
stringifiers do the rendering.

Project vocabulary lives in [CONTEXT.md](CONTEXT.md); design decisions in
[docs/adr/](docs/adr/README.md); all docs are listed in the
[docs index](docs/README.md), and are on the
[website](https://morg.binarypoetry.ch/docs/index.html) as well.

## Status

The core conversion surface is feature-complete and validated against
real-world Logseq org vaults (edge cases found there live on as
anonymized fixtures, e.g. `tests/fixtures/logseq-vault.org`), and
the conversions between a Logseq dialect and Vanilla Org or Markdown,
and the translations between two dialects of one format, are checked
by round trips of that vault and of public Markdown and Org
documentation from either side; the
client-side [Web UI](https://morg.binarypoetry.ch) is deployed from
`main`. The npm package is `@remigius42/morg`, since the bare `morg`
name is taken, and pushing a `v*` tag publishes it. Most of the code is
written with an AI coding agent under human direction, test-first and
CI-gated. See
the [contributing guide](CONTRIBUTING.md#development-process).

How each construct maps, including deliberate normalizations and
documented drops, is covered in the
[mapping reference](docs/mappings/README.md). Notable changes are tracked in
the [changelog](CHANGELOG.md).

## Contributing

See the [contributing guide](CONTRIBUTING.md) for setup, conventions
and the test-first workflow; participation is governed by the
[code of conduct](CODE_OF_CONDUCT.md).

## License

[GPL-3.0-or-later](LICENSE) (required by the uniorg dependencies).
The licenses of the third-party packages morg and the Web UI are built
on are listed at
[morg.binarypoetry.ch/licenses.html](https://morg.binarypoetry.ch/licenses.html)
(see [ADR 0008](docs/adr/0008-third-party-licenses-page.md)).
