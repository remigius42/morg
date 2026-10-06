# Architecture

Two pipelines, each with a two-phase transformation separating the
dialect-agnostic core from dialect presets:

```text
md → org:  remark-parse → mdast→uniorg (core) → read md dialect → write org dialect → uniorg-stringify
org → md:  uniorg-parse → read org dialect → write md dialect → uniorg→mdast (core) → remark-stringify
```

Formatting is controlled by shaping the AST (e.g. inserting newline text nodes),
not by custom stringifier handlers. The default, battle-tested
stringifiers do the rendering.

Why the pipelines aim for convergence rather than byte-losslessness is
[ADR 0001](adr/0001-convergence-over-losslessness.md); how dialects
are split per side is [ADR 0006](adr/0006-presets-per-side.md).
