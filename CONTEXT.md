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
entirely in the browser; no input ever leaves it.

## Embed Page

The chrome-less converter page of the Web UI, designed to be iframed —
both by the Web UI's own converter page and by third-party sites.

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

## Preset

A named bundle of dialect-specific transforms applied on top of the dialect-agnostic core (e.g. `logseq`). The core pipelines never contain dialect knowledge. Options that only have observable effect in a dialect (e.g. `nestUnderHeadings` for outline nesting) are scoped to their Preset, not the core.
