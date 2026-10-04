import { describe, it, expect } from "vitest"
import { translateOrg } from "../src/translate.js"
import { logseq } from "../src/presets/logseq.js"

const TODO_LINE =
  "#+TODO: TODO NOW LATER DOING WAIT WAITING IN-PROGRESS STARTED | DONE CANCELED CANCELLED"

describe("translateOrg", () => {
  it("writes Logseq org's headlines as Emacs reads them", () => {
    const org = "* a\n*\n** #+BEGIN_SRC sh\necho\n#+END_SRC\n"

    expect(translateOrg(org, { inputPreset: logseq() })).toBe(
      "* a\n* \n** \n#+BEGIN_SRC sh\necho\n#+END_SRC\n"
    )
  })

  it("writes Vanilla org's headlines as Logseq org does", () => {
    const org =
      "#+title: P\n\n* \n** \n| a |\n| b |\n* 1. Which\n* DONE x :tag:\n  :PROPERTIES:\n  :ID:       1\n  :END:\n"

    expect(translateOrg(org, { outputPreset: logseq() })).toBe(
      "#+title: P\n\n*\n** | a |\n| b |\n* 1. Which\n* DONE x :tag:\n  :PROPERTIES:\n  :ID:       1\n  :END:\n"
    )
  })

  it("names Logseq's task markers for Emacs in a #+TODO: line", () => {
    const org = "#+title: P\n#+tags: a\n\n* DOING x\n* TODO y\n"

    expect(translateOrg(org, { inputPreset: logseq() })).toBe(
      `#+title: P\n#+tags: a\n${TODO_LINE}\n\n* DOING x\n* TODO y\n`
    )
    expect(translateOrg("* TODO y\n", { inputPreset: logseq() })).toBe(
      "* TODO y\n"
    )
  })

  it("writes no #+TODO: line for markers the page declares", () => {
    const org = "#+SEQ_TODO: TODO STARTED(s) | DONE\n* STARTED x\n"

    expect(translateOrg(org, { inputPreset: logseq() })).toBe(org)
  })

  it("drops the #+TODO: line it writes for Logseq org", () => {
    const org = `#+title: P\n${TODO_LINE}\n\n* DOING x\n`

    expect(translateOrg(org, { outputPreset: logseq() })).toBe(
      "#+title: P\n\n* DOING x\n"
    )
  })

  it("keeps an own #+TODO: line, warning of markers Logseq shows as text", () => {
    const warnings: string[] = []
    const org =
      "#+TODO: TODO NEXT(n) | DONE\n#+seq_todo: WAIT | KILL\n* NEXT x\n"

    expect(
      translateOrg(org, {
        outputPreset: logseq(),
        onWarning: m => warnings.push(m)
      })
    ).toBe(org)
    expect(warnings).toEqual([
      "Logseq reads no #+TODO: line; it shows NEXT as text",
      "Logseq reads no #+TODO: line; it shows KILL as text"
    ])
  })

  it("folds a collapsed block for Emacs", () => {
    const org = "* a\n:PROPERTIES:\n:collapsed: true\n:END:\n** b\n"

    expect(translateOrg(org, { inputPreset: logseq() })).toBe(
      "* a\n:PROPERTIES:\n:VISIBILITY: folded\n:END:\n** b\n"
    )
  })

  it("collapses a folded block for Logseq, warning of other visibility", () => {
    const warnings: string[] = []
    const org =
      "* a\n  :properties:\n  :Visibility: folded\n  :end:\n* b\n  :PROPERTIES:\n  :VISIBILITY: children\n  :END:\n"

    expect(
      translateOrg(org, {
        outputPreset: logseq(),
        onWarning: m => warnings.push(m)
      })
    ).toBe(
      "* a\n  :properties:\n  :collapsed: true\n  :end:\n* b\n  :PROPERTIES:\n  :VISIBILITY: children\n  :END:\n"
    )
    expect(warnings).toEqual([
      "Logseq has no VISIBILITY children; kept as a property"
    ])
  })

  it("keeps an empty page empty", () => {
    expect(translateOrg("", { inputPreset: logseq() })).toBe("")
  })

  it("points to normalizeOrg for one dialect on both sides", () => {
    expect(() => translateOrg("* a\n")).toThrow(
      "for 'vanilla' on both sides, use normalizeOrg"
    )
    expect(() => translateOrg("* a\n", { preset: logseq() })).toThrow(
      "for 'logseq' on both sides, use normalizeOrg"
    )
  })
})
