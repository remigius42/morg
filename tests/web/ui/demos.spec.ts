import { describe, expect, it } from "vitest"
import { convertMarkdownToOrg } from "../../../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../../../src/orgToMarkdown.js"
import {
  demoFor,
  isDemo,
  LOGSEQ_MD_DEMO,
  LOGSEQ_ORG_DEMO,
  MD_DEMO,
  OBSIDIAN_MD_DEMO,
  ORG_DEMO
} from "../../../web/src/ui/demos.js"
import { logseq } from "../../../src/presets/logseq.js"
import { obsidian } from "../../../src/presets/obsidian.js"

// the demos are the first thing every visitor converts, so pin that they
// round-trip convergently and warning-free under default options
describe("demo documents", () => {
  it("offers the demo in the format the direction reads", () => {
    expect(demoFor("md-to-org")).toBe(MD_DEMO)
    expect(demoFor("normalize-md")).toBe(MD_DEMO)
    expect(demoFor("org-to-md")).toBe(ORG_DEMO)
    expect(demoFor("normalize-org")).toBe(ORG_DEMO)
  })

  it("org demo converges without warnings", () => {
    const warnings: string[] = []
    const onWarning = (message: string) => warnings.push(message)
    const md = convertOrgToMarkdown(ORG_DEMO, { onWarning })
    const org = convertMarkdownToOrg(md, { onWarning })
    expect(convertOrgToMarkdown(org, { onWarning })).toBe(md)
    expect(warnings).toEqual([])
  })

  it("md demo is canonical and converges without warnings", () => {
    const warnings: string[] = []
    const onWarning = (message: string) => warnings.push(message)
    const org = convertMarkdownToOrg(MD_DEMO, { onWarning })
    expect(convertOrgToMarkdown(org, { onWarning })).toBe(MD_DEMO)
    expect(warnings).toEqual([])
  })

  it("org and md demos are the same document", () => {
    // only the leading comment names its own format
    const body = (text: string) => text.replace(/^.*\n/, "")
    expect(body(convertOrgToMarkdown(ORG_DEMO))).toBe(body(MD_DEMO))
  })

  it("offers the logseq demos with the logseq preset", () => {
    expect(demoFor("md-to-org", "logseq")).toBe(LOGSEQ_MD_DEMO)
    expect(demoFor("org-to-md", "logseq")).toBe(LOGSEQ_ORG_DEMO)
    expect(demoFor("org-to-md", "obsidian")).toBe(ORG_DEMO)
    expect(isDemo(LOGSEQ_MD_DEMO)).toBe(true)
    expect(isDemo(`${ORG_DEMO} `)).toBe(false)
  })

  it("offers the obsidian demo for obsidian markdown", () => {
    expect(demoFor("md-to-org", "obsidian")).toBe(OBSIDIAN_MD_DEMO)
    expect(demoFor("normalize-md", "obsidian")).toBe(OBSIDIAN_MD_DEMO)
    expect(isDemo(OBSIDIAN_MD_DEMO)).toBe(true)
  })

  it("obsidian demo is canonical and converges without warnings", () => {
    const warnings: string[] = []
    const options = {
      preset: obsidian(),
      onWarning: (message: string) => warnings.push(message)
    }
    const org = convertMarkdownToOrg(OBSIDIAN_MD_DEMO, options)
    expect(convertOrgToMarkdown(org, options)).toBe(OBSIDIAN_MD_DEMO)
    expect(warnings).toEqual([])
  })

  it("logseq demos convert into each other without warnings", () => {
    const warnings: string[] = []
    const options = {
      preset: logseq(),
      onWarning: (message: string) => warnings.push(message)
    }
    // the same page; only the leading comment names its own format
    const header = (text: string) => text.replace(/^.*\n/, "")
    expect(header(convertOrgToMarkdown(LOGSEQ_ORG_DEMO, options))).toBe(
      header(LOGSEQ_MD_DEMO)
    )
    expect(header(convertMarkdownToOrg(LOGSEQ_MD_DEMO, options))).toBe(
      header(LOGSEQ_ORG_DEMO)
    )
    expect(warnings).toEqual([])
  })
})
