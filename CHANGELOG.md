<!-- markdownlint-disable MD024 -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The Web UI reads and writes local files instead of relying on the
  clipboard alone: an "Open file…" picker, drag and drop anywhere on
  the converter, and Copy / Download buttons for the result. A dropped
  `.toml` goes to the config panel and expands it; a document goes to
  the input, and its extension picks the conversion direction —
  the format half only, so a Normalize mode survives (`notes.org`
  dropped while normalizing Markdown selects "Normalize Org"). Several
  files dropped together are routed by kind, and any the converter
  cannot use are named in the warning list. The download is named after
  the opened file with the output extension (`notes.md` → `notes.org`);
  normalizing adds `.normalized` (`notes.org` → `notes.normalized.org`)
  so the result cannot be saved over its own source. Copy and Download
  are disabled while the conversion is failing. Files over 1 MB load
  with a warning that conversion may be slow. Nothing is uploaded: the
  browser reads and writes the file itself.

- Dragging files over the Web UI raises an overlay naming what the
  converter accepts, and a hint next to "Open file…" says a file can be
  dropped before any drag has started. The page-wide drop target was
  otherwise invisible.

- An end-to-end suite (`tests/e2e/`, Playwright, `npm run test:e2e`)
  driving the Web UI in Chromium and WebKit against the built pages,
  plus axe accessibility audits of every page in both color schemes and
  in the states only an interaction reaches. It covers what the
  happy-dom specs cannot decide: whether the conversion worker really
  starts, real file picking, dropping and downloading, the clipboard and
  its selection-copy fallback, and the theme crossing into the embedded
  frame. It runs in CI after the builds, and the Web UI no longer
  deploys unless it passes.

### Changed

- Copy and Download are disabled in the Web UI while a conversion is
  running. The output box still holds the previous result until the new
  one arrives, and saving that wrote one document's conversion under
  the next document's name. A conversion still running after 150 ms
  says so; a faster one passes without comment.

- The Web UI converts in a web worker, so the page no longer freezes
  while a large document is converted. A browser that has no workers
  falls back to converting in place, as before. The conversion pipeline
  now loads with the worker rather than with the page: the converter's
  own bundle dropped from 338 kB to 20 kB, and the fallback copy is
  only fetched if it is actually needed. The large-file notice no
  longer promises an unresponsive page, only a wait.

- The Web UI converts once typing pauses (200 ms) rather than on every
  keystroke. A full conversion per keystroke made a large document
  painful to type into. Selects and checkboxes still convert
  immediately — they fire once per interaction, and delaying a click
  reads as lag. The conversion is now asynchronous, and a result that
  a newer edit has overtaken is discarded instead of painted.

- `.markdown` is no longer recognized as a Markdown extension in the
  Web UI. It never was in the CLI, and one extension table is now
  shared by both (`src/fileNames.ts`); the file picker still offers
  `.markdown` files, it just leaves the direction to you.

### Fixed

- Web UI: the "Try the converter" button failed WCAG AA contrast in
  dark mode (4.27:1). Its label took the link color rather than the
  page text, because Pico redefines `--pico-color` on every anchor.
- Web UI: `convert.html` presented two `main` landmarks — its own and
  the embedded converter's — with nothing to tell them apart, and the
  drag-and-drop overlay was appended outside every landmark, where
  landmark navigation skips it.
- Web UI: inserting a config snippet left the config panel's summary
  saying no config was in force, until the config was edited by hand.
- A file name is now split on its last path segment, so a path the CLI
  is given (`docs/.org`) follows the same dotfile rule as a name the
  Web UI reads off a dropped file. `morg docs/.org` no longer infers a
  format from a hidden file's name.
- Web UI: a conversion that could not be run at all — rather than one
  that failed on its input — left the page locked: "Converting…" up,
  Copy and Download disabled, and no message. The worker now reports a
  request structured clone refuses, a reply that did not survive the
  trip, and a stand-in conversion whose code could not be fetched;
  the page shows the failure and carries on.
- Web UI: coming back to a restored "Markdown → Org" and switching to
  "Org → Markdown" left the Markdown demo in the input, to be converted
  as Org. The untouched-demo swap now compares against the restored
  direction rather than the page's default.
- Web UI: a dropped file that is not text — a png, a pdf, an archive —
  was decoded as UTF-8 and its replacement characters converted. It is
  named in the warning list instead. Text files the picker's filter
  does not cover (`README`, `notes.txt`) still open as before.
- Web UI: opening `notes.md` and then selecting "Org → Markdown" offered
  the download as `notes.md` — the source file. A direction that no
  longer reads the opened file's format falls back to the generic
  timestamped name; "Normalize Markdown" still reads it, so it keeps the
  name.
- Web UI: a refused copy says so in its own notice instead of the
  conversion error slot, where it read as a failed conversion and was
  wiped by the next keystroke before it could be acted on. The fallback
  copy also gives the caret back, instead of leaving the focus on the
  output.
- Web UI: a dropped `morg.toml` over 1 MB no longer produces a warning
  about how long converting it will take; a config is read, not
  converted.
- Web UI: the download kept the opened file's name after the input had
  been replaced, so converting `notes.org`, saving `notes.md`, then
  pasting an unrelated document and saving again wrote the second over
  the first. The name is dropped as soon as the input is edited: an
  edit and a paste of a different document cannot be told apart, so the
  name is not kept on the chance that it is still the same document.
  Content with no source file is now saved as
  `morg-output-20260914T193015.md` — a timestamp, so a
  paste-convert-save loop over several snippets cannot collide with
  itself either.
- Web UI: a file name whose extension collided with an `Object`
  property (`notes.constructor`, `notes.__proto__`) selected a
  nonexistent direction, blanking the dropdown and failing every later
  conversion.
- Web UI: a file that could not be read — a dropped folder, a file
  moved between picking and reading — failed silently; the drop now
  reports the error instead of appearing to do nothing.
- Web UI: dragging a text selection into either textarea no longer has
  its default cancelled by the page-wide file-drop handler.
- Web UI: the download object URL is no longer revoked in the same task
  as the click, which could abort the save in Firefox and Safari.
- Web UI: the clipboard fallback works on iOS Safari (which refuses to
  select a `readonly` textarea) and says so when a copy is refused
  outright, instead of failing indistinguishably from success.
- Web UI: a config restored from a previous visit is marked as active
  on the Config panel, rather than taking effect with no indication.

## [0.2.0] - 2026-09-12

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
- The Web UI shows its build version (`git describe --tags`, injected at
  build time) in the page chrome, including the embed page. The Web UI
  deploys from every push to `main`, so it is usually ahead of the
  latest tag: the string reads `v0.2.0` on a release and
  `v0.2.0-3-g<sha>` three commits later.

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

[unreleased]: https://github.com/remigius42/morg/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/remigius42/morg/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/remigius42/morg/releases/tag/v0.1.0
