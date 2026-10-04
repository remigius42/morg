import { describe, it, expect } from "vitest"
import { parseConfig } from "../src/config.js"

describe("parseConfig", () => {
  it("parses the full schema", () => {
    const toml = `
preset = "logseq"
silent = true

[orgismKeys]
todo = "state"
scheduled = "when"

[markdown]
definitionList = "html"

[markdown.input.interpretHtml]
underline = true

[markdown.output]
superscript = "html"
taskCheckboxes = true

[markdown.output.preserveOrgisms]
drawers = false

[markdown.output.style]
emphasis = "_"
bullet = "*"

[org.output]
recordMarkdownStyle = true

[org.output.preserveMdisms]
html = false
`

    expect(parseConfig(toml)).toEqual({
      preset: "logseq",
      silent: true,
      orgismKeys: { todo: "state", scheduled: "when" },
      markdown: {
        definitionList: "html",
        input: { interpretHtml: { underline: true } },
        output: {
          superscript: "html",
          taskCheckboxes: true,
          preserveOrgisms: { drawers: false },
          style: { emphasis: "_", bullet: "*" }
        }
      },
      org: {
        output: { recordMarkdownStyle: true, preserveMdisms: { html: false } }
      }
    })
  })

  it("names the sections that replaced the direction ones", () => {
    expect(() => parseConfig("[orgToMarkdown]\nuseHtml = true\n")).toThrow(
      "'orgToMarkdown' was replaced by [markdown] and [org] sections (ADR 0007)"
    )
    expect(() =>
      parseConfig("[markdownToOrg]\ninterpretHtml = true\n")
    ).toThrow(
      "'markdownToOrg' was replaced by [markdown] and [org] sections (ADR 0007)"
    )
  })

  it("rejects unknown keys and values in the format sections", () => {
    expect(() => parseConfig('[markdown]\ndefinitionLists = "html"\n')).toThrow(
      "Unknown config key: markdown.definitionLists"
    )
    expect(() => parseConfig('[markdown]\nunderline = "org"\n')).toThrow(
      `markdown.underline must be "markdown" or "html"`
    )
    expect(() =>
      parseConfig("[markdown.input.interpretHtml]\nunderline = 1\n")
    ).toThrow("markdown.input.interpretHtml.underline must be true or false")
    expect(() => parseConfig("[org.input]\nx = 1\n")).toThrow(
      "Unknown config key: org.input"
    )
  })

  it("parses a preset per side", () => {
    expect(
      parseConfig('inputPreset = "logseq"\noutputPreset = "vanilla"\n')
    ).toEqual({ inputPreset: "logseq", outputPreset: "vanilla" })
  })

  it("returns an empty config for an empty file", () => {
    expect(parseConfig("")).toEqual({})
  })

  it("rejects unknown top-level keys", () => {
    expect(() => parseConfig("bogus_option = true\n")).toThrow(
      /unknown config key/i
    )
  })
})
