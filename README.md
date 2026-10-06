# [morg](https://github.com/remigius42/morg)

Copyright 2026 [Andreas Remigius Schmidt](https://github.com/remigius42)

[![npm](https://img.shields.io/npm/v/%40remigius42%2Fmorg?label=npm)](https://www.npmjs.com/package/@remigius42/morg)
[![Changelog](https://img.shields.io/github/v/tag/remigius42/morg?label=changelog)](https://github.com/remigius42/morg/blob/main/CHANGELOG.md)
[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)
[![CI](https://github.com/remigius42/morg/actions/workflows/ci.yml/badge.svg)](https://github.com/remigius42/morg/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D24-lightgrey.svg)
[![Codacy grade](https://app.codacy.com/project/badge/Grade/da438d1b90e74d40b03f9fa5b3eca221)](https://app.codacy.com/gh/remigius42/morg/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)
[![Codacy coverage](https://app.codacy.com/project/badge/Coverage/da438d1b90e74d40b03f9fa5b3eca221)](https://app.codacy.com/gh/remigius42/morg/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_coverage)

Low-friction conversion between **Markdown and Org-mode**, and between
their dialects, so your notes are not locked into the app that wrote
them.

Note-taking apps each write their own dialect: Logseq writes empty
blocks, task markers and a block's first line in an org that Emacs
reads otherwise, and Obsidian has its wikilinks and callouts. Leaving an
app, or using a second tool on the same notes, should not mean
rewriting them by hand. morg treats Org as a canonical plain-text
format and Markdown as the interop surface:

- **Convert** Markdown ↔ Org, in Vanilla, [Logseq](https://logseq.com/)
  or [Obsidian](https://obsidian.md/) dialect per side.
- **Translate** between two dialects of one format, changing only what
  they write differently: Logseq org to Org that Emacs reads as
  intended, Logseq Markdown ↔ Markdown, Obsidian ↔ Logseq.
- **Normalize** a file to morg's canonical form.

Strict byte-losslessness between the two formats is impossible, so
morg's guarantee is to be **semantically faithful and convergent**
([ADR 0001](docs/adr/0001-convergence-over-losslessness.md)): one round
trip may normalize formatting, but its output is a fixed point.
Constructs that cannot be carried are documented in the [mapping
reference](docs/mappings/README.md) and reported as warnings.

morg is not a style formatter like prettier, nor a sync tool: it
converts one file at a time, and a whole vault is a shell loop. It is
built on the [unified](https://unifiedjs.com/) ecosystem
([remark](https://github.com/remarkjs/remark) for Markdown,
[uniorg](https://github.com/rasendubi/uniorg) for Org).

## Status

Pre-1.0: options may still change between minor versions; breaking
changes are marked in the [changelog](CHANGELOG.md). Changes are
checked by round trips of real Logseq graphs and of public Markdown
and Org documentation (the Rust book, GitHub's and MDN's docs, Worg).
Most of the code is written by an AI coding agent under human
direction, test-first and CI-gated; see the [contributing
guide](CONTRIBUTING.md#development-process).

## Usage

### Prerequisites

The Web UI needs only a current browser. The CLI and the library need
[Node.js](https://nodejs.org/) 24 or later.

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

### Documentation

All docs are listed in the [docs index](docs/README.md) and are on the
[website](https://morg.binarypoetry.ch/docs/index.html) as well: the
[mapping reference](docs/mappings/README.md), the
[configuration](docs/configuration.md), the
[architecture](docs/architecture.md) and the design decisions in
[docs/adr/](docs/adr/README.md). Project vocabulary lives in
[CONTEXT.md](CONTEXT.md).

## Contributing

PRs are welcome. Fair warning: this is a personal project maintained on
a best-effort basis, so responses and reviews may be slow and changes
that don't fit the use case are unlikely to be merged.
[Opening an issue first to discuss](https://github.com/remigius42/morg/issues/new?template=feature_request.yml)
is the best use of your time. Bugs go to the
[bug report form](https://github.com/remigius42/morg/issues/new?template=bug_report.yml),
ideally with the input that shows them.

Please report vulnerabilities privately — see
[SECURITY.md](.github/SECURITY.md). To get started, have a look at
[CONTRIBUTING.md](CONTRIBUTING.md). Participation is governed by the
[code of conduct](CODE_OF_CONDUCT.md).

## Funding

This project is powered by coffee, therefore I would appreciate if you could

<a href="https://www.buymeacoffee.com/remigius" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="60" width="217" alt="Buy Me A Coffee" /></a>

thank you!

## License

[GPL-3.0-or-later](LICENSE) (required by the uniorg dependencies).
The licenses of the third-party packages morg and the Web UI are built
on are listed at
[morg.binarypoetry.ch/licenses.html](https://morg.binarypoetry.ch/licenses.html)
(see [ADR 0008](docs/adr/0008-third-party-licenses-page.md)).
