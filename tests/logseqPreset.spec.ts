import { describe, it, expect } from "vitest"
import { applyLogseqSpecificsToUniorgAst } from "../src/presets/logseq.js"
import type { OrgData, Headline, PropertyDrawer } from "uniorg"

describe("applyLogseqSpecificsToUniorgAst", () => {
  it("should add :PROPERTIES: drawer as a sibling to headlines", () => {
    const uniorgAst: OrgData = {
      type: "org-data",
      children: [
        {
          type: "headline",
          level: 1,
          children: [{ type: "text", value: "Hello World" }]
        } as Headline
      ],
      contentsBegin: 0,
      contentsEnd: 0
    }

    const result = applyLogseqSpecificsToUniorgAst(uniorgAst)

    // Expect the root's children to contain the headline, then the property drawer, then the newline
    expect(result.children).toHaveLength(3) // Headline, PropertyDrawer, Newline

    const headline = result.children[0] as Headline
    const propertyDrawer = result.children[1] as PropertyDrawer
    const newline = result.children[2]

    expect(headline.type).toBe("headline")
    expect(headline.children).toEqual([{ type: "text", value: "Hello World" }])

    expect(propertyDrawer).toEqual({
      type: "property-drawer",
      children: [
        {
          type: "node-property",
          key: "heading",
          value: "1"
        }
      ],
      contentsBegin: 0,
      contentsEnd: 0
    })

    expect(newline).toEqual({ type: "text", value: "\n" })
  })
})
