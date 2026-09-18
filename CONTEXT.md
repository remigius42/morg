# Context

Glossary of canonical terms for morg. Terms are singular, capitalized as shown.

## Round Trip

One full conversion cycle returning to the starting format: `md → org → md` or `org → md → org`.

## Canonical Form

The stable output shape morg produces for a format (default stringifier settings). Every Round Trip lands on Canonical Form.

## Convergence

The core correctness guarantee: for any input `x`, `roundtrip(roundtrip(x)) === roundtrip(x)` byte-for-byte, in both directions. Corollary: input already in Canonical Form is a Round Trip identity (`roundtrip(x) === x`). Strict byte-losslessness for arbitrary input is explicitly a non-goal.

## Md-ism

A Markdown construct with no native Org equivalent. Preserved during `md → org` as org properties so the Round Trip can restore it.

## Org-ism

An Org construct with no native Markdown equivalent. Serialized during `org → md` as `key:: value` conventions by default.

## Web UI

The client-side converter hosted on GitHub Pages. Conversions run
entirely in the browser; no input ever leaves it. Opening and saving
files is the browser reading and writing local files, not a transfer —
the UI therefore says "Open file" and "Download", never "Upload".

## Embed Page

The chrome-less converter page of the Web UI, designed to be iframed —
both by the Web UI's own converter page and by third-party sites. Its
height is the host's to set but morg's to know, so it reports it (see
Height Message) rather than leaving every host to guess the same number.

## Height Message

What the Embed Page posts to its host whenever its content height
changes: `{ type: "morg:height", height }`. It is the page's own
layout and nothing else — no host ever learns what is being converted.
The converter page is its first host: it sizes its own frame to it,
the same way the README asks a third-party host to.

## End-to-End Test

A Playwright spec under `tests/e2e/`, run against the _built_ Web UI
served by `vite preview` — not the dev server and not happy-dom. It
exists for what neither of those can answer: whether the conversion
worker really runs, whether a real file, clipboard or download behaves,
and what axe makes of the accessibility tree.

## Source Layout

The `src/` root is the public library surface: everything `index.ts`
exports lives there (the pipeline modules `markdownToOrg.ts` /
`orgToMarkdown.ts`, their composition `normalize.ts`, plus `config.ts`
and `options.ts`). `src/core/` is internal AST machinery, reachable
only through the root pipelines — adapters (`src/cli/`, `web/`)
import root modules, never `core/`. `src/presets/` holds the dialect
plugins (see Preset) and their registry.

Anything both adapters need lives in `src/` rather than in either of
them: `conversionOptions.ts` layers explicit overrides over the config,
and `presets/registry.ts` maps a preset name to a Preset. Duplicating
one of those in an adapter is how the two drift apart.

`web/src/` splits the same way, for a reason the bundler enforces.
`web/src/pipeline/` is everything that reaches `src/`: `convert.ts`,
the `runner.ts` that decides where a conversion happens, and the
`worker.ts` it speaks to. The rule is about `convert.ts` specifically —
no static import may reach it from the main bundle. `runner.ts` is
light and statically imported, but gets to `convert.ts` through a
dynamic `import()`, which is what keeps the embed bundle at 20 kB
rather than 340. `web/src/ui/` is the converter page's controls, and
imports `pipeline/` for types only. The entries (`main.ts`, `site.ts`)
and `direction.ts` — the pipeline's vocabulary, deliberately free of
the pipeline itself, because `ui/` reads it on every keystroke — sit at
the root. `tests/web/` mirrors this.

## Preset

A named bundle of dialect-specific transforms applied on top of the dialect-agnostic core (e.g. `logseq`). The core pipelines never contain dialect knowledge. Options that only have observable effect in a dialect (e.g. `nestUnderHeadings` for outline nesting) are scoped to their Preset, not the core.
