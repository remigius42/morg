import { describe, it, expect } from "vitest"
import { translateOrg } from "../src/translate.js"
import { logseq } from "../src/presets/logseq.js"

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
