# 0003 — Fully client-side Web UI on GitHub Pages

## Status

Accepted (2026-09-10)

## Context

morg should be usable without installing anything. A hosted converter
needs a home; the options were a server-side service (conversion via
API) or a static, fully client-side page. The core library is
runtime-agnostic (only the CLI touches Node APIs), so it can run in
the browser as-is.

## Decision

The Web UI is a **static, fully client-side site on GitHub Pages** at
`morg.binarypoetry.ch`, deployed from `main` by the CI workflow after
checks pass. All conversion happens in the browser: no backend, no
uploads, no telemetry, no cookies — persistence is limited to
localStorage for UI state. The chrome-less Embed Page is the iframe
contract: theming via a `?theme=dark|light` query parameter, no
postMessage protocol, self-contained layout at any iframe size.

## Consequences

- Zero infrastructure to run or secure; the privacy stance
  ("nothing leaves the browser") is structural, not a policy.
- GitHub Pages cannot set response headers, so `frame-ancestors`
  cannot be restricted: anyone may embed the Embed Page. Accepted —
  it is a free tool.
- The deployed converter always matches `main`, not a tagged release.
- Rejected: server-side conversion (infrastructure, privacy burden,
  no benefit — the library is small enough to ship to the client);
  postMessage-based iframe sizing/theming (complexity not yet
  justified; the query parameter covers theming).
