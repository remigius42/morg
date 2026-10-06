/**
 * The documents the converter offers an empty input. Its own module
 * because they are content rather than behavior: literal text that
 * says nothing about how the page works, sitting in the middle
 * of the file that does.
 */
import { readsMarkdown, type Direction } from "../direction.js"

// the two demos are the same document in both formats; that,
// convergence and zero warnings are pinned by test
// (tests/web/ui/demos.spec.ts)
export const ORG_DEMO = `# Paste your Org here, or convert this demo

* morg demo
** TODO Try the [[https://github.com/remigius42/morg][converter]]
SCHEDULED: <2026-09-11 Fri>

Some *bold*, /italic/ and ~code~ text[fn:1].

#+begin_quote
Quotes stay quotes.
#+end_quote

#+begin_tip
Special blocks become GFM alerts.
#+end_tip

- Lists nest
  1. ordered
  2. too

| Format   | Extension |
|----------+-----------|
| Org      | .org      |
| Markdown | .md       |

#+begin_src js -n
console.log("fenced code survives")
#+end_src

- term :: a definition list entry

Links to headlines: [[*morg demo][back to the top]].

[fn:1] Footnotes survive the round trip.
`

export const MD_DEMO = `<!-- Paste your Markdown here, or convert this demo -->

# morg demo

## Try the [converter](https://github.com/remigius42/morg)

todo:: TODO

scheduled:: <2026-09-11 Fri>

Some **bold**, *italic* and \`code\` text[^1].

> Quotes stay quotes.

> [!TIP]
>
> Special blocks become GFM alerts.

- Lists nest
  1. ordered
  2. too

| Format   | Extension |
| -------- | --------- |
| Org      | .org      |
| Markdown | .md       |

\`\`\`js -n
console.log("fenced code survives")
\`\`\`

term
:   a definition list entry

Links to headlines: [back to the top](#morg-demo).

[^1]: Footnotes survive the round trip.
`

// the Logseq preset's demos: one page as Logseq writes it in either
// format, which convert into each other as they are (pinned by test)
export const LOGSEQ_ORG_DEMO = `# Paste your Logseq org page here, or convert this demo

* Logseq demo
:PROPERTIES:
:heading: 1
:END:
** Blocks nest, one tab per level in Markdown
*** A [[page reference]] and a bare url https://github.com/remigius42/morg
** TODO Try the converter
SCHEDULED: <2026-09-11 Fri>
:PROPERTIES:
:collapsed: true
:END:
*** An empty block follows
***
** A block's lines
run on below its first
** :PROPERTIES:
:query-table: false
:END:
#+begin_query
{:title "Tasks"
 :query (task TODO)}
#+end_query
`

export const LOGSEQ_MD_DEMO = `<!-- Paste your Logseq Markdown page here, or convert this demo -->

- # Logseq demo
\t- Blocks nest, one tab per level in Markdown
\t\t- A [[page reference]] and a bare url https://github.com/remigius42/morg
\t- TODO Try the converter
\t  SCHEDULED: <2026-09-11 Fri>
\t  collapsed:: true
\t\t- An empty block follows
\t\t-
\t- A block's lines
\t  run on below its first
\t- query-table:: false
\t  #+begin_query
\t  {:title "Tasks"
\t   :query (task TODO)}
\t  #+end_query
`

// the Obsidian preset's demo: Obsidian writes no org, so its org side
// is the Vanilla demo (pinned by test)
export const OBSIDIAN_MD_DEMO = `<!-- Paste your Obsidian note here, or convert this demo -->

# Obsidian demo

Wikilinks to [[Another note]] and [[Another note|with an alias]].

> [!tip]
>
> Callouts become org special blocks.

![diagram|300](diagram.png)

- [ ] A task
`

const DEMOS = [
  ORG_DEMO,
  MD_DEMO,
  LOGSEQ_ORG_DEMO,
  LOGSEQ_MD_DEMO,
  OBSIDIAN_MD_DEMO
]

/**
 * The demo written in the format a direction takes as its input, in the
 * dialect of an input preset that has its own.
 * @param direction The conversion direction.
 * @param preset The input preset's name, if any.
 * @returns The demo.
 */
export function demoFor(direction: Direction, preset = ""): string {
  const logseq = preset === "logseq"
  if (readsMarkdown(direction)) {
    if (preset === "obsidian") {
      return OBSIDIAN_MD_DEMO
    }
    return logseq ? LOGSEQ_MD_DEMO : MD_DEMO
  }
  return logseq ? LOGSEQ_ORG_DEMO : ORG_DEMO
}

/** Whether a text is one of the demos, untouched. */
export function isDemo(text: string): boolean {
  return DEMOS.includes(text)
}
