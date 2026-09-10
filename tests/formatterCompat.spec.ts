import { readFileSync } from "node:fs"
import { format } from "prettier"
import { describe, expect, it } from "vitest"
import { parseConfig } from "../src/config.js"
import { convertOrgToMarkdown } from "../src/orgToMarkdown.js"
import { CONFIG_SNIPPETS } from "../web/src/snippets.js"

const RICH_ORG = `* Heading

Some *bold*, /italic/ and =code= text with a [[https://example.com][link]].

- item one
  - nested
- item two

1. first
2. second

#+begin_src js
code();
#+end_src

#+begin_quote
Quoted.
#+end_quote

-----

| left | right |
|------+-------|
| one  | two   |
`

describe("formatter compatibility snippets", () => {
  it("documents every snippet in docs/CONFIGURATION.md verbatim", () => {
    const docs = readFileSync("docs/CONFIGURATION.md", "utf8")
    for (const snippet of Object.values(CONFIG_SNIPPETS)) {
      expect(docs).toContain(snippet.toml.trim())
    }
  })

  it("prettier snippet output is a prettier fixed point", async () => {
    const config = parseConfig(CONFIG_SNIPPETS.prettier.toml)
    const markdown = convertOrgToMarkdown(RICH_ORG, {
      markdownStyle: config.orgToMarkdown?.markdownStyle
    })
    expect(await format(markdown, { parser: "markdown" })).toBe(markdown)
  })

  it("mdformat snippet renders 70-underscore thematic breaks", () => {
    const config = parseConfig(CONFIG_SNIPPETS.mdformat.toml)
    const markdown = convertOrgToMarkdown("-----\n", {
      markdownStyle: config.orgToMarkdown?.markdownStyle
    })
    expect(markdown).toBe(`${"_".repeat(70)}\n`)
  })
})
