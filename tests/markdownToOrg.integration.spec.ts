import { describe, it, expect } from "vitest"
import { convertMarkdownToOrg } from "../src/markdownToOrg.js"
import { logseq } from "../src/presets/logseq.js"

describe("convertMarkdownToOrg", () => {
  it("should convert a simple markdown string to a generic org-mode string", () => {
    const markdown = "# Hello World\n\nThis is a paragraph."
    const expectedOrgMode = `* Hello World
This is a paragraph.
`

    const orgOutput = convertMarkdownToOrg(markdown)

    expect(orgOutput).toBe(expectedOrgMode)
  })

  it("should convert inline code to org verbatim markup", () => {
    const markdown = "Use `foo` here.\n"

    expect(convertMarkdownToOrg(markdown)).toBe("Use ~foo~ here.\n")
  })

  it("should convert fenced code blocks to src blocks", () => {
    const markdown = '```js\nconsole.log("hi")\n```\n'

    expect(convertMarkdownToOrg(markdown)).toBe(
      '#+begin_src js\nconsole.log("hi")\n#+end_src\n'
    )
  })

  it("should convert fenced code blocks without language to example blocks", () => {
    const markdown = "```\nplain text\n```\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "#+begin_example\nplain text\n#+end_example\n"
    )
  })

  it("should convert blockquotes to quote blocks", () => {
    const markdown = "> Quoted *wisdom* here.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "#+begin_quote\nQuoted /wisdom/ here.\n#+end_quote\n"
    )
  })

  it("should add heading:: property drawers with the logseq preset", () => {
    const markdown = "# Hello World\n\nThis is a paragraph."
    const expectedOrgMode = `* Hello World
:PROPERTIES:
:heading: 1
:END:

This is a paragraph.
`

    const orgOutput = convertMarkdownToOrg(markdown, { preset: logseq() })

    expect(orgOutput).toBe(expectedOrgMode)
  })

  it("should convert markdown with various features with the logseq preset", () => {
    const markdown = `
# Features Test

This is *italic* and **bold** text.

Visit [Example](https://example.com).

- Unordered Item 1
- Unordered Item 2

- [ ] Todo Item
- [X] Done Item
`
    const expectedOrgMode = `* Features Test
:PROPERTIES:
:heading: 1
:END:

This is /italic/ and *bold* text.

Visit [[https://example.com][Example]].

- Unordered Item 1
- Unordered Item 2
- [ ] Todo Item
- [X] Done Item
`

    const orgOutput = convertMarkdownToOrg(markdown, { preset: logseq() })

    expect(orgOutput).toBe(expectedOrgMode)
  })
})
