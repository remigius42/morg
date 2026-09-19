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
itself, so nothing needs to be running first, but it will reuse a
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
  staged files. Staging `package.json` or `package-lock.json` also runs
  `npm ci --dry-run`, which rejects a lockfile CI would refuse to
  install from. Incremental `npm install` drops the hoisted entries for
  platform-skipped optional packages, and a local `npm ci` passes anyway
  because `node_modules` is already populated. Regenerate such a lock
  with `rm -rf package-lock.json node_modules && npm install`.
  The constellation that triggers it here is `knip` →
  `oxc-resolver` → its wasm fallback binding
  `@oxc-resolver/binding-wasm32-wasi` → `@napi-rs/wasm-runtime` →
  `@emnapi/core`, `@emnapi/runtime`, `@emnapi/wasi-threads`: the native
  binding wins on a normal dev machine, so that whole branch is
  installed as optional-and-skipped and is what goes missing.
- Round-trip fixture tests are the backbone of the test suite
  (`tests/roundtrip.spec.ts`): every mapping change needs a convergence
  fixture in `tests/fixtures/`, and behavior is developed red-green
  (failing test first).
- Specs mirror the tree they cover, so a module's tests are where you
  would look for them: `tests/core/`, `tests/presets/` and
  `tests/web/{ui,pipeline}/` against `src/core/`, `src/presets/` and
  `web/src/{ui,pipeline}/`. Name the spec after the module and let the
  path carry the rest: `tests/presets/logseq.spec.ts`, not
  `logseqPreset.spec.ts`. Specs that genuinely span the tree
  (`roundtrip`, `formatterCompat`) stay at the root, as do
  `tests/fixtures/` and `tests/e2e/`.
- Web UI behavior is covered twice, and the split is deliberate: the
  vitest specs (`tests/web/`) drive the markup under happy-dom
  and are where wiring belongs, while the Playwright specs
  (`tests/e2e/`) cover what only a browser answers: the conversion
  worker, real files and downloads, the clipboard, cross-frame theming
  and the axe accessibility audits. Prefer the unit suite; reach for
  e2e when happy-dom cannot tell a working feature from a broken one.
- The guarantee is semantic faithfulness plus convergence, not
  byte-losslessness. Read
  [ADR 0001](docs/adr/0001-convergence-over-losslessness.md)
  before changing mapping behavior, and
  [ADR 0002](docs/adr/0002-mdism-property-namespace.md) for how
  md-isms/org-isms are preserved.
- Project vocabulary lives in [CONTEXT.md](CONTEXT.md); construct
  mappings are documented in [docs/mappings.md](docs/mappings.md) and
  notable changes in [CHANGELOG.md](CHANGELOG.md); keep both updated
  with behavior changes.
- Core pipelines stay dialect-agnostic; anything Logseq- or
  Obsidian-specific belongs in a preset (`src/presets/`).

## Releasing

Releases are cut from `main` by pushing a tag; the
[release workflow](.github/workflows/release.yml) does the rest.

1. `npm version x.y.z`
2. `git push --follow-tags`

`npm version` bumps `package.json` and the lockfile, and its `version`
lifecycle script runs `scripts/release-changelog.mjs` in between the
bump and the commit: the entries standing under `## [Unreleased]` get a
`## [x.y.z] - YYYY-MM-DD` heading, the link definitions are rewritten,
and the result is staged into the same commit npm is about to make. The
tag therefore points at a commit whose changelog, `package.json` and
lockfile already agree, which is what the workflow's version guard
checks, and what its release notes are read from.

The script refuses rather than guesses: no `## [Unreleased]` heading, no
entries under it, a section for that version already present, or no
previous version to compare against all abort the release before the
commit exists. `npm version` itself refuses to run on a dirty working
tree, so commit or stash first.

The workflow re-runs lint, the unit tests and the build (a tag push does
not trigger CI), publishes to npm with a provenance attestation, and
opens the GitHub Release. Publishing needs the `NPM_TOKEN` repository
secret, a granular automation token with publish rights on
`@remigius42/morg`.
