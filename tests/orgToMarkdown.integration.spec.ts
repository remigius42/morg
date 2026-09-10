import { describe, it, expect } from "vitest"
import { convertOrgToMarkdown } from "../src/orgToMarkdown.js"

describe("convertOrgToMarkdown", () => {
  it("should convert inline markup and links", () => {
    const org =
      "This is /italic/ and *bold*, see [[https://example.com][Example]] or https://example.org.\n"

    const markdown = convertOrgToMarkdown(org)

    expect(markdown).toBe(
      "This is *italic* and **bold**, see [Example](https://example.com) or <https://example.org>.\n"
    )
  })

  it("should convert org code and verbatim to inline code", () => {
    const org = "Use ~foo~ or =bar= here.\n"

    expect(convertOrgToMarkdown(org)).toBe("Use `foo` or `bar` here.\n")
  })

  it("should convert src and example blocks to fenced code", () => {
    const org =
      '#+begin_src js\nconsole.log("hi")\n#+end_src\n\n#+begin_example\nplain\n#+end_example\n'

    expect(convertOrgToMarkdown(org)).toBe(
      '```js\nconsole.log("hi")\n```\n\n```\nplain\n```\n'
    )
  })

  it("should convert quote blocks to blockquotes", () => {
    const org = "#+begin_quote\nQuoted /wisdom/ here.\n#+end_quote\n"

    expect(convertOrgToMarkdown(org)).toBe("> Quoted *wisdom* here.\n")
  })

  it("should convert image links to markdown images", () => {
    const org =
      "[[image.png]]\n\n[[diagram.svg][A diagram]]\n\n[[https://example.com/page][not an image]]\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "![](image.png)\n\n![A diagram](diagram.svg)\n\n[not an image](https://example.com/page)\n"
    )
  })

  it("should convert org tables to gfm tables", () => {
    const org = "| a | b |\n|-|\n| 1 | 2 |\n"

    expect(convertOrgToMarkdown(org)).toBe("| a | b |\n| - | - |\n| 1 | 2 |\n")
  })

  it("should use the first row as header for rule-less org tables", () => {
    const org = "| a | b |\n| 1 | 2 |\n"

    expect(convertOrgToMarkdown(org)).toBe("| a | b |\n| - | - |\n| 1 | 2 |\n")
  })

  it("should convert org alignment cookie rows to gfm alignment", () => {
    const org = "| a | b | c |\n|-|\n| <l> | <r> | <c> |\n| 1 | 2 | 3 |\n"

    // remark-stringify pads cells to reflect the column alignment
    expect(convertOrgToMarkdown(org)).toBe(
      "| a  |  b |  c  |\n| :- | -: | :-: |\n| 1  |  2 |  3  |\n"
    )
  })

  it("should serialize headline org-isms as key:: value lines", () => {
    const org = "* TODO [#A] Ship it :work:urgent:\nBody text.\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "# Ship it\n\ntodo:: TODO\npriority:: A\ntags:: work, urgent\n\nBody text.\n"
    )
  })

  it("should drop org-isms when preserveOrgisms is false", () => {
    const org = "* TODO [#A] Ship it :work:urgent:\nBody text.\n"

    expect(convertOrgToMarkdown(org, { preserveOrgisms: false })).toBe(
      "# Ship it\n\nBody text.\n"
    )
  })

  it("should serialize planning and property drawers as key:: values", () => {
    const org =
      "* Meeting\nSCHEDULED: <2026-09-15 Tue> DEADLINE: <2026-09-20 Sun>\n:PROPERTIES:\n:custom_id: mtg\n:END:\nNotes.\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "# Meeting\n\nscheduled:: <2026-09-15 Tue>\ndeadline:: <2026-09-20 Sun>\n\ncustom_id:: mtg\n\nNotes.\n"
    )
  })

  it("should restore html export blocks and snippets to raw html", () => {
    const org =
      '#+begin_export html\n<div class="note">\nRaw html\n</div>\n#+end_export\n\nPress @@html:<kbd>@@x@@html:</kbd>@@ now.\n'

    expect(convertOrgToMarkdown(org)).toBe(
      '<div class="note">\nRaw html\n</div>\n\nPress <kbd>x</kbd> now.\n'
    )
  })

  it("should convert org strike-through to gfm strikethrough", () => {
    const org = "This is +gone+ now.\n"

    expect(convertOrgToMarkdown(org)).toBe("This is ~~gone~~ now.\n")
  })

  it("should convert inline markup inside list items", () => {
    const org = "- some *bold* item\n- a [[https://example.com][link]] item\n"

    const markdown = convertOrgToMarkdown(org)

    expect(markdown).toBe(
      "- some **bold** item\n- a [link](https://example.com) item\n"
    )
  })
})
