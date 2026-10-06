# 0008: Third-party licenses page

## Status

Accepted (2026-10-06)

## Context

The Web UI ships minified bundles of its dependencies. MIT, ISC and
BSD require their copyright and license text to accompany copies, and
the minifier strips the comments that carried them; the footer linked
only morg's own license. The site needs a page listing what it is
built from, with the license texts, kept current by the build.

Vite 8's `build.license` writes exactly the bundled packages, but
misses two things: the conversion worker, a separate build its license
plugin does not run on, and CSS, where Pico CSS is bundled through an
`@import`. license-checker reads `package.json` instead, so it sees
every dependency, but splits them by scope, not by what is bundled:
Pico is a development dependency, and moving it to `dependencies`
would install a CSS framework with the CLI.

## Decision

`scripts/write-licenses.mjs` runs license-checker-rseidelsohn before
every Web UI build and writes two lists into `web/public/`, one per
scope, production and development; `web/licenses.html` shows them as
two tables, linked from the footer of every page. The development
list is the superset that cannot miss a bundled package, whichever
scope it is declared in. morg itself is left off, and so is the
README license-checker substitutes for a missing license file: such a
package shows its license identifier and copyright line only.

CI separately fails on a production dependency whose license is not
GPL-3.0-compatible (`npm run licenses:check`). Development
dependencies are not checked: they do not ship, Pico (MIT) aside, and
several are MPL-2.0, BlueOak or Python-2.0.

## Consequences

- The page lists more than the site bundles: build and test tooling,
  and type-only packages such as `@types/mdast`. Over-listing is
  harmless; under-listing is what this guards against.
- The development list is about 550 packages, 1.2 MB of JSON, 110 kB
  gzipped, fetched only by the licenses page.
- A license text unfolds within its table cell and scrolls sideways
  there, so it keeps its line breaks without widening the page.
- The lists are built output, gitignored; the dev server has none, and
  the page says so.
- Rejected: Vite's `build.license` (misses the worker and CSS);
  moving bundled development dependencies to `dependencies` (installs
  them with the CLI); an explicit list of bundled development
  dependencies (one more thing to keep current by hand).
