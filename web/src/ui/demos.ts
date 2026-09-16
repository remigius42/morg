/**
 * The documents the converter offers an empty input. Its own module
 * because they are content rather than behavior: fifty lines of literal
 * text that say nothing about how the page works, sitting in the middle
 * of the file that does.
 */
import { readsMarkdown, type Direction } from "../direction.js"

// the two demos are the same document in both dialects; convergence and
// zero warnings are pinned by test (tests/web/ui/demos.spec.ts)
export const ORG_DEMO = `# Paste your Org here — or convert this demo

* morg demo
** TODO Try the [[https://github.com/remigius42/morg][converter]]
SCHEDULED: <2026-09-11 Fri>

Some *bold*, /italic/ and ~code~ text[fn:1].

| Format   | Extension |
|----------+-----------|
| Org      | .org      |
| Markdown | .md       |

#+begin_src js
console.log("fenced code survives")
#+end_src

- term :: a definition list entry

[fn:1] Footnotes survive the round trip.
`

export const MD_DEMO = `<!-- Paste your Markdown here — or convert this demo -->

# morg demo

## Try the [converter](https://github.com/remigius42/morg)

todo:: TODO

scheduled:: <2026-09-11 Fri>

Some **bold**, *italic* and \`code\` text[^1].

| Format   | Extension |
| -------- | --------- |
| Org      | .org      |
| Markdown | .md       |

\`\`\`js
console.log("fenced code survives")
\`\`\`

- term :: a definition list entry

[^1]: Footnotes survive the round trip.
`

/** The demo written in the format a direction takes as its input. */
export function demoFor(direction: Direction): string {
  return readsMarkdown(direction) ? MD_DEMO : ORG_DEMO
}
