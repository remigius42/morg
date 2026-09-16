import { describe, expect, it } from "vitest"
import { convertMarkdownToOrg } from "../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../src/orgToMarkdown.js"
import { demoFor, MD_DEMO, ORG_DEMO } from "../web/src/demos.js"

// the demos are the first thing every visitor converts — pin that they
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
})
