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

describe("recordStyle", () => {
  it("leaves a non-canonical but consistent document untouched", () => {
    const markdown = "* item one\n* item two\n"

    expect(
      convertOrgToMarkdown(
        convertMarkdownToOrg(markdown, { recordStyle: true })
      )
    ).toBe(markdown)
  })

  it("converges in both directions with a recorded style", () => {
    const markdown =
      "_italic_ and __bold__\n\n* item\n\n~~~js\ncode()\n~~~\n\n***\n"
    const mdRoundTrip = (input: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(input, { recordStyle: true }))
    const orgRoundTrip = (input: string): string =>
      convertMarkdownToOrg(convertOrgToMarkdown(input), { recordStyle: true })

    const md = mdRoundTrip(markdown)
    expect(mdRoundTrip(md)).toBe(md)
    const org = orgRoundTrip(convertMarkdownToOrg(markdown))
    expect(orgRoundTrip(org)).toBe(org)
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

describe("braced scripts", () => {
  it("bare underscores survive both round trips", () => {
    // remark's canonical form escapes underscores inside words
    expect(mdRoundTrip("see a\\_b\\_c\n")).toBe("see a\\_b\\_c\n")
    const org = "#+OPTIONS: toc:nil ^:{}\nsee a_b_c\n"
    expect(orgRoundTrip(org)).toBe(org)
  })

  it("an author's own ^:{} survives in markdown", () => {
    const markdown = "---\noptions: ^:{}\n---\n\ntext\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })
})

describe("inline code edge whitespace", () => {
  it("stays inside bold at the start of a line", () => {
    const once = mdRoundTrip("**` x`** rest\n")
    expect(once).toBe("**`x`** rest\n")
    expect(mdRoundTrip(once)).toBe(once)
  })

  it("converges once the whitespace sits outside the code", () => {
    const once = mdRoundTrip("a ``x` `` b\n")
    // remark pads both ends of code that ends in a backtick
    expect(once).toBe("a `` x` ``  b\n")
    expect(mdRoundTrip(once)).toBe(once)
  })
})

describe("literal org markers", () => {
  it("stay literal next to markup", () => {
    // the zero-width space separating the markup is a valid boundary
    const markdown = "**a**/b/ c, /b/**a** c, a *b*+c+ d and a **b**=c= d\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })
})

describe("org line syntax in paragraph text", () => {
  it("stays text through a round trip", () => {
    const markdown = "\\* a\n1\\. b\n\\- c\n\\# d\n\\| e |\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("stays text inside a list item", () => {
    const markdown = "- a\n  1\\. b\n  \\# c\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("follows the label in a footnote definition, unescaped", () => {
    // org reads `[fn:1] 1. a` as a paragraph; only lines below it start
    const markdown = "a[^1]\n\n[^1]: 1\\. b\n    2\\. c\n"
    expect(convertMarkdownToOrg(markdown)).toBe(
      "a[fn:1]\n\n[fn:1] 1. b\n\u200B2. c\n"
    )
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("stays text when the line starts with, or spans, another node", () => {
    // the code's edge whitespace moves outside it
    expect(mdRoundTrip("[^1] a\n\n\\*` x`\n\n[^1]: n\n")).toBe(
      "[^1] a\n\n\\* `x`\n\n[^1]: n\n"
    )
  })

  it("stays text after a nested list or code block in a list item", () => {
    const afterList = "- a\n  - b\n\n  1\\. c\n"
    expect(convertMarkdownToOrg(afterList)).toBe("- a\n  - b\n  \u200B1. c\n")
    const afterCode = "- a\n\n  ```\n  x\n  ```\n\n  1\\. c\n"
    expect(convertMarkdownToOrg(afterCode)).toContain("\n  \u200B1. c\n")
  })
})

describe("relative links", () => {
  it("keep # and % in org file paths and search options", () => {
    const org = "[[file:C# notes.md::100% done][x]]\n"
    expect(convertOrgToMarkdown(org)).toBe(
      "[x](C%23%20notes.md#100%25%20done)\n"
    )
    expect(orgRoundTrip(org)).toBe(org)
  })

  it("keep percent escapes of # and % in markdown urls", () => {
    const markdown = "[x](C%23.md) and [y](a%2520b.md)\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("survive as markdown links", () => {
    const markdown = "[t](a%20b.md#My%20H), [f](f.md) and ![a](i.png)\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })
})

describe("normalizations", () => {
  it("underscores inside words get escaped (remark's canonical form)", () => {
    expect(mdRoundTrip("see a_b\n")).toBe("see a\\_b\n")
  })

  it("org verbatim becomes code (md has one inline code)", () => {
    expect(orgRoundTrip("Use =bar= here.\n")).toBe("Use ~bar~ here.\n")
  })
})
