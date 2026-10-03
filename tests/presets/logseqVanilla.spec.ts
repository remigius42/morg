import { describe, it, expect } from "vitest"
import { logseq } from "../../src/presets/logseq.js"
import { convertOrgToMarkdown } from "../../src/orgToMarkdown.js"

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
})
