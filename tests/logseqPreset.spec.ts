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

  it("maps TODO/DONE text markers to org keywords and back", () => {
    const markdown = "# TODO Ship it\n\nTODO write tests\n\nDONE plan work\n"
    const logseqOrg =
      "* TODO Ship it\n:PROPERTIES:\n:heading: 1\n:END:\n** TODO write tests\n** DONE plan work\n"

    expect(convertMarkdownToOrg(markdown, { preset: logseq() })).toBe(logseqOrg)
    expect(convertOrgToMarkdown(logseqOrg, { preset: logseq() })).toBe(markdown)
  })

  it("keeps ^^highlight^^ markup intact", () => {
    const org =
      "* Head\n:PROPERTIES:\n:heading: 1\n:END:\n** Some ^^bright words^^ here.\n"

    expect(convertOrgToMarkdown(org, { preset: logseq() })).toBe(
      "# Head\n\nSome ^^bright words^^ here.\n"
    )
  })

  it("maps page references to wikilinks and labeled forms", () => {
    const org =
      "** See [[my page name]] and [[other page][a label]]\n** [[((60ab-uuid))][a block ref]]\n"

    expect(convertOrgToMarkdown(org, { preset: logseq() })).toBe(
      "See [[my page name]] and [a label]([[other page]])\n\n[a block ref](((60ab-uuid)))\n"
    )
  })

  it("restores labeled page references from markdown", () => {
    const markdown = "See [a label]([[other page]]) here.\n"

    expect(convertMarkdownToOrg(markdown, { preset: logseq() })).toBe(
      "* See [[other page][a label]] here.\n"
    )
  })

  it("maps priorities to [#A] text markers and back", () => {
    const org = "** TODO [#A] urgent thing\n"

    expect(convertOrgToMarkdown(org, { preset: logseq() })).toBe(
      "TODO [#A] urgent thing\n"
    )
    expect(
      convertMarkdownToOrg("TODO [#A] urgent thing\n", { preset: logseq() })
    ).toBe("* TODO [#A] urgent thing\n")
  })

  it("logseq syntax survives a full round trip", () => {
    const markdown =
      "# TODO [#B] Plan garden\n\nSee [[seed catalog]] and [notes]([[soil types]]).\n\nRefs: [context](((abc-123))) and ((abc-123)) inline.\n\nSome ^^bright words^^ here.\n\n{{embed [[seed catalog]]}}\n"
    const roundTrip = (md: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(md, { preset: logseq() }), {
        preset: logseq()
      })
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it("keeps org's element order around a planning line", () => {
    // planning must sit directly below the headline and org reads only
    // one property drawer, so :heading: has to join the existing one
    const markdown =
      "# Task\n\ntodo:: TODO\nscheduled:: <2026-01-01 Thu>\ncustom_id:: abc\n"

    expect(convertMarkdownToOrg(markdown, { preset: logseq() })).toBe(
      "* TODO Task\nSCHEDULED: <2026-01-01 Thu>\n:PROPERTIES:\n" +
        ":heading: 1\n:custom_id: abc\n:END:\n"
    )
  })

  it("still recognizes a heading whose drawer follows a planning line", () => {
    const org =
      "* Heading\nSCHEDULED: <2026-01-01 Thu>\n:PROPERTIES:\n:heading: 1\n:END:\n\nbody\n"

    expect(convertOrgToMarkdown(org, { preset: logseq() })).toBe(
      "# Heading\n\nscheduled:: <2026-01-01 Thu>\n\nbody\n"
    )
  })

  it("converges with a planning line and a drawer property", () => {
    const markdown =
      "# Task\n\ntodo:: TODO\nscheduled:: <2026-01-01 Thu>\ncustom_id:: abc\n"
    const roundTrip = (md: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(md, { preset: logseq() }), {
        preset: logseq()
      })
    const once = roundTrip(markdown)
    expect(roundTrip(once)).toBe(once)
  })

  it("keeps flat body content with nestUnderHeadings false", () => {
    expect(
      convertMarkdownToOrg("# foo\n\nabc\n", {
        preset: logseq({ nestUnderHeadings: false })
      })
    ).toBe("* foo\n:PROPERTIES:\n:heading: 1\n:END:\n\nabc\n")
  })
})
