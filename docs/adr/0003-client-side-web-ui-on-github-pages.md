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
- Local file open and save keep the privacy stance intact (the browser
  reads and writes the file itself), but they make the Embed Page
  contract depend on two iframe attributes the host controls: a
  `sandbox` without `allow-downloads` silently breaks Download, and a
  cross-origin host without `allow="clipboard-write"` pushes Copy onto
  its `execCommand` fallback. The converter's own page
  (`convert.html`) sets what it needs.
- Converting on the client means converting on the UI thread, which a
  large document froze outright. The conversion runs in a web worker
  instead, with an in-place fallback where workers are unavailable.
  This adds a build-time obligation: the worker bundle must not reach
  for the DOM, and a dependency's browser build that does will kill
  the worker on startup and fall back silently. `web/vite.config.ts`
  resolves the known offender away, and a test asserts the property.
- Rejected: server-side conversion (infrastructure, privacy burden,
  no benefit — the library is small enough to ship to the client);
  postMessage-based iframe sizing/theming (complexity not yet
  justified; the query parameter covers theming).
