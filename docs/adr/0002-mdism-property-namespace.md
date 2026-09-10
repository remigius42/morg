# 0002 — Md-isms as `morg_`-prefixed properties, native org constructs preferred

## Status

Accepted (2026-09-10)

## Context

`md → org` must preserve Markdown constructs org cannot express natively (raw HTML, frontmatter, image title attributes, heading level under `nestUnderHeadings`, …) so the round trip can restore them. Storing them as org properties raises two questions: how to name the properties without colliding with user-authored ones, and how to encode non-scalar values given org property values are single-line.

## Decision

1. **Prefix all core-emitted properties with `morg_`** (e.g. `:morg_heading:`). On `org → md`, only `morg_`-prefixed properties are consumed and restored; anything else is user data and passes through untouched. Unambiguous ownership is required for Convergence.
2. **Prefer native org constructs over properties** when org has one: raw HTML becomes `#+begin_export html`, not a property. Properties are reserved for metadata-shaped md-isms.
3. **Values**: plain scalars as-is; structured or multiline values JSON-encoded on a single line.
4. **Presets may override names** with the target application's own conventions (Logseq: `heading::`), because there the application, not morg, is the consumer.
5. **Names are user-configurable** (config file, post-bootstrap). Consequently Convergence is guaranteed _per-config_: round-tripping a file requires the same property-name mapping it was written with.

## Consequences

- A user property coincidentally named `:heading:` survives conversion untouched; only the `morg_` namespace is morg's.
- Files written under a custom mapping are not portable to other configs without reconversion.
- Rejected: unprefixed names (`:html:`) — prettier but makes "restore vs user data" undecidable on the return trip, breaking Convergence.
