import { describe, it, expect } from "vitest"
import { unified } from "unified"
import uniorgParse from "uniorg-parse"

// canaries: each fails once uniorg-parse fixes the bug a morg workaround
// exists for, so the workaround can go
describe("uniorg-parse bugs morg works around", () => {
  it("throws on a line starting `_.` (src/core/underscoreBullets.ts)", () => {
    expect(() => unified().use(uniorgParse).parse("_. a\n")).toThrow(
      /match error/
    )
  })
})
