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

  it("drops a comma-escaped code line's indentation (src/core/commaEscapes.ts)", () => {
    const tree = unified()
      .use(uniorgParse)
      .parse("#+begin_src\n  ,* x\n#+end_src\n")
    expect(tree.children[0]).toMatchObject({ value: "* x\n" })
  })

  it("drops an org table's affiliated keywords (src/core/tableKeywords.ts)", () => {
    const tree = unified().use(uniorgParse).parse("#+NAME: t\n| a |\n")
    expect(tree.children[0]).toMatchObject({ type: "table" })
    expect(tree.children[0]).not.toHaveProperty("affiliated")
  })

  it("reads the blank after a statistics cookie as its own (src/core/statisticsCookies.ts)", () => {
    const tree = unified().use(uniorgParse).parse("[1/2] b\n")
    expect(tree.children[0]).toMatchObject({
      children: [{ type: "statistics-cookie", postBlank: 1 }, { value: "b\n" }]
    })
  })

  it("reads `$x $` as math (src/core/dollarMath.ts)", () => {
    const tree = unified().use(uniorgParse).parse("a $x $ b\n")
    expect(tree.children[0]).toMatchObject({
      children: [
        { value: "a " },
        { type: "latex-fragment", value: "$x $" },
        { value: " b\n" }
      ]
    })
  })
})
