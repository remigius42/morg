import { describe, it, expect } from "vitest"
import { convertOrgToMarkdown } from "../src/orgToMarkdown.js"

describe("convertOrgToMarkdown", () => {
  it("should convert inline markup and links", () => {
    const org =
      "This is /italic/ and *bold*, see [[https://example.com][Example]] or https://example.org.\n"

    const markdown = convertOrgToMarkdown(org)

    expect(markdown).toBe(
      "This is *italic* and **bold**, see [Example](https://example.com) or <https://example.org>.\n"
    )
  })

  it("should convert org code and verbatim to inline code", () => {
    const org = "Use ~foo~ or =bar= here.\n"

    expect(convertOrgToMarkdown(org)).toBe("Use `foo` or `bar` here.\n")
  })

  it("should convert src and example blocks to fenced code", () => {
    const org =
      '#+begin_src js\nconsole.log("hi")\n#+end_src\n\n#+begin_example\nplain\n#+end_example\n'

    expect(convertOrgToMarkdown(org)).toBe(
      '```js\nconsole.log("hi")\n```\n\n```\nplain\n```\n'
    )
  })

  it("should convert quote blocks to blockquotes", () => {
    const org = "#+begin_quote\nQuoted /wisdom/ here.\n#+end_quote\n"

    expect(convertOrgToMarkdown(org)).toBe("> Quoted *wisdom* here.\n")
  })

  it("should convert image links to markdown images", () => {
    const org =
      "[[image.png]]\n\n[[diagram.svg][A diagram]]\n\n[[https://example.com/page][not an image]]\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "![](image.png)\n\n![A diagram](diagram.svg)\n\n[not an image](https://example.com/page)\n"
    )
  })

  it("should convert org tables to gfm tables", () => {
    const org = "| a | b |\n|-|\n| 1 | 2 |\n"

    expect(convertOrgToMarkdown(org)).toBe("| a | b |\n| - | - |\n| 1 | 2 |\n")
  })

  it("should use the first row as header for rule-less org tables", () => {
    const org = "| a | b |\n| 1 | 2 |\n"

    expect(convertOrgToMarkdown(org)).toBe("| a | b |\n| - | - |\n| 1 | 2 |\n")
  })

  it("should convert org alignment cookie rows to gfm alignment", () => {
    const org = "| a | b | c |\n|-|\n| <l> | <r> | <c> |\n| 1 | 2 | 3 |\n"

    // remark-stringify pads cells to reflect the column alignment
    expect(convertOrgToMarkdown(org)).toBe(
      "| a  |  b |  c  |\n| :- | -: | :-: |\n| 1  |  2 |  3  |\n"
    )
  })

  it("should serialize table.el tables as table.el fenced blocks", () => {
    const org = "+---+---+\n| a | b |\n+---+---+\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "```table.el\n+---+---+\n| a | b |\n+---+---+\n```\n"
    )
  })

  it("should map bare TODO/DONE headlines to task items with taskCheckboxes", () => {
    const org = "* TODO Buy milk\n* DONE Call mom\n"

    expect(convertOrgToMarkdown(org, { taskCheckboxes: true })).toBe(
      "- [ ] Buy milk\n- [x] Call mom\n"
    )
  })

  it("should keep unmappable TODO headlines as headings and warn", () => {
    const warnings: string[] = []
    const org = "* TODO [#A] Ship it\n\n* TODO With body\nBody text.\n"

    expect(
      convertOrgToMarkdown(org, {
        taskCheckboxes: true,
        onWarning: m => warnings.push(m)
      })
    ).toBe(
      "# Ship it\n\ntodo:: TODO\npriority:: A\n\n# With body\n\ntodo:: TODO\n\nBody text.\n"
    )
    expect(warnings).toEqual([
      'taskCheckboxes: kept heading "Ship it" (has priority)',
      'taskCheckboxes: kept heading "With body" (has content)'
    ])
  })

  it("should serialize headline org-isms as key:: value lines", () => {
    const org = "* TODO [#A] Ship it :work:urgent:\nBody text.\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "# Ship it\n\ntodo:: TODO\npriority:: A\ntags:: work, urgent\n\nBody text.\n"
    )
  })

  it("should drop org-isms when preserveOrgisms is false", () => {
    const org = "* TODO [#A] Ship it :work:urgent:\nBody text.\n"

    expect(convertOrgToMarkdown(org, { preserveOrgisms: false })).toBe(
      "# Ship it\n\nBody text.\n"
    )
  })

  it("should serialize planning and property drawers as key:: values", () => {
    const org =
      "* Meeting\nSCHEDULED: <2026-09-15 Tue> DEADLINE: <2026-09-20 Sun>\n:PROPERTIES:\n:custom_id: mtg\n:END:\nNotes.\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "# Meeting\n\nscheduled:: <2026-09-15 Tue>\ndeadline:: <2026-09-20 Sun>\n\ncustom_id:: mtg\n\nNotes.\n"
    )
  })

  it("should report dropped org constructs via onWarning", () => {
    const warnings: string[] = []
    const org = "#+begin_export latex\n\\sloppy\n#+end_export\n"

    convertOrgToMarkdown(org, { onWarning: m => warnings.push(m) })

    expect(warnings).toEqual(["dropped org export-block (latex)"])
  })

  it("should keep special, verse and fixed-width blocks verbatim", () => {
    const org =
      "#+begin_warning\nBe careful.\n#+end_warning\n\n#+begin_verse\nroses are red\nviolets are blue\n#+end_verse\n\n: fixed one\n: fixed two\n"

    expect(convertOrgToMarkdown(org)).toBe(org)
  })

  it("should keep statistics cookies and citations as text", () => {
    const org = "* Tasks [1/2]\n[cite:@key2026] backs this.\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "# Tasks \\[1/2]\n\n\\[cite:@key2026] backs this.\n"
    )
  })

  it("should convert org comments to html comments", () => {
    const org = "# a note\n\n# first\n# second\n\nText.\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "<!-- a note -->\n\n<!--\nfirst\nsecond\n-->\n\nText.\n"
    )
  })

  it("should keep generic drawers verbatim", () => {
    const org = "* Task\n:LOGBOOK:\nNote taken.\n:END:\nBody.\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "# Task\n\n:LOGBOOK:\nNote taken.\n:END:\n\nBody.\n"
    )
  })

  it("should restore html export blocks and snippets to raw html", () => {
    const org =
      '#+begin_export html\n<div class="note">\nRaw html\n</div>\n#+end_export\n\nPress @@html:<kbd>@@x@@html:</kbd>@@ now.\n'

    expect(convertOrgToMarkdown(org)).toBe(
      '<div class="note">\nRaw html\n</div>\n\nPress <kbd>x</kbd> now.\n'
    )
  })

  it("should convert org horizontal rules to thematic breaks", () => {
    const org = "before\n\n-----\nafter\n"

    expect(convertOrgToMarkdown(org)).toBe("before\n\n---\n\nafter\n")
  })

  it("should convert org line breaks to hard line breaks", () => {
    const org = "line one\\\\\nline two\n"

    expect(convertOrgToMarkdown(org)).toBe("line one\\\nline two\n")
  })

  it("should keep underline, superscript and subscript verbatim", () => {
    const org = "Some _underlined text_ and H_{2}O or x^{2} here.\n"

    // markdown has no equivalents; the raw org markup is kept as text
    // (escaped) so the return trip re-parses it natively
    expect(convertOrgToMarkdown(org)).toBe(
      "Some \\_underlined text\\_ and H\\_{2}O or x^{2} here.\n"
    )
  })

  it("should convert leading org keywords to frontmatter", () => {
    const org = '#+TITLE: My Note\n#+AUTHOR: Rem\n#+TAGS: ["a","b"]\nBody.\n'

    expect(convertOrgToMarkdown(org)).toBe(
      "---\ntitle: My Note\nauthor: Rem\ntags:\n  - a\n  - b\n---\n\nBody.\n"
    )
  })

  it("should keep inline timestamps verbatim", () => {
    const org = "Meet on <2026-09-15 Tue> or logged [2026-09-01 Tue] instead.\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "Meet on <2026-09-15 Tue> or logged \\[2026-09-01 Tue] instead.\n"
    )
  })

  it("should convert latex fragments to markdown math", () => {
    const org = "Inline $x^2$ and \\(y\\) here.\n"

    expect(convertOrgToMarkdown(org)).toBe("Inline $x^2$ and $y$ here.\n")
  })

  it("should convert display math and environments to math blocks", () => {
    const org =
      "$$\na + b\n$$\n\n\\begin{equation}\nE = mc^2\n\\end{equation}\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "$$\na + b\n$$\n\n$$\n\\begin{equation}\nE = mc^2\n\\end{equation}\n$$\n"
    )
  })

  it("should convert entities to their utf8 character", () => {
    const org = "An \\alpha and \\rarr here.\n"

    expect(convertOrgToMarkdown(org)).toBe("An α and → here.\n")
  })

  it("should honor markdownStyle stringifier knobs", () => {
    const org =
      "Some /italic/ and *bold* text.\n\n- item one\n- item two\n\n-----\n\n#+begin_src js\ncode()\n#+end_src\n"

    expect(
      convertOrgToMarkdown(org, {
        markdownStyle: { emphasis: "_", bullet: "*", rule: "*", fence: "~" }
      })
    ).toBe(
      "Some _italic_ and **bold** text.\n\n* item one\n* item two\n\n***\n\n~~~js\ncode()\n~~~\n"
    )
  })

  it("should convert org strike-through to gfm strikethrough", () => {
    const org = "This is +gone+ now.\n"

    expect(convertOrgToMarkdown(org)).toBe("This is ~~gone~~ now.\n")
  })

  it("should normalize inline footnotes to reference plus definition", () => {
    const org =
      "One.[fn:: Anonymous note] Two.[fn:named: Labeled note] More.[fn:1]\n\n[fn:1] Existing.\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "One.[^2] Two.[^named] More.[^1]\n\n[^1]: Existing.\n\n[^2]: Anonymous note\n\n[^named]: Labeled note\n"
    )
  })

  it("should convert org footnotes to gfm footnotes", () => {
    const org = "A claim.[fn:1]\n\n[fn:1] The evidence.\n"

    expect(convertOrgToMarkdown(org)).toBe(
      "A claim.[^1]\n\n[^1]: The evidence.\n"
    )
  })

  it("should keep descriptive list terms verbatim", () => {
    const org = "- apple :: a fruit\n- vim :: an /editor/\n"

    // md has no descriptive lists; the ` :: ` syntax is kept literally so
    // the return trip re-parses it as a descriptive list
    expect(convertOrgToMarkdown(org)).toBe(
      "- apple :: a fruit\n- vim :: an *editor*\n"
    )
  })

  it("should render sub/superscript and underline as html when useHtml", () => {
    const org = "Some _underlined text_ and H_{2}O or x^{2} here.\n"

    expect(convertOrgToMarkdown(org, { useHtml: true })).toBe(
      "Some <u>underlined text</u> and H<sub>2</sub>O or x<sup>2</sup> here.\n"
    )
  })

  it("should render descriptive lists as html when useHtml", () => {
    const org = "- apple :: a fruit\n- vim :: an editor\n"

    expect(convertOrgToMarkdown(org, { useHtml: true })).toBe(
      "<dl>\n<dt>apple</dt>\n<dd>a fruit</dd>\n<dt>vim</dt>\n<dd>an editor</dd>\n</dl>\n"
    )
  })

  it("should convert inline markup inside list items", () => {
    const org = "- some *bold* item\n- a [[https://example.com][link]] item\n"

    const markdown = convertOrgToMarkdown(org)

    expect(markdown).toBe(
      "- some **bold** item\n- a [link](https://example.com) item\n"
    )
  })
})
