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
npm run lint        # prettier, cspell, markdownlint, eslint, knip, typecheck
npm run build       # tsc → dist/
```

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
