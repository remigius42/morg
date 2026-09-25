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

  it("keeps item text after a nested list out of the nested list", () => {
    // without the blank line, md reads `c` as a lazy continuation of `b`
    const markdown = "- a\n  - b\n\n  c\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
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

  it("^:nil keeps underscores and carets text, and stays", () => {
    const org = "#+OPTIONS: ^:nil\na_b and x^{2}\n"
    expect(convertOrgToMarkdown(org)).toBe(
      "---\noptions: ^:nil\n---\n\na\\_b and x^{2}\n"
    )
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

describe("inline code holding a tilde", () => {
  it("becomes org verbatim where a tilde would end the code", () => {
    const markdown = "`a~ b` and `~/x`\n"
    expect(convertMarkdownToOrg(markdown)).toBe("=a~ b= and ~~/x~\n")
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })
})

describe("a pipe in a table cell", () => {
  it("stays in its cell through a round trip", () => {
    const markdown = "| a          |\n| ---------- |\n| x \\| *y\\|* |\n"
    expect(convertMarkdownToOrg(markdown)).toBe(
      "| a |\n|-|\n| x \\vert{} /y\\vert{}/ |\n"
    )
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })
})

describe("literal org markers", () => {
  it("stay literal next to markup", () => {
    // the zero-width space separating the markup is a valid boundary
    const markdown = "**a**/b/ c, /b/**a** c, a *b*+c+ d and a **b**=c= d\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })
})

describe("verbatim passthrough", () => {
  it("keeps org line syntax org through a round trip", () => {
    for (const org of [
      ": fixed one\n: fixed two\n",
      "* H\n:LOGBOOK:\nx\n:END:\n",
      "CLOCK: [2026-01-01 Thu 10:00]\n"
    ]) {
      expect(orgRoundTrip(org)).toBe(org)
    }
  })

  it("is no line of a paragraph's or list item's text", () => {
    expect(convertMarkdownToOrg("- a\n  : b\n\nc\n: d\n")).toBe(
      "- a\n  \u200B: b\nc\n\u200B: d\n"
    )
  })
})

describe("org line syntax in paragraph text", () => {
  it("stays text through a round trip", () => {
    const markdown = "\\* a\n1\\. b\n\\- c\n\\# d\n\\| e |\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("stays text when a bullet ends the line", () => {
    const markdown = "a\n1.\nb\n"
    expect(convertMarkdownToOrg(markdown)).toBe("a\n\u200B1.\nb\n")
    // remark escapes the bullet
    expect(mdRoundTrip(markdown)).toBe("a\n1\\.\nb\n")
  })

  it("stays text when uniorg fails to read an underscore bullet", () => {
    // uniorg throws on `_.` and `_)` bullets; org has none
    const markdown = "_.\na::).\n"
    expect(convertMarkdownToOrg(markdown)).toBe("\u200B_.\na::).\n")
    const once = mdRoundTrip(markdown)
    expect(once).toBe("\\_.\na::).\n")
    expect(mdRoundTrip(once)).toBe(once)
  })

  it("stays text when it spans several lines", () => {
    const markdown = "\\#+begin_src\nx\n\\#+end_src\n"
    // `n_s` is a bare underscore once no src block
    expect(convertMarkdownToOrg(markdown)).toBe(
      "#+OPTIONS: ^:{}\n\u200B#+begin_src\nx\n#+end_src\n"
    )
    const once = mdRoundTrip(markdown)
    expect(once).toBe("\\#+begin\\_src\nx\n\\#+end\\_src\n")
    expect(mdRoundTrip(once)).toBe(once)
    const math = "\\begin{equation}\nx\n\\end{equation}\n"
    expect(convertMarkdownToOrg(math)).toBe(
      "\u200B\\begin{equation}\nx\n\\end{equation}\n"
    )
  })

  it("stays text where it depends on the headline above", () => {
    const markdown =
      "# H\n\nSCHEDULED: <2026-01-01 Thu>\n\n# I\n\n:PROPERTIES:\n:END:\n"
    expect(convertMarkdownToOrg(markdown)).toBe(
      "* H\n\u200BSCHEDULED: <2026-01-01 Thu>\n\n* I\n:PROPERTIES:\n\u200B:END:\n"
    )
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("stays text inside a list item", () => {
    const markdown = "- a\n  1\\. b\n  \\# c\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("stays text when the line starts inside markup or a link", () => {
    expect(convertMarkdownToOrg("**a\n\\# b**\n")).toBe("*a\n\u200B# b*\n")
    const markdown =
      "**a\n\\- b**, *a\n2\\. b* and [a\n2\\. b](https://x.com)\n"
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

describe("literal footnote references", () => {
  it("stay text through a round trip", () => {
    const markdown = "a\n\\[fn:1] b, \\[fn::c] d\n"
    expect(convertMarkdownToOrg(markdown)).toBe(
      "a\n[\u200Bfn:1] b, [\u200Bfn::c] d\n"
    )
    expect(mdRoundTrip(markdown)).toBe(markdown)
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

  it("keep literal %5B, %5D and :: in paths", () => {
    // org reads those as morg's bracket escapes and the search option
    const markdown =
      "[x](a%255B.md), [y](a%255D.md#b%255B), [z](a%3A%3Ab.md) and [w](a%3A#b)\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
    const once = convertMarkdownToOrg(markdown)
    expect(convertMarkdownToOrg(convertOrgToMarkdown(once))).toBe(once)
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
