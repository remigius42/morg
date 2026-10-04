import { describe, it, expect } from "vitest"
import { convertMarkdownToOrg } from "../../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../../src/orgToMarkdown.js"
import { obsidian } from "../../src/presets/obsidian.js"

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

  it("escapes the alias pipe of a wikilink inside a table cell", () => {
    // Obsidian's own convention; a bare | would split the cell
    const org = "| a |\n|-|\n| [[Page][alias]] |\n"
    const markdown = convertOrgToMarkdown(org, { preset: obsidian() })

    expect(markdown).toBe(
      "| a               |\n| --------------- |\n| [[Page\\|alias]] |\n"
    )
    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(org)
  })

  it("keeps underscores in a wikilink alias out of org scripts", () => {
    const markdown = "[[a_b.md|a_b]]\n"

    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(
      "#+OPTIONS: ^:{}\n[[a_b.md][a_b]]\n"
    )
  })

  it("keeps relative markdown links as links, not wikilinks", () => {
    const markdown = "[t](file.md) and [[Page]]\n"
    const org = convertMarkdownToOrg(markdown, { preset: obsidian() })

    expect(convertOrgToMarkdown(org, { preset: obsidian() })).toBe(markdown)
  })

  it("keeps an embed's size, not reading it as an alias", () => {
    const markdown = "An ![[image.png|300]] and [[Page|alias]].\n"

    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(
      "An ![[image.png|300]] and [[Page][alias]].\n"
    )
  })

  it("writes an embed unescaped", () => {
    const org = "![[image.png]] and ![[image.png|300]]\n"

    expect(convertOrgToMarkdown(org, { preset: obsidian() })).toBe(org)
  })
})
