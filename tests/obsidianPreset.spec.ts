import { describe, it, expect } from "vitest"
import { convertMarkdownToOrg } from "../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../src/orgToMarkdown.js"
import { obsidian } from "../src/presets/obsidian.js"

describe("obsidian preset", () => {
  it("should convert org fuzzy links to wikilinks", () => {
    const org = "See [[Some Page]] and [[Other Page][an alias]].\n"

    expect(convertOrgToMarkdown(org, { preset: obsidian() })).toBe(
      "See [[Some Page]] and [[Other Page|an alias]].\n"
    )
  })

  it("should convert aliased wikilinks to org link descriptions", () => {
    const markdown = "See [[Some Page]] and [[Other Page|an alias]].\n"

    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(
      "See [[Some Page]] and [[Other Page][an alias]].\n"
    )
  })

  it("wikilinks converge after one round trip", () => {
    const markdown = "A [[Page]] and [[Other|alias]] in text.\n"
    const roundTrip = (md: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(md, { preset: obsidian() }), {
        preset: obsidian()
      })
    const once = roundTrip(markdown)
    expect(roundTrip(once)).toBe(once)
    expect(once).toContain("[[Page]]")
  })
})
