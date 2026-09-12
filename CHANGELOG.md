<!-- markdownlint-disable MD024 -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Opt-in `interpretHtml` flag (`--interpret-html`,
  `[markdownToOrg] interpretHtml`, Web UI checkbox): during md → org,
  the HTML vocabulary morg itself emits under `useHtml` (bare `<u>`,
  `<sup>`, `<sub>`, `<dl>/<dt>/<dd>`) becomes native Org constructs
  instead of a preserved md-ism. Inverse of `useHtml`: with both
  enabled the round trip is lossless; with `interpretHtml` alone it
  converges away from HTML (cleanup mode). Default `false`.
- Boolean CLI flags accept an optional value (`--silent false`,
  `--task-checkboxes false`, `--interpret-html false`); the bare flag
  still means `true`. This is what makes the documented
  `CLI > config > defaults` precedence hold in both directions — a
  config setting `true` can now be turned off from the command line.

### Changed

- A YAML frontmatter sequence maps to a repeated org keyword
  (`tags: [a, b]` ↔ `#+TAGS: a` + `#+TAGS: b`) instead of a
  JSON-encoded array on one line. Repeating a keyword is legal org and
  is how several values for one key are carried, so the mapping is now
  lossless in both directions. **Migration:** org files written by
  0.1.0 that contain a JSON array value (`#+TAGS: ["a","b"]`) convert
  to the repeated form on the next `morg` run; a one-element sequence
  normalizes to a plain scalar. Structured (non-sequence) values are
  still JSON-encoded.

### Fixed

- CLI stdin is decoded as one UTF-8 stream instead of per chunk: a
  multi-byte character straddling a 64 KiB chunk boundary no longer
  becomes U+FFFD, which silently corrupted any non-ASCII document over
  64 KiB piped in
- Value-taking CLI flags reject a missing value instead of substituting
  `""`: `morg --bullet` no longer overrides the canonical `-` with an
  empty marker (making remark fall back to `*`), and `morg --config`
  no longer ignores the config file. A following flag counts as a
  missing value; a lone `-` stays a valid bullet character
- `morg normalize` rejects a conflicting `--to` or output extension
  instead of overwriting it with the source format, which silently
  wrote Markdown into a `.org` file
- Multi-line YAML frontmatter values (block, folded or multi-line
  quoted scalars) are JSON-encoded like structured values. An org
  keyword is a single line, so a raw newline ended it and pushed the
  remaining lines into the document body
- Repeated leading org keywords keep every value instead of collapsing
  to the last one (see Changed, above)
- `todo::`, `priority::`, `tags::` and the planning keys are only
  written onto the headline when the value fits that slot; an org
  property drawer entry that merely shares one of those names (or a
  hand-written line) stays a drawer property instead of corrupting the
  title (`:todo: something` became `* something Head`)
- `[` and `]` in a link or image url are percent-encoded: an org
  bracket-link path cannot hold them, so a query array (`?a[]=1`) or an
  IPv6 literal host produced a link org could not parse. Documented in
  [docs/mappings.md](docs/mappings.md), including the IPv6 caveat
- An org comment body containing `-->` is escaped to `--&gt;` (and
  decoded on the way back); the HTML comment previously closed at the
  first terminator and leaked the rest of the line into the page
- Under `useHtml`, descriptive list terms and definitions are
  HTML-escaped, so a term containing `<` or `&` no longer produces
  markup that `interpretHtml` cannot read back — restoring the
  documented lossless `useHtml` + `interpretHtml` pair
- `logseq` preset: the `:heading:` property joins the existing property
  drawer below the planning line instead of being inserted directly
  after the headline, where it displaced both and made them re-parse as
  body text; the extract direction looks past a planning line for it
  instead of demoting the headline to a paragraph
- `logseq` preset: labeled page refs whose page name has no space
  (`[label]([[soil]])`) are rewritten to `[[soil][label]]`. remark
  parses that form as a real link — unlike `[[other page]]`, whose
  space makes it an invalid destination — so the rewrite never fired
  and produced a nested org link that org cannot parse
- Web UI: an unknown conversion direction reports an error instead of
  returning `undefined` as a success (which showed the literal string
  "undefined" in the output field), and a persisted direction the
  select does not offer is ignored rather than leaving it blank

## [0.1.0] - 2026-09-10

### Added

- Bidirectional Markdown ↔ Org conversion with round-trip convergence
  as the correctness guarantee (ADR 0001); full construct coverage is
  documented in [docs/mappings.md](docs/mappings.md)
- Org-ism `key:: value` serialization with remappable key names
  (`orgismKeys`), md-ism preservation via export blocks/snippets
  (ADR 0002)
- Verbatim passthrough for org-only constructs (drawers, special
  blocks, affiliated keywords, exports, timestamps, citations, …)
- LaTeX math ↔ `$…$`/`$$…$$` (remark-math), entities → UTF-8,
  frontmatter ↔ `#+KEY:` keywords, org comments ↔ HTML comments
- `logseq` preset: outline nesting, `:heading:` drawers, task markers
  and priorities, page/block references, highlight and hiccup
- `obsidian` preset: wikilinks ↔ org fuzzy links
- `morg normalize` canonicalizer command and
  `normalizeMarkdown`/`normalizeOrg` library functions
- `morg.toml` configuration file (`--config`, precedence
  CLI > config > defaults)
- Markdown style knobs (`markdownStyle` / `--bullet`, `--emphasis`,
  `--strong`, `--fence`, `--rule`, `--rule-repetition`)
- Formatter compatibility snippets for prettier (test-verified fixed
  point) and mdformat in
  [docs/CONFIGURATION.md](docs/CONFIGURATION.md), loadable in the Web
  UI's config panel
- Opt-in lossy export flag `taskCheckboxes` (`--task-checkboxes`):
  bare TODO/DONE leaf headlines → GFM task items
- Drop reporting via `onWarning`; CLI reports to stderr, `-s` /
  `--silent` suppresses
- Client-side Web UI at
  [morg.binarypoetry.ch](https://morg.binarypoetry.ch), deployed to
  GitHub Pages from `main` (ADR 0003): converter with presets, options,
  normalize modes, `morg.toml` paste and a preloaded demo, iframable
  embed page with `?theme` override, light/dark switcher

[unreleased]: https://github.com/remigius42/morg/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/remigius42/morg/releases/tag/v0.1.0
