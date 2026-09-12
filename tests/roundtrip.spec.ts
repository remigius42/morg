import * as fs from "node:fs"
import * as path from "node:path"
import { describe, it, expect } from "vitest"
import { convertMarkdownToOrg } from "../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../src/orgToMarkdown.js"

// The core correctness guarantee (see ADR 0001): one round trip may
// normalize formatting, but its output must be a fixed point.
const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures")

const mdRoundTrip = (markdown: string): string =>
  convertOrgToMarkdown(convertMarkdownToOrg(markdown))

const orgRoundTrip = (org: string): string =>
  convertMarkdownToOrg(convertOrgToMarkdown(org))

const fixtures = fs.readdirSync(FIXTURES_DIR)

describe("round-trip convergence", () => {
  for (const name of fixtures.filter(f => f.endsWith(".md"))) {
    it(`md fixture ${name} converges after one round trip`, () => {
      const input = fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8")
      const once = mdRoundTrip(input)
      expect(mdRoundTrip(once)).toBe(once)
    })
  }

  for (const name of fixtures.filter(f => f.endsWith(".org"))) {
    it(`org fixture ${name} converges after one round trip`, () => {
      const input = fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8")
      const once = orgRoundTrip(input)
      expect(orgRoundTrip(once)).toBe(once)
    })
  }
})

describe("round-trip identity on canonical form", () => {
  it("canonical markdown is a round-trip identity", () => {
    const input = fs.readFileSync(path.join(FIXTURES_DIR, "simple.md"), "utf8")
    expect(mdRoundTrip(input)).toBe(input)
  })

  it("canonical org is a round-trip identity", () => {
    const input = fs.readFileSync(path.join(FIXTURES_DIR, "simple.org"), "utf8")
    expect(orgRoundTrip(input)).toBe(input)
  })
})

describe("useHtml", () => {
  it("html rendering of org-only markup converges", () => {
    const input =
      "Some _underlined_ H_{2}O and x^{2}.\n\n- apple :: a fruit\n- vim :: an editor\n"
    const roundTrip = (org: string): string =>
      convertMarkdownToOrg(convertOrgToMarkdown(org, { useHtml: true }))
    const once = roundTrip(input)
    expect(roundTrip(once)).toBe(once)
    expect(convertOrgToMarkdown(input, { useHtml: true })).toContain("<sup>")
  })

  it("interpretHtml is the inverse of useHtml (lossless round trip)", () => {
    const input =
      "Some _underlined_ H_{2}O and x^{2}.\n\n- apple :: a fruit\n- vim :: an editor\n"
    expect(
      convertMarkdownToOrg(convertOrgToMarkdown(input, { useHtml: true }), {
        interpretHtml: true
      })
    ).toBe(input)
  })

  it("keeps a drawer property named like an org-ism key", () => {
    const input = "* Head\n:PROPERTIES:\n:todo: something\n:END:\n"
    const once = orgRoundTrip(input)
    expect(once).toBe(input)
  })

  it("keeps every value of a repeated keyword", () => {
    const input = "#+AUTHOR: a\n#+AUTHOR: b\n\nBody.\n"
    // keywords canonicalize adjacent to the body; both values survive
    const once = orgRoundTrip(input)
    expect(once).toBe("#+AUTHOR: a\n#+AUTHOR: b\nBody.\n")
    expect(orgRoundTrip(once)).toBe(once)
  })

  it("keeps a multi-line frontmatter value out of the body", () => {
    const input = "---\ndesc: |\n  line1\n  line2\n---\n\nBody.\n"
    const once = mdRoundTrip(input)
    expect(once).toContain("line2")
    expect(once).not.toMatch(/line2\nBody\./)
    expect(mdRoundTrip(once)).toBe(once)
  })

  it("stays lossless when list terms contain html-special characters", () => {
    const input = "- a < b :: x & y\n"
    expect(
      convertMarkdownToOrg(convertOrgToMarkdown(input, { useHtml: true }), {
        interpretHtml: true
      })
    ).toBe(input)
  })
})

describe("markdownStyle", () => {
  it("custom style output is a fixed point (per-config convergence)", () => {
    const markdown = "Some *italic* and **bold** text.\n\n- item\n\n---\n"
    const style = { emphasis: "_", bullet: "*" } as const
    const roundTrip = (input: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(input), {
        markdownStyle: style
      })
    const once = roundTrip(markdown)
    expect(roundTrip(once)).toBe(once)
    expect(once).toContain("_italic_")
    expect(once).toContain("* item")
  })
})

describe("taskCheckboxes", () => {
  it("task checkbox output is a fixed point", () => {
    const org = "* TODO Buy milk\n* DONE Call mom\n\nAfter.\n"
    const md = convertOrgToMarkdown(org, { taskCheckboxes: true })
    const roundTrip = (input: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(input), {
        taskCheckboxes: true
      })
    expect(roundTrip(md)).toBe(md)
  })
})

describe("lists", () => {
  it("nested list survives a round trip", () => {
    const input = "- parent\n  - child\n"
    const once = mdRoundTrip(input)
    expect(mdRoundTrip(once)).toBe(once)
    expect(once).toContain("child")
  })

  it("ordered list keeps its numbering through a round trip", () => {
    const input = "1. one\n2. two\n3. three\n"
    const once = mdRoundTrip(input)
    expect(mdRoundTrip(once)).toBe(once)
    expect(convertMarkdownToOrg(input)).toBe("1. one\n2. two\n3. three\n")
  })
})
