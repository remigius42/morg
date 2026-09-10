import { describe, it, expect } from "vitest"
import {
  applyLogseqSpecificsToUniorgAst,
  logseq
} from "../src/presets/logseq.js"
import { convertMarkdownToOrg } from "../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../src/orgToMarkdown.js"
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

    // Expect the root's children to contain the headline, then the property drawer
    expect(result.children).toHaveLength(2) // Headline, PropertyDrawer

    const headline = result.children[0] as Headline
    const propertyDrawer = result.children[1] as PropertyDrawer

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
  })
})

describe("logseq outline nesting", () => {
  const markdown = "# foo\n\nabc\n\n## bar\n\ndef\n\n### baz\n\ngamma\n"
  const logseqOrg =
    "* foo\n:PROPERTIES:\n:heading: 1\n:END:\n** abc\n** bar\n:PROPERTIES:\n:heading: 2\n:END:\n*** def\n*** baz\n:PROPERTIES:\n:heading: 3\n:END:\n**** gamma\n"

  it("nests content as child blocks under headings", () => {
    expect(convertMarkdownToOrg(markdown, { preset: logseq() })).toBe(logseqOrg)
  })

  it("extracts logseq outline org back to generic markdown", () => {
    expect(convertOrgToMarkdown(logseqOrg, { preset: logseq() })).toBe(markdown)
  })

  it("logseq round trip converges", () => {
    const roundTrip = (md: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(md, { preset: logseq() }), {
        preset: logseq()
      })
    const once = roundTrip(markdown)
    expect(roundTrip(once)).toBe(once)
  })

  it("emits hiccup blocks unescaped in markdown", () => {
    const org =
      '* foo\n:PROPERTIES:\n:heading: 1\n:END:\n** [:div {:class "note"} "hi"]\n'

    expect(convertOrgToMarkdown(org, { preset: logseq() })).toBe(
      '# foo\n\n[:div {:class "note"} "hi"]\n'
    )
  })

  it("hiccup blocks survive a logseq round trip", () => {
    const markdown = '# foo\n\n[:div {:class "note"} "hi"]\n'
    const roundTrip = (md: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(md, { preset: logseq() }), {
        preset: logseq()
      })
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it("keeps flat body content with nestUnderHeadings false", () => {
    expect(
      convertMarkdownToOrg("# foo\n\nabc\n", {
        preset: logseq({ nestUnderHeadings: false })
      })
    ).toBe("* foo\n:PROPERTIES:\n:heading: 1\n:END:\n\nabc\n")
  })
})
