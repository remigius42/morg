import { describe, it, expect } from "vitest"
import { convertMarkdownToOrg } from "../../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../../src/orgToMarkdown.js"
import { normalizeMarkdown, normalizeOrg } from "../../src/normalize.js"
import { logseq } from "../../src/presets/logseq.js"
import { obsidian } from "../../src/presets/obsidian.js"

describe("a preset per side", () => {
  it("should read the input in the input preset's dialect", () => {
    expect(
      convertMarkdownToOrg("[[Page|alias]]\n", { inputPreset: obsidian() })
    ).toBe("[[Page][alias]]\n")
  })

  it("should convert as one preset when both sides name it", () => {
    const org = "* a\n** b\n"

    expect(
      convertOrgToMarkdown(org, {
        inputPreset: logseq(),
        outputPreset: logseq()
      })
    ).toBe(convertOrgToMarkdown(org, { preset: logseq() }))
  })

  it("should reject a side preset with no dialect for its format", () => {
    expect(() =>
      convertOrgToMarkdown("a\n", { inputPreset: obsidian() })
    ).toThrow("Preset 'obsidian' has no org dialect to read the input in")
    expect(() =>
      convertMarkdownToOrg("a\n", { outputPreset: obsidian() })
    ).toThrow("Preset 'obsidian' has no org dialect to write the output in")
  })

  it("should reject a preset that conflicts with a side preset", () => {
    expect(() =>
      convertMarkdownToOrg("a\n", {
        preset: logseq(),
        inputPreset: obsidian()
      })
    ).toThrow("preset 'logseq' conflicts with inputPreset 'obsidian'")
    // the same preset named twice is no conflict
    expect(
      convertMarkdownToOrg("a\n", { preset: logseq(), outputPreset: logseq() })
    ).toBe(convertMarkdownToOrg("a\n", { preset: logseq() }))
  })

  it("should normalize in one dialect only", () => {
    const message =
      "normalize takes one preset; got inputPreset 'logseq' and outputPreset vanilla"
    expect(() => normalizeMarkdown("a\n", { inputPreset: logseq() })).toThrow(
      message
    )
    expect(() => normalizeOrg("a\n", { inputPreset: logseq() })).toThrow(
      message
    )
    expect(
      normalizeOrg("a\n", { inputPreset: logseq(), outputPreset: logseq() })
    ).toBe(normalizeOrg("a\n", { preset: logseq() }))
  })
})
