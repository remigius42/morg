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
