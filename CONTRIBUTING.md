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

## Performance

`npm run perf` builds and runs the performance gate on seeded synthetic
documents (`scripts/perf/`): per conversion, HEAD may take at most 1.25
times the reference's normalized time (the `head` budget where one is
set, else the last recorded tag), and no more uniorg parses. Times
are divided by what plain remark and uniorg parsing of the same
documents takes in the same run, so numbers recorded on one machine
hold on another. CI runs the gate on every push and pull request.

A change that needs more on purpose sets its numbers in the `head` entry
of `scripts/perf/timings.json`, with a reason, so the cost shows up in
review. Record a released tag (`npm run perf:record vX.Y.Z`) and drop
the `head` entry only where the tag is faster: recording a slower tag
would make its numbers the reference and loosen the gate.

The recorded numbers hold for the generated documents only, and a test
pins their hash: after changing the generator, record the tags again
(`npm run perf:record v0.3.0 v0.4.0 …`) and update the hash.

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

1. `npm version x.y.z`, which ends by printing the next two steps
2. `git push origin vx.y.z`
3. once the Release run has passed, `git push`

The tag goes first: pushing `main` deploys the Web UI, which is stamped
with `git describe --tags`, and pushed together (`--follow-tags`) the
deploy can start before the tag exists, so the site names the previous
version. Waiting for the Release run keeps the site from naming a
version that is not on npm yet, and leaves a failed release to be
rolled back before `main` has moved.

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
opens the GitHub Release. Publishing needs no token: npm trusts this
repository's `release.yml` as a publisher of `@remigius42/morg`
(trusted publishing, set up in the package's settings on the registry),
so renaming the workflow file breaks it until the setting follows.
