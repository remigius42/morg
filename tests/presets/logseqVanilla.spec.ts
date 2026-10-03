import { describe, it, expect } from "vitest"
import { logseq } from "../../src/presets/logseq.js"
import { convertOrgToMarkdown } from "../../src/orgToMarkdown.js"
import { convertMarkdownToOrg } from "../../src/markdownToOrg.js"

describe("Logseq org → Vanilla md", () => {
  const toMarkdown = (org: string): string =>
    convertOrgToMarkdown(org, { inputPreset: logseq() })

  it("writes the blocks as a nested list", () => {
    expect(toMarkdown("* a\n** b\n*** c\n* d\n")).toBe(
      "- a\n  - b\n    - c\n- d\n"
    )
  })

  it("writes task markers as Logseq renders them", () => {
    expect(
      toMarkdown(
        "* TODO a\n* DONE b\n* LATER c\n* NOW d\n* WAITING e\n* CANCELED f\n"
      )
    ).toBe(
      "- [ ] a\n- [x] b\n- [ ] LATER c\n- [ ] NOW d\n- [ ] WAITING e\n- CANCELED f\n"
    )
  })

  it("writes planning and properties as key:: lines below the title", () => {
    expect(
      toMarkdown(
        "* TODO a\nSCHEDULED: <2026-10-04 Sat> DEADLINE: <2026-10-05 Sun>\n:PROPERTIES:\n:estimated-duration: 2h\n:id: 6512ab00\n:END:\nmore\n"
      )
    ).toBe(
      "- [ ] a\n  scheduled:: <2026-10-04 Sat>\n  deadline:: <2026-10-05 Sun>\n  estimated-duration:: 2h\n  id:: 6512ab00\n  more\n"
    )
  })

  it("names planning keys as orgismKeys says", () => {
    expect(
      convertOrgToMarkdown("* a\nSCHEDULED: <2026-10-04 Sat>\n", {
        inputPreset: logseq(),
        orgismKeys: { scheduled: "when" }
      })
    ).toBe("- a\n  when:: <2026-10-04 Sat>\n")
  })

  it("drops collapsed and the LOGBOOK with a warning", () => {
    const warnings: string[] = []
    expect(
      convertOrgToMarkdown(
        "* a\n:LOGBOOK:\nCLOCK: [2026-10-03 Sat 10:00]\n:END:\n:PROPERTIES:\n:collapsed: true\n:END:\n",
        { inputPreset: logseq(), onWarning: message => warnings.push(message) }
      )
    ).toBe("- a\n")
    expect(warnings).toEqual([
      "a LOGBOOK drawer has no Vanilla Markdown form; dropped",
      "collapsed is Logseq's view state; dropped"
    ])
  })

  it("writes a heading block as a heading, its children as a new list", () => {
    expect(
      toMarkdown(
        "* intro\n* Section\n:PROPERTIES:\n:heading: 2\n:END:\n** item\n*** sub\n** Deeper\n:PROPERTIES:\n:heading: 3\n:END:\n*** under\n"
      )
    ).toBe(
      "- intro\n\n## Section\n\n- item\n  - sub\n\n### Deeper\n\n- under\n"
    )
  })

  it("keeps a heading inside a list item where a list holds it", () => {
    expect(toMarkdown("* a\n** b\n:PROPERTIES:\n:heading: 2\n:END:\n")).toBe(
      "- a\n  - ## b\n"
    )
  })

  it("numbers the blocks Logseq numbers", () => {
    const numbered = ":PROPERTIES:\n:logseq.order-list-type: number\n:END:\n"
    expect(
      toMarkdown(`* a\n${numbered}** x\n${numbered}* b\n${numbered}* c\n`)
    ).toBe("1. a\n   1. x\n2. b\n- c\n")
  })

  it("ends a page with or without blocks in one line break", () => {
    expect(toMarkdown("just text\n")).toBe("just text\n")
    expect(toMarkdown("just text\n\n* a\n")).toBe("just text\n\n- a\n")
  })

  it("carries page and block refs in Logseq's Markdown syntax", () => {
    expect(
      toMarkdown(
        "* see [[Page]], [[Other][a label]] and [[((6512ab00-0000))][a ref]]\n"
      )
    ).toBe(
      "- see [[Page]], [a label]([[Other]]) and [a ref](((6512ab00-0000)))\n"
    )
  })

  it("keeps macros, tags, priorities, addresses and hiccup as written", () => {
    expect(
      toMarkdown(
        '* {{video https://x.y/z}} #tag\n* TODO [#A] mail a@b.ch\n* [:div "hi"]\n'
      )
    ).toBe(
      '- {{video https://x.y/z}} #tag\n- [ ] [#A] mail a@b.ch\n- [:div "hi"]\n'
    )
  })

  it("writes a query as a query code block", () => {
    expect(
      toMarkdown(
        '* tasks\n#+BEGIN_QUERY\n{:title "x" :query (and [[Page]] (task TODO))}\n#+END_QUERY\n'
      )
    ).toBe(
      '- tasks\n\n  ```query\n  {:title "x" :query (and [[Page]] (task TODO))}\n  ```\n'
    )
  })
})

describe("Vanilla md → Logseq org", () => {
  const toOrg = (markdown: string): string =>
    convertMarkdownToOrg(markdown, { outputPreset: logseq() })

  it("reads a nested list as blocks", () => {
    expect(toOrg("- a\n  - b\n    - c\n- d\n")).toBe("* a\n** b\n*** c\n* d\n")
  })

  it("reads a heading as a block, its body as content, a list as children", () => {
    const heading = (level: number) =>
      `:PROPERTIES:\n:heading: ${level}\n:END:\n`
    expect(
      toOrg(
        "intro\n\n## Section\n\nbody\n\nmore body\n\n- item\n  - sub\n\nafter\n\n### Deeper\n\n- under\n\n## Next\n"
      )
    ).toBe(
      `* intro\n* Section\n${heading(2)}body\n\nmore body\n** item\n*** sub\n** after\n** Deeper\n${heading(3)}*** under\n* Next\n${heading(2)}`
    )
  })

  it("reads task items as Logseq's task markers", () => {
    expect(
      toOrg("- [ ] a\n- [x] b\n- [X] c\n- [ ] LATER d\n- CANCELED e\n")
    ).toBe("* TODO a\n* DONE b\n* DONE c\n* LATER d\n* CANCELED e\n")
  })

  it("reads key:: lines below the title as planning and properties", () => {
    expect(
      toOrg(
        "- [ ] a\n  scheduled:: <2026-10-04 Sat>\n  deadline:: <2026-10-05 Sun>\n  estimated-duration:: 2h\n  more\n"
      )
    ).toBe(
      "* TODO a\nSCHEDULED: <2026-10-04 Sat> DEADLINE: <2026-10-05 Sun>\n:PROPERTIES:\n:estimated-duration: 2h\n:END:\nmore\n"
    )
    expect(
      convertMarkdownToOrg("- a\n  when:: <2026-10-04 Sat>\n", {
        outputPreset: logseq(),
        orgismKeys: { scheduled: "when" }
      })
    ).toBe("* a\nSCHEDULED: <2026-10-04 Sat>\n")
  })

  it("reads an ordered list as numbered blocks", () => {
    const numbered = ":PROPERTIES:\n:logseq.order-list-type: number\n:END:\n"
    expect(toOrg("1. a\n   1. x\n2. b\n")).toBe(
      `* a\n${numbered}** x\n${numbered}* b\n${numbered}`
    )
  })

  it("reads a heading in a list item as a heading block", () => {
    expect(toOrg("- a\n  - ## b\n")).toBe(
      "* a\n** b\n:PROPERTIES:\n:heading: 2\n:END:\n"
    )
  })

  it("keeps an item's text after its nested list, as a child block", () => {
    expect(
      toOrg("- item\n\n  - child\n\n  tail of item\n\n  more\n- next\n")
    ).toBe("* item\n** child\n** tail of item\n** more\n* next\n")
  })

  it("keeps a lazy continuation line whole", () => {
    expect(toOrg("- a\nlazy\n")).toBe("* a\nlazy\n")
  })

  it("reads a list on an item's first line as its content", () => {
    // Markdown has no item whose content opens with a list and that has
    // children besides: `y` belongs to the inner list
    expect(toOrg("- - x\n  - y\n")).toBe("* - x\n- y\n")
    expect(toOrg("- - x\n")).toBe("* - x\n")
    expect(
      convertOrgToMarkdown("* - x\n** y\n", { inputPreset: logseq() })
    ).toBe("- - x\n  - y\n")
  })

  it("recognizes Logseq's carried syntax as Logseq's again", () => {
    expect(
      toOrg(
        "- see [[Page]], [a label]([[Other]]) and [a ref](((6512ab00-0000)))\n- {{video https://x.y/z}} #tag\n- [ ] [#A] mail a@b.ch\n"
      )
    ).toBe(
      "* see [[Page]], [[Other][a label]] and [[((6512ab00-0000))][a ref]]\n* {{video https://x.y/z}} #tag\n* TODO [#A] mail a@b.ch\n"
    )
  })

  it("reads a query code block as a query block", () => {
    expect(toOrg('- tasks\n\n  ```query\n  {:title "x"}\n  ```\n')).toBe(
      '* tasks\n\n#+begin_QUERY\n{:title "x"}\n#+end_QUERY\n'
    )
  })
  it("stays a code block between Logseq's formats", () => {
    expect(
      convertMarkdownToOrg("- a\n  ```query\n  x\n  ```\n", {
        preset: logseq()
      })
    ).toBe("* a\n\n#+begin_src query\nx\n#+end_src\n")
    expect(
      convertOrgToMarkdown("* a\n#+begin_src query\nx\n#+end_src\n", {
        preset: logseq()
      })
    ).toBe("- a\n  \n  ```query\n  x\n  ```\n")
  })

  it("resolves reference links before the page splits into blocks", () => {
    expect(
      toOrg(
        "- see [x][ref], [y][] and [ref]\n- ![pic][img]\n\n[ref]: https://a.b\n[y]: https://c.d\n[img]: https://e.f/g.png\n"
      )
    ).toBe(
      "* see [[https://a.b][x]], [[https://c.d][y]] and [[https://a.b][ref]]\n* [[https://e.f/g.png][pic]]\n"
    )
  })

  it("resolves a reference link in a footnote it moves", () => {
    expect(
      toOrg(
        "- a note[^1]\n\n[^1]: see [docs][d] here\n\n[d]: http://example.com/long/path\n"
      )
    ).toBe(
      "* a note[fn:1]\n\n[fn:1] see [[http://example.com/long/path][docs]] here\n"
    )
  })

  it("moves a footnote to the block of its first reference", () => {
    expect(toOrg("- a\n- b[^1]\n\n[^1]: a note\n")).toBe(
      "* a\n* b[fn:1]\n\n[fn:1] a note\n"
    )
  })

  it("reads the frontmatter as the page's", () => {
    expect(toOrg("---\ntitle: P\nweird: {a: 1}\n---\n\n- a\n")).toBe(
      "#+title: P\n#+begin_comment morg_frontmatter\nweird: {a: 1}\n#+end_comment\n\n* a\n"
    )
  })
})
