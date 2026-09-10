import { describe, it, expect } from "vitest"
import { normalizeMarkdown, normalizeOrg } from "../src/normalize.js"

describe("normalizeMarkdown", () => {
  it("normalizes to morg's canonical markdown form", () => {
    const markdown =
      "* star bullet\n\n***\n\nA [ref][r] link.\n\n[r]: https://example.com\n"

    expect(normalizeMarkdown(markdown)).toBe(
      "- star bullet\n\n---\n\nA [ref](https://example.com) link.\n"
    )
  })

  it("is idempotent", () => {
    const markdown = "# Heading\n\nSome *text* with `code`.\n\n1. one\n2. two\n"
    const once = normalizeMarkdown(markdown)

    expect(normalizeMarkdown(once)).toBe(once)
  })
})

describe("normalizeOrg", () => {
  it("normalizes to morg's canonical org form", () => {
    const org = "An \\alpha entity and an inline footnote.[fn:: Inline note]\n"

    expect(normalizeOrg(org)).toBe(
      "An α entity and an inline footnote.[fn:1]\n\n[fn:1] Inline note\n"
    )
  })

  it("is idempotent", () => {
    const org =
      "* TODO [#A] Ship it :work:\nSCHEDULED: <2026-09-15 Tue>\nBody.\n"
    const once = normalizeOrg(org)

    expect(normalizeOrg(once)).toBe(once)
  })

  it("reports drops via onWarning", () => {
    const warnings: string[] = []
    normalizeOrg("#+begin_export latex\n\\sloppy\n#+end_export\n", {
      onWarning: m => warnings.push(m)
    })

    expect(warnings).toEqual(["dropped org export-block (latex)"])
  })
})
