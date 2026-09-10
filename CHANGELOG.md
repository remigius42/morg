<!-- markdownlint-disable MD024 -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  `--strong`, `--fence`, `--rule`)
- Opt-in lossy export flag `taskCheckboxes` (`--task-checkboxes`):
  bare TODO/DONE leaf headlines → GFM task items
- Drop reporting via `onWarning`; CLI reports to stderr, `-s` /
  `--silent` suppresses
- Client-side Web UI at
  [morg.binarypoetry.ch](https://morg.binarypoetry.ch), deployed to
  GitHub Pages from `main` (ADR 0003): converter with presets, options
  and `morg.toml` paste, iframable embed page with `?theme` override
