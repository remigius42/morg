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

  it("should convert images to org links", () => {
    const markdown = "![](image.png)\n\n![A diagram](diagram.svg)\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "[[image.png]]\n\n[[diagram.svg][A diagram]]\n"
    )
  })

  it("should convert tables with a header rule", () => {
    const markdown = "| a | b |\n| --- | --- |\n| 1 | 2 |\n"

    expect(convertMarkdownToOrg(markdown)).toBe("| a | b |\n|-|\n| 1 | 2 |\n")
  })

  it("should convert column alignment to an org cookie row", () => {
    const markdown = "| a | b | c |\n| :-- | --: | :-: |\n| 1 | 2 | 3 |\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "| a | b | c |\n|-|\n| <l> | <r> | <c> |\n| 1 | 2 | 3 |\n"
    )
  })

  it("should restore known key:: values to native org syntax", () => {
    const markdown =
      "# Ship it\n\ntodo:: TODO\npriority:: A\ntags:: work, urgent\n\nBody text.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "* TODO [#A] Ship it :work:urgent:\nBody text.\n"
    )
  })

  it("should restore planning keys and unknown keys as drawer properties", () => {
    const markdown =
      "# Meeting\n\nscheduled:: <2026-09-15 Tue>\ndeadline:: <2026-09-20 Sun>\n\ncustom_id:: mtg\n\nNotes.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "* Meeting\nSCHEDULED: <2026-09-15 Tue> DEADLINE: <2026-09-20 Sun>\n:PROPERTIES:\n:custom_id: mtg\n:END:\nNotes.\n"
    )
  })

  it("should preserve block html as an export block", () => {
    const markdown = '<div class="note">\nRaw html\n</div>\n'

    expect(convertMarkdownToOrg(markdown)).toBe(
      '#+begin_export html\n<div class="note">\nRaw html\n</div>\n#+end_export\n'
    )
  })

  it("should preserve inline html as export snippets", () => {
    const markdown = "Press <kbd>x</kbd> now.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "Press @@html:<kbd>@@x@@html:</kbd>@@ now.\n"
    )
  })

  it("should drop html when preserveMdisms.html is false", () => {
    const markdown = "Press <kbd>x</kbd> now.\n\n<div>\nblock\n</div>\n"

    expect(
      convertMarkdownToOrg(markdown, { preserveMdisms: { html: false } })
    ).toBe("Press x now.\n")
  })

  it("should convert thematic breaks to org horizontal rules", () => {
    const markdown = "before\n\n---\n\nafter\n"

    expect(convertMarkdownToOrg(markdown)).toBe("before\n\n-----\nafter\n")
  })

  it("should convert hard line breaks to org line breaks", () => {
    const markdown = "line one\\\nline two\n"

    expect(convertMarkdownToOrg(markdown)).toBe("line one\\\\\nline two\n")
  })

  it("should convert strikethrough to org strike-through", () => {
    const markdown = "This is ~~gone~~ now.\n"

    expect(convertMarkdownToOrg(markdown)).toBe("This is +gone+ now.\n")
  })

  it("should convert footnotes to org footnotes", () => {
    const markdown = "A claim.[^1]\n\n[^1]: The evidence.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "A claim.[fn:1]\n\n[fn:1] The evidence.\n"
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
