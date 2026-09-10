# 0001 — Convergence over byte-losslessness

## Status

Accepted (2026-09-10)

## Context

morg converts between Markdown and Org-mode in both directions. Strict byte-losslessness (`convert(convert(x)) === x` for arbitrary input) is impossible: the formats disagree on syntax choices (bullet markers, emphasis markers, link styles) and each has constructs the other lacks. A correctness criterion weaker than byte identity but strong enough to trust for a canonical second-brain store was needed.

## Decision

The guarantee is **convergence after one round trip**, both directions:

- `roundtrip(roundtrip(x)) === roundtrip(x)` byte-for-byte for any input.
- Corollary: input already in canonical form (default stringifier output) is a round-trip identity.

Semantic losslessness is layered on top: md→org stores md-isms as org properties; org→md serializes org-isms as `key:: value` conventions. Canonical form is defined by the default stringifier settings of the underlying libraries; exposing formatting knobs as flags is possible later without weakening the guarantee, since canonical form is then parameterized by those settings.

## Consequences

- Round-trip fixture tests are the backbone of the test suite: convergence tests on arbitrary fixtures, identity tests on canonical fixtures.
- The first pass over hand-written files normalizes formatting; users must accept a one-time reformat of non-canonical input (a `fmt` command falls out of this for free).
- Alternatives rejected: strict byte identity (impossible); one-directional guarantee only (insufficient — org files must survive a detour through Markdown editors unchanged).
