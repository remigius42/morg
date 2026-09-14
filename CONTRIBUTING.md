# Contributing

PRs are welcome. Fair warning: this is a personal project maintained on
a best-effort basis, so responses and reviews may be slow and changes
that don't fit the use case are unlikely to be merged. Opening an issue
first to discuss is the best use of your time.

Please note that this project is released with a
[Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By
participating you agree to abide by its terms.

## Getting started

```bash
npm install
npm run test:unit   # vitest watch mode (test:unit:ci for one-shot)
npm run test:e2e    # playwright against the built Web UI
npm run lint        # prettier, cspell, markdownlint, eslint, knip, typecheck
npm run build       # tsc → dist/
```

The end-to-end suite needs its browsers once:
`npx playwright install chromium webkit`. It builds `web/` and serves it
itself, so nothing needs to be running first — but it will reuse a
server already listening on port 4173 rather than rebuilding, so kill
any stray `vite preview` before testing a change to the build.

Playwright's WebKit bundle links against pinned system libraries
(`libicu*.so.74`, `libxml2.so.2`, `libjxl`, `flite`) that distributions
other than the Ubuntu it is built for may not carry, and
`playwright install-deps` only speaks `apt`. Where WebKit will not
launch, run `npm run test:e2e:chromium` and leave WebKit to CI, which
covers it on every pull request.

## Development process

Most of this codebase is written with an AI coding agent (Claude
Code), under human direction and review: behavior is specified
test-first (red-green, convergence fixtures), validated against
real-world vaults, and gated by CI. Design decisions are recorded in
[docs/adr/](docs/adr/). AI-assisted contributions are welcome under
the same standard: every change needs tests, and you are responsible
for what you submit.

## Project conventions

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/),
  enforced via husky + commitlint; lint-staged runs the linters on
  staged files.
- Round-trip fixture tests are the backbone of the test suite
  (`tests/roundtrip.spec.ts`): every mapping change needs a convergence
  fixture in `tests/fixtures/`, and behavior is developed red-green
  (failing test first).
- Web UI behavior is covered twice, and the split is deliberate: the
  vitest specs (`tests/web*.spec.ts`) drive the markup under happy-dom
  and are where wiring belongs, while the Playwright specs
  (`tests/e2e/`) cover what only a browser answers — the conversion
  worker, real files and downloads, the clipboard, cross-frame theming
  and the axe accessibility audits. Prefer the unit suite; reach for
  e2e when happy-dom cannot tell a working feature from a broken one.
- The guarantee is semantic faithfulness plus convergence, not
  byte-losslessness —
  read [ADR 0001](docs/adr/0001-convergence-over-losslessness.md)
  before changing mapping behavior, and
  [ADR 0002](docs/adr/0002-mdism-property-namespace.md) for how
  md-isms/org-isms are preserved.
- Project vocabulary lives in [CONTEXT.md](CONTEXT.md); construct
  mappings are documented in [docs/mappings.md](docs/mappings.md) and
  notable changes in [CHANGELOG.md](CHANGELOG.md) — keep both updated
  with behavior changes.
- Core pipelines stay dialect-agnostic; anything Logseq- or
  Obsidian-specific belongs in a preset (`src/presets/`).
