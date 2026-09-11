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

[markdownToOrg]
interpretHtml = true

[markdownToOrg.preserveMdisms]
html = false

[orgToMarkdown]
useHtml = true
taskCheckboxes = true

[orgToMarkdown.markdownStyle]
emphasis = "_"
bullet = "*"
`

    expect(parseConfig(toml)).toEqual({
      preset: "logseq",
      silent: true,
      orgismKeys: { todo: "state", scheduled: "when" },
      markdownToOrg: { interpretHtml: true, preserveMdisms: { html: false } },
      orgToMarkdown: {
        useHtml: true,
        taskCheckboxes: true,
        markdownStyle: { emphasis: "_", bullet: "*" }
      }
    })
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
