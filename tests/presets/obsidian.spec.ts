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

  it("keeps a link to a heading a Markdown link, not a wikilink", () => {
    const markdown =
      "## General plugins\n\nSee [the plugins](#general-plugins).\n"
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

  it("reads an image's size as its #+ATTR_HTML: line (ADR 0007)", () => {
    const markdown = "![a|300](img.png)\n\n> ![|300x200](b.png)\n"
    const org =
      "#+ATTR_HTML: :width 300\n[[file:img.png][a]]\n\n" +
      "#+begin_quote\n#+ATTR_HTML: :width 300 :height 200\n[[file:b.png]]\n#+end_quote\n"

    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(org)
    expect(convertOrgToMarkdown(org, { preset: obsidian() })).toBe(markdown)
  })

  it("writes its own size spelling over the html one", () => {
    const org = "#+ATTR_HTML: :width 300\n[[file:img.png][a]]\n"

    expect(
      convertOrgToMarkdown(org, { preset: obsidian(), spelling: "html" })
    ).toBe("![a|300](img.png)\n")
  })

  it("keeps a size Obsidian cannot spell, or an image in text, as written", () => {
    for (const org of [
      "#+ATTR_HTML: :height 200\n[[file:img.png]]\n",
      "#+ATTR_HTML: :width 50%\n[[file:img.png]]\n",
      "- x\n  #+ATTR_HTML: :width 300\n  [[file:img.png]]\n"
    ]) {
      expect(convertOrgToMarkdown(org, { preset: obsidian() })).toContain(
        "#+ATTR_HTML"
      )
    }
    expect(
      convertMarkdownToOrg("A ![a|300](img.png) b\n\n- ![c|3](d.png)\n", {
        preset: obsidian()
      })
    ).toBe("A [[file:img.png][a|300]] b\n\n- [[file:d.png][c|3]]\n")
  })
})

describe("obsidian callouts", () => {
  const both = (org: string, markdown: string): void => {
    expect(convertOrgToMarkdown(org, { preset: obsidian() })).toBe(markdown)
    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(org)
  }

  it("write an alert's type lower case, as Obsidian does", () => {
    both("#+begin_note\nb\n#+end_note\n", "> [!note]\n>\n> b\n")
  })

  it("keep folding as the parameters' leading token", () => {
    both(
      "#+begin_tip - Stretch first\nb\n#+end_tip\n",
      "> [!tip]- Stretch first\n>\n> b\n"
    )
    both("#+begin_faq +\nb\n#+end_faq\n", "> [!faq]+\n>\n> b\n")
    // a known limit: a title starting `- ` comes back folded
    expect(convertMarkdownToOrg("> [!tip] - T\n", { preset: obsidian() })).toBe(
      "#+begin_tip - T\n#+end_tip\n"
    )
  })

  it("nest as callouts", () => {
    both(
      "#+begin_note\n#+begin_tip -\nx\n#+end_tip\n#+end_note\n",
      "> [!note]\n>\n> > [!tip]-\n> >\n> > x\n"
    )
  })

  it("fold only in Obsidian Markdown", () => {
    // no alert elsewhere: the marker's `]` is followed by no space
    expect(convertMarkdownToOrg("> [!tip]- T\n")).toBe(
      "#+begin_quote\n[!tip]- T\n#+end_quote\n"
    )
  })
})
