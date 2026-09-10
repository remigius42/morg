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

  it("should convert inline markup inside list items", () => {
    const org = "- some *bold* item\n- a [[https://example.com][link]] item\n"

    const markdown = convertOrgToMarkdown(org)

    expect(markdown).toBe(
      "- some **bold** item\n- a [link](https://example.com) item\n"
    )
  })
})
