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

  it("should convert inline markup inside list items", () => {
    const org = "- some *bold* item\n- a [[https://example.com][link]] item\n"

    const markdown = convertOrgToMarkdown(org)

    expect(markdown).toBe(
      "- some **bold** item\n- a [link](https://example.com) item\n"
    )
  })
})
