# [morg](https://github.com/remigius42/morg)

Copyright 2026 [Andreas Remigius Schmidt](https://github.com/remigius42)

[![npm](https://img.shields.io/npm/v/%40remigius42%2Fmorg?label=npm)](https://www.npmjs.com/package/@remigius42/morg)
[![Changelog](https://img.shields.io/github/v/tag/remigius42/morg?label=changelog)](https://github.com/remigius42/morg/blob/main/CHANGELOG.md)
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
generic) as the interop surface. Dialect conventions, such as
[Logseq](https://docs.logseq.com/)'s outline of blocks and page
properties, are supported via presets.

## Round-trip convergence

Strict byte-losslessness between the two formats is impossible. morg's
guarantee is to be **semantically faithful and convergent** instead
(see [ADR 0001](docs/adr/0001-convergence-over-losslessness.md)):

- One round trip (`md → org → md` or `org → md → org`) may normalize formatting,
  but its output is a fixed point: converting again reproduces it byte-for-byte.
- Input already in canonical form is a round-trip identity. Opt-in
  `recordStyle` widens that set: a file whose bullet, emphasis, fence
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
  [mapping reference](docs/mappings.md) and reported as warnings.

Round-trip fixture tests are the backbone of the test suite
(`tests/roundtrip.spec.ts`). The Web UI is covered by vitest specs under
happy-dom and by a Playwright suite (`tests/e2e/`) that drives the built
pages in Chromium and WebKit, including axe accessibility audits in both
color schemes.

## Usage

### Web UI

Try morg without installing anything at
[morg.binarypoetry.ch](https://morg.binarypoetry.ch). All conversion
happens in your browser, nothing is uploaded (see [ADR
0003](docs/adr/0003-client-side-web-ui-on-github-pages.md)). The
chrome-less embed page (`/embed.html`, optionally with
`?theme=dark|light`) can be iframed into other sites. It posts its
content height to the host on every change, so the frame can follow it
rather than scrolling inside a page that already scrolls:

```js
addEventListener("message", event => {
  if (event.origin !== "https://morg.binarypoetry.ch") return
  if (event.data?.type === "morg:height") {
    frame.style.height = `${event.data.height}px`
  }
})
```

Give the frame at least 768px of width if you can; below that the
input and output stack, which doubles its height. `allow="clipboard-write"`
lets the Copy button use the clipboard rather than falling back to
selecting the output.

Besides pasting, a file can be opened with the picker or dropped
anywhere on the page: a `.toml` lands in the config panel, a document
in the input, and the conversion direction follows the extension. Drop
both at once and each goes where it belongs; an overlay names what is
accepted while a drag is in flight, and anything that turns out not to
be text is named in the warning list rather than loaded. The result can
be copied or saved with the Copy and Download buttons; a normalized file
is saved as `notes.normalized.org`, and switching to a direction that no
longer reads the opened file falls back to a generic name, so neither
lands on top of its own source. Files are read and written by the
browser itself; this is not an upload.

Typing is converted once you pause, not once per keystroke, and the
conversion itself runs in a web worker, so the page stays responsive
even while a large document is being converted. Copy and Download are
unavailable for as long as a conversion is running, so they can never
save the previous document's output.

### CLI

Run it without installing, or install it globally:

```bash
npx @remigius42/morg --input notes.md --output notes.org
npm install --global @remigius42/morg
```

```bash
# Every flag, with examples; also shown for a bare `morg`
morg --help

# Formats inferred from file extensions; --from and --to take a format
# name (markdown or org), not a path
morg --input notes.md --output notes.org

# stdin/stdout with explicit format
echo "# Hello" | morg --from markdown

# Apply a dialect preset
morg --input page.md --output page.org --preset logseq

# Or one per side: read Logseq org, write Vanilla Markdown (ADR 0006)
morg --input page.org --output page.md --input-preset logseq

# Dropped constructs are reported on stderr; -s / --silent suppresses.
# Boolean flags take an optional value, so --silent false overrides a
# morg.toml that sets it
morg --input notes.md --output notes.org --silent

# Record the source's own markdown style (bullet, emphasis, fence,
# rule) in the org file, so the return trip restores it instead of
# canonicalizing it; markers used inconsistently warn and are skipped
morg --input notes.md --output notes.org --record-style

# Normalize to canonical form (same format in and out); this
# canonicalizes (the one-time reformat a first conversion would apply
# anyway, ADR 0001); it is not a style formatter like prettier
morg normalize --input notes.org --output notes.org
```

### Configuration file

Options can live in a `morg.toml` (auto-discovered in the working
directory, or passed via `--config path`). Precedence: CLI flags >
config file > defaults, per side for the presets:

```toml
preset = "logseq"

[orgToMarkdown.markdownStyle]
emphasis = "_" # align with prettier
```

The full reference, covering all sections and compatibility snippets
for prettier and mdformat, is in
[docs/CONFIGURATION.md](docs/CONFIGURATION.md).

### Library

```bash
npm install @remigius42/morg
```

morg is ESM-only and ships its own type declarations:

```ts
import {
  convertMarkdownToOrg,
  convertOrgToMarkdown,
  logseq
} from "@remigius42/morg"

const org = convertMarkdownToOrg("# Hello\n\nWorld.")
const md = convertOrgToMarkdown(org)

// Logseq dialect
const logseqOrg = convertMarkdownToOrg(markdown, { preset: logseq() })
```

Options (flags accept `boolean` or a per-construct `Record<string, boolean>`):

- `convertMarkdownToOrg(md, { preserveMdisms, interpretHtml, recordStyle,
preset })`:
  `preserveMdisms` default `true`; `interpretHtml` (default `false`,
  CLI `--interpret-html`) interprets the HTML vocabulary morg itself
  emits under `useHtml` (bare `<u>`, `<sup>`, `<sub>`, `<dl>`) as
  native Org constructs, the inverse of `useHtml`: with both enabled
  the round trip is lossless, with `interpretHtml` alone it converges
  away from HTML (cleanup mode); other HTML preserves as usual;
  `recordStyle` (default `false`, CLI `--record-style`) records the
  document-level markdown style as a `#+MORG_MARKDOWN_STYLE:` keyword so the
  round trip restores it (ADR 0004)
- `convertOrgToMarkdown(org, { preserveOrgisms, useHtml, taskCheckboxes,
preset })`: `preserveOrgisms` default `true`; `useHtml` (default
  `false`) renders org-only markup as raw HTML (`<u>`, `<sup>`, `<sub>`,
  `<dl>`) instead of keeping it verbatim; `taskCheckboxes` (default
  `false`, CLI `--task-checkboxes`) is a lossy export mode that maps
  bare `TODO`/`DONE` leaf headlines to GFM task items (`- [ ]` /
  `- [x]`); headings become list items and do not restore on the
  return trip; anything with priority, tags or content keeps its
  heading and reports via `onWarning`
- `logseq()`: a page is Logseq's outline of blocks, converted block by
  block: a headline (stars, a space, the block's content, an empty
  block as the bare stars) ↔ a `-` bullet indented one tab per level,
  its lines below the first two spaces further in. A block's content
  is one fragment, so a code block or table that starts on the
  headline line converts as a whole. `:heading: N` ↔ `- ## …`, a
  block's property drawer ↔ `key:: value` lines; planning lines and
  other drawers (`:LOGBOOK:`) stay as written. A heading outside the
  bullets is a top-level block, as Logseq writes a page's first one.
  Page properties map both directions: a first block of
  `key:: value` lines and flat frontmatter entries ↔ leading
  `#+key: value` lines, which Logseq reads as page properties;
  frontmatter keys that act in Emacs (`todo`, `include`, …) stay inert.
  Task markers and `[#A]` priorities stay text, page
  references `[[page]]` and labeled forms `[label]([[page]])` ↔ org
  fuzzy links `[[page][label]]`, block refs `[label](((uuid)))` ↔
  `[[((uuid))][label]]`, and `^^highlight^^` markup survives verbatim
  (it would otherwise re-parse as superscripts).
- `obsidian()`: wikilinks `[[Page]]` / `[[Page|alias]]` ↔ org fuzzy links
- `inputPreset` / `outputPreset` (on both conversions): the dialect
  the input is read in and the one the output is written in (ADR
  0006); leaving one out is Vanilla. `preset` sets both, but leaves a
  side Vanilla whose format the preset has no dialect for (Obsidian
  writes no org); a side preset without one throws, and so does
  `preset` naming another preset than a side preset.

- `normalizeMarkdown(md, { preset })` / `normalizeOrg(org, { preset })`
  (CLI: `morg normalize`): one full round trip to morg's canonical
  form, a fixed point, within one dialect: different presets per side
  throw. Canonicalization, not styling: org-isms and
  md-isms are rewritten exactly as a conversion would rewrite them.
  Normalize with the same preset/config you will convert with, since
  convergence is per-config (ADR 0002).

- `markdownStyle: { bullet, emphasis, strong, fence, rule, ruleRepetition }`
  (on `convertOrgToMarkdown` and `normalizeMarkdown`; CLI `--bullet`,
  `--emphasis`, `--strong`, `--fence`, `--rule`, `--rule-repetition`)
  are Markdown output style knobs. Defaults match prettier except
  emphasis (`*italic*`); `--emphasis _` aligns fully with prettier.
  Canonical form is
  per-config (ADR 0001): round trips must use the same style. Note
  CommonMark/GFM prescribe no style; these defaults are morg's
  canonical choices, not a standard.

Both convert functions also accept `onWarning: message => …`, called for
each construct dropped without an equivalent (e.g. image titles, LaTeX
fragments). The CLI wires this to stderr unless `-s` / `--silent` is
given; the library is silent unless a callback is passed.

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
[docs/adr/](docs/adr/).

## Status

The core conversion surface is feature-complete and validated against
real-world Logseq org vaults (edge cases found there live on as
anonymized fixtures, e.g. `tests/fixtures/logseq-vault.org`), and
the conversions between a Logseq dialect and Vanilla Org or Markdown
are checked by round trips of that vault and of public Markdown and
Org documentation from either side; the
client-side [Web UI](https://morg.binarypoetry.ch) is deployed from
`main`. The npm package is `@remigius42/morg`, since the bare `morg`
name is taken, and pushing a `v*` tag publishes it. Most of the code is
written with an AI coding agent under human direction, test-first and
CI-gated. See
the [contributing guide](CONTRIBUTING.md#development-process).

How each construct maps, including deliberate normalizations and
documented drops, is covered in the
[mapping reference](docs/mappings.md). Notable changes are tracked in
the [changelog](CHANGELOG.md).

## Contributing

See the [contributing guide](CONTRIBUTING.md) for setup, conventions
and the test-first workflow; participation is governed by the
[code of conduct](CODE_OF_CONDUCT.md).

## License

[GPL-3.0-or-later](LICENSE) (required by the uniorg dependencies).
