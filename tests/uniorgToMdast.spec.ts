import { describe, it, expect } from "vitest"
import { transformUniorgAstToMdast } from "../src/core/uniorgToMdast.js"
import type { OrgData } from "uniorg"

describe("transformUniorgAstToMdast", () => {
  it("should transform a uniorg AST to a mdast", () => {
    // TODO: Add actual test cases here
    const uniorgAst: OrgData = {
      type: "org-data",
      children: [],
      contentsBegin: 0,
      contentsEnd: 0
    }

    const mdast = transformUniorgAstToMdast(uniorgAst)

    expect(mdast).toMatchObject({
      type: "root",
      children: []
    })
  })
})
