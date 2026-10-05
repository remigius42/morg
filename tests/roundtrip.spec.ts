import * as fs from "node:fs"
import * as path from "node:path"
import { describe, it, expect } from "vitest"
import { parse as parseYaml } from "yaml"
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

describe("frontmatter (ADR 0005)", () => {
  const fixture = (name: string): string =>
    fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8")

  for (const name of ["frontmatter.md", "frontmatter-structured.md"]) {
    it(`${name} keeps its frontmatter verbatim through org`, () => {
      const input = fixture(name)
      expect(mdRoundTrip(input)).toBe(input)
    })
  }

  it("native org keywords come back as keywords", () => {
    const input = fixture("keywords.org")
    const markdown = convertOrgToMarkdown(input)
    expect(markdown).toContain("  - STARTUP: overview\n")
    expect(convertMarkdownToOrg(markdown)).toBe(input.replace("\n\n*", "\n*"))
  })

  it("every keyword and property key uniorg reads comes back", () => {
    for (const org of [
      ":PROPERTIES:\n:ID: 1\n:header-args:python: :session *py*\n:END:\n#+TITLE: t\nbody\n",
      "#+TITLE: t\n#+FOO[BAR: x\n#+A[B]C: y\n#+END_DATE: z\nbody\n"
    ]) {
      expect(orgRoundTrip(org)).toBe(org)
    }
  })

  it("keywords come back next to one whose key ends in a colon", () => {
    // uniorg reads `#+foo:: bar` as the key FOO:, the value bar
    expect(orgRoundTrip("#+title: X\n#+foo:: bar\n\ntext\n")).toBe(
      "#+TITLE: X\n#+FOO:: bar\ntext\n"
    )
  })

  it("an affiliated key ending in a colon stays a document keyword", () => {
    // org reads `#+NAME:: x` as NAME, which would attach to the table
    for (const key of ["NAME:", "RESULTS:"]) {
      const markdown = `---\nmorg_keywords:\n  - "${key}": x\n---\n\n| a |\n| - |\n`
      expect(mdRoundTrip(markdown)).toBe(markdown)
    }
  })

  it("keywords on the block come back apart from it", () => {
    // nothing reads keywords on a comment block
    const org =
      "#+TITLE: t\n#+NAME: n\n#+CAPTION[s]: c\n#+begin_comment morg_frontmatter\na: 1\n#+end_comment\nBody.\n"
    const warnings: string[] = []
    convertOrgToMarkdown(org, { onWarning: m => warnings.push(m) })
    expect(warnings).toContain(
      "keywords on the frontmatter block come back apart from it"
    )
    expect(orgRoundTrip(org)).toBe(
      "#+TITLE: t\n#+NAME: n\n\n#+CAPTION[S]: c\n\n#+begin_comment morg_frontmatter\na: 1\n#+end_comment\nBody.\n"
    )
    const once = orgRoundTrip(org)
    expect(orgRoundTrip(once)).toBe(once)
  })

  it("only CAPTION and RESULTS keep a short value on the block", () => {
    // org reads no other keyword as dual, alias RESULT included: no
    // block, order kept
    for (const key of ["FOO", "RESULT"]) {
      expect(orgRoundTrip(`#+${key}[X]: y\n#+title: T\n\ntext\n`)).toBe(
        `#+${key}[X]: y\n#+TITLE: T\ntext\n`
      )
    }
  })

  it("a property named END stays in the frontmatter", () => {
    // `:END:` would close the drawer early
    const markdown =
      "---\nmorg_properties:\n  - END:\n  - ID: abc\n---\n\nbody\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("morg's entries stay in the frontmatter if one cannot restore", () => {
    for (const yaml of [
      'morg_properties:\n  - ID: abc\nmorg_keywords:\n  - TITLE: T\n  - "bad key": x',
      'morg_properties:\n  - "bad key": abc\nmorg_keywords:\n  - TITLE: T'
    ]) {
      const markdown = `---\n${yaml}\n---\n\ntext\n`
      expect(mdRoundTrip(markdown)).toBe(markdown)
    }
  })

  it("a -*- comment below the block converges", () => {
    // it leads the Markdown body, so becomes the mode line (warned)
    const once = orgRoundTrip(
      "#+begin_comment morg_frontmatter\na: 1\n#+end_comment\n# -*- mode: org -*-\n#+TITLE: t\n"
    )
    expect(orgRoundTrip(once)).toBe(once)
  })

  it("a -*- comment below a Markdown definition stays inert", () => {
    // Emacs reads file variables only from the first line
    const markdown =
      "---\na: 1\n---\n\n[ref]: https://x\n\n<!-- -*- eval: (foo) -*- -->\n"
    expect(convertMarkdownToOrg(markdown).startsWith("# -*-")).toBe(false)
  })

  it("an Emacs mode line below the keywords stays inert", () => {
    // Emacs reads file variables only from the first line
    const org = "#+TITLE: t\n# -*- mode: org; eval: (foo) -*-\nbody\n"
    expect(orgRoundTrip(org)).toBe(org)
  })

  it("keywords below a comment stay below it", () => {
    for (const org of [
      "# hello\n#+TITLE: x\nBody\n",
      "# -*- mode: org -*-\n# hello\n#+TITLE: x\nBody\n"
    ]) {
      expect(orgRoundTrip(org)).toBe(org)
    }
  })

  it("a keyword above a leading keyword survives", () => {
    // uniorg attaches #+NAME: to the keyword below it
    const org = "#+NAME: n\n#+TITLE: y\n\nBody\n"
    expect(orgRoundTrip(org)).toBe("#+NAME: n\n\n#+TITLE: y\nBody\n")
    // once only, below a comment too, where it stays a line
    for (const input of [org, "# hello\n#+CAPTION[s]: c\n#+TITLE: t\n"]) {
      const once = orgRoundTrip(input)
      expect(orgRoundTrip(once)).toBe(once)
    }
  })

  it("keywords on a block whose YAML takes none converge", () => {
    for (const org of [
      "#+NAME: n\n#+begin_comment morg_frontmatter\n- a\n#+end_comment\nbody\n",
      "#+TITLE: t\n#+CAPTION[s]: c\n#+begin_comment morg_frontmatter\n- a\n#+end_comment\nbody\n"
    ]) {
      const once = orgRoundTrip(org)
      expect(orgRoundTrip(once)).toBe(once)
    }
  })

  it("keywords and the block together survive both ways", () => {
    const org =
      "#+STARTUP: overview\n#+begin_comment morg_frontmatter\ntitle: x\n#+end_comment\nBody.\n"
    expect(orgRoundTrip(org)).toBe(org)
    const markdown = convertOrgToMarkdown(org)
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("a 0.6.0 file keeps its keywords as org-native keywords", () => {
    const input = fixture("legacy-keywords.org")
    expect(convertOrgToMarkdown(input)).toBe(
      '---\nmorg_keywords:\n  - TITLE: A Note\n  - AUTHOR: Someone\n  - TAGS: one\n  - TAGS: two\n  - DRAFT: "true"\n  - META: \'{"a":1}\'\n  - DESC: \'"line1\\nline2\\n"\'\n---\n\n# Heading\n\nBody text.\n'
    )
    expect(orgRoundTrip(input)).toBe(input)
  })

  it("an empty or non-mapping frontmatter survives", () => {
    for (const input of [
      "---\n---\n\nBody.\n",
      "---\n- a\n- b\n---\n\nBody.\n"
    ]) {
      expect(mdRoundTrip(input)).toBe(input)
    }
  })

  it("a recorded style leads the block and is consumed before it", () => {
    const input = "---\ntitle: x\n---\n\n* a\n* b\n"
    const org = convertMarkdownToOrg(input, { recordMarkdownStyle: true })
    expect(org).toMatch(/^#\+MORG_MARKDOWN_STYLE: .*\n#\+begin_comment/)
    expect(convertOrgToMarkdown(org)).toBe(input)
  })

  it("a leading keyword org would attach to the next element stays apart", () => {
    // #+CAPTION, #+NAME (and #+SOURCE, an alias) directly above an
    // element are its affiliated keywords; a blank line keeps them not
    for (const org of [
      "#+CAPTION: x\n\nPara\n",
      "#+SOURCE: x\n\n#+begin_comment morg_frontmatter\ntitle: x\n#+end_comment\nPara\n"
    ]) {
      expect(orgRoundTrip(org)).toBe(org)
    }
  })

  it("frontmatter whose entries cannot be cut out stays whole", () => {
    // a flow mapping has no line per entry; an alias needs its anchor
    for (const input of [
      "---\n{morg_keywords: [{TITLE: x}], a: 1}\n---\n\nBody.\n",
      "---\nmorg_keywords:\n  - TITLE: &t x\nother: *t\n---\n\nBody.\n"
    ]) {
      expect(mdRoundTrip(input)).toBe(input)
    }
  })

  it("keywords next to an empty block join the frontmatter cleanly", () => {
    const org =
      "#+TITLE: t\n#+begin_comment morg_frontmatter\n#+end_comment\nBody.\n"
    expect(convertOrgToMarkdown(org)).toBe(
      "---\nmorg_keywords:\n  - TITLE: t\n---\n\nBody.\n"
    )
  })

  it("keywords stay keyword lines when the block's yaml cannot take them", () => {
    for (const yaml of [
      "- a\n- b",
      "{a: 1}",
      "a: 1\n...",
      "morg_keywords: not a list",
      "  a: 1\n  b: 2"
    ]) {
      const org = `#+TITLE: t\n#+begin_comment morg_frontmatter\n${yaml}\n#+end_comment\nBody.\n`
      const warnings: string[] = []
      const markdown = convertOrgToMarkdown(org, {
        onWarning: message => warnings.push(message)
      })

      expect(markdown).toContain(`---\n${yaml}\n---\n`)
      expect(convertMarkdownToOrg(markdown)).toContain("#+TITLE: t\n")
      expect(warnings).toHaveLength(1)
      expect(orgRoundTrip(orgRoundTrip(org))).toBe(orgRoundTrip(org))
    }
  })

  it("an org-roam file keeps its file-level property drawer", () => {
    // org reads the drawer as the file's only when it leads the file
    const org =
      ':PROPERTIES:\n:ID: abc-123\n:ROAM_ALIASES: "A b"\n:END:\n#+TITLE: x\nBody.\n'
    const markdown = convertOrgToMarkdown(org)

    expect(markdown).toBe(
      "---\nmorg_properties:\n  - ID: abc-123\n  - ROAM_ALIASES: '\"A b\"'\nmorg_keywords:\n  - TITLE: x\n---\n\nBody.\n"
    )
    expect(convertMarkdownToOrg(markdown)).toBe(org)
    // keywords other passes put in front stay below it
    const styled = convertMarkdownToOrg(
      markdown.replace("Body.", "* a_b\n* c"),
      { recordMarkdownStyle: true }
    )
    expect(styled).toMatch(/^:PROPERTIES:\n:ID: abc-123\n/)
    expect(styled).toContain("#+MORG_MARKDOWN_STYLE:")
    expect(styled).toContain("#+OPTIONS: ^:{}")
  })

  it("an Emacs mode line stays on the first line", () => {
    const org =
      "# -*- mode: org; coding: utf-8 -*-\n:PROPERTIES:\n:ID: abc\n:END:\n#+TITLE: x\n#+begin_comment morg_frontmatter\na: 1\n#+end_comment\nBody.\n"
    const markdown = convertOrgToMarkdown(org)

    expect(markdown).toBe(
      "---\na: 1\nmorg_properties:\n  - ID: abc\nmorg_keywords:\n  - TITLE: x\n---\n\n<!-- -*- mode: org; coding: utf-8 -*- -->\n\nBody.\n"
    )
    expect(convertMarkdownToOrg(markdown)).toBe(org)
    // only as the first thing below the frontmatter
    expect(convertMarkdownToOrg("Intro.\n\n<!-- -*- x -*- -->\n")).toBe(
      "Intro.\n\n# -*- x -*-\n"
    )
  })

  it("long keyword and property values survive", () => {
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ")
    const org = `:PROPERTIES:\n:ROAM_REFS: ${long}\n:END:\n#+TITLE: ${long}\nBody.\n`
    expect(orgRoundTrip(org)).toBe(org)
  })

  it("keywords join a frontmatter that is only comments", () => {
    const org =
      "#+TITLE: t\n#+begin_comment morg_frontmatter\n# just a note\n#+end_comment\nBody.\n"
    expect(convertOrgToMarkdown(org)).toBe(
      "---\n# just a note\nmorg_keywords:\n  - TITLE: t\n---\n\nBody.\n"
    )
    expect(orgRoundTrip(org)).toBe(org)
  })

  it("any keyword name org reads survives, leading or mid-file", () => {
    for (const org of [
      "#+TITLE: x\n#+_DRAFT: y\n#+1ST: z\nBody.\n",
      "* H\n#+FOO:BAR: x\n"
    ]) {
      expect(orgRoundTrip(org)).toBe(org)
    }
  })

  it("cutting entries keeps a keep-chomped scalar's trailing lines", () => {
    const markdown =
      "---\na: |+\n  text\n\nmorg_keywords:\n  - TITLE: x\n---\n\nBody.\n"
    const org = convertMarkdownToOrg(markdown)
    expect(org).toContain("a: |+\n  text\n\n\n#+end_comment")
    const back = convertOrgToMarkdown(org)
    expect(mdRoundTrip(back)).toBe(back)
    const yaml = /^---\n([\s\S]*?)\n---/.exec(back)?.[1]
    expect(parseYaml(yaml ?? "")).toEqual({
      a: "text\n\n",
      morg_keywords: [{ TITLE: "x" }]
    })
  })

  it("an empty keyword or property comes back without quotes", () => {
    const markdown =
      "---\nmorg_properties:\n  - ID:\nmorg_keywords:\n  - TITLE:\n---\n\nBody.\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("a cut above a keep-chomped scalar keeps its trailing lines", () => {
    const markdown =
      "---\nmorg_keywords:\n  - TITLE: x\na: |+\n  text\n\n---\n\nBody.\n"
    const org = convertMarkdownToOrg(markdown)
    expect(org).toContain("a: |+\n  text\n\n#+end_comment")
  })

  it("a block that is not morg's stays a comment block", () => {
    const org = "#+begin_comment\ntitle: x\n#+end_comment\nBody.\n"
    expect(convertOrgToMarkdown(org)).not.toContain("---")
  })
})

describe("headline properties", () => {
  it("an empty property keeps its drawer", () => {
    const org =
      "* Meeting\n:PROPERTIES:\n:room:\n:custom_id: mtg\n:END:\nNotes.\n"
    expect(orgRoundTrip(org)).toBe(org)
    expect(convertOrgToMarkdown(org)).toContain("\nroom::\n")
  })
})

describe("affiliated keywords", () => {
  it("keep a dual value on a body element", () => {
    const org =
      "#+CAPTION[Short One]: Long\n#+begin_src js\nx\n#+end_src\n#+RESULTS[abc123]: r\n#+begin_example\ny\n#+end_example\n"
    expect(convertOrgToMarkdown(org)).toContain("#+CAPTION[Short One]: Long\n")
    expect(orgRoundTrip(org)).toBe(org)
  })

  it("stay on their element in CRLF Markdown", () => {
    expect(
      convertMarkdownToOrg("#+NAME: n\r\n#+CAPTION: c\r\n| a |\r\n| - |\r\n")
    ).toBe("#+NAME: n\n#+CAPTION: c\n| a |\n|-|\n")
  })

  it("keep links and markup in a caption on the frontmatter block", () => {
    const org =
      "#+CAPTION: see [[https://x.org][the *site*]] now\n#+begin_comment morg_frontmatter\n#+end_comment\nBody.\n"
    expect(convertOrgToMarkdown(org)).toContain(
      "CAPTION: see [[https://x.org][the *site*]] now\n"
    )
  })
})

describe("html spelling", () => {
  it("html rendering of org-only markup converges", () => {
    const input =
      "Some _underlined_ H_{2}O and x^{2}.\n\n- apple :: a fruit\n- vim :: an editor\n"
    const roundTrip = (org: string): string =>
      convertMarkdownToOrg(convertOrgToMarkdown(org, { spelling: "html" }))
    const once = roundTrip(input)
    expect(roundTrip(once)).toBe(once)
    expect(convertOrgToMarkdown(input, { spelling: "html" })).toContain("<sup>")
  })

  it("interpretHtml is the inverse of the html spelling (lossless round trip)", () => {
    const input =
      "Some _underlined_ H_{2}O and x^{2}.\n\n- apple :: a fruit\n- vim :: an editor\n"
    expect(
      convertMarkdownToOrg(convertOrgToMarkdown(input, { spelling: "html" }), {
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

  it("reads a sized image back from its html spelling", () => {
    const input =
      "#+CAPTION: c\n#+ATTR_HTML: :width 300\n[[file:img.png][alt]]\n\n" +
      "- x\n  #+ATTR_HTML: :height 2\n  [[file:b.png]]\n" +
      "-\n  #+ATTR_HTML: :width 3\n  [[file:c.png]]\n"
    expect(
      convertMarkdownToOrg(convertOrgToMarkdown(input, { spelling: "html" }), {
        interpretHtml: true
      })
    ).toBe(input)
  })

  it("reads a sized image in a definition back from its html spelling", () => {
    for (const input of [
      "- term :: text\n  #+ATTR_HTML: :width 300\n  [[file:a.png]]\n",
      "- term ::\n  #+ATTR_HTML: :width 300\n  [[file:a.png]]\n"
    ]) {
      expect(
        convertMarkdownToOrg(
          convertOrgToMarkdown(input, { spelling: { images: "html" } }),
          { interpretHtml: { images: true } }
        )
      ).toBe(input)
    }
  })

  it("stays lossless when list terms contain html-special characters", () => {
    const input = "- a < b :: x & y\n"
    expect(
      convertMarkdownToOrg(convertOrgToMarkdown(input, { spelling: "html" }), {
        interpretHtml: true
      })
    ).toBe(input)
  })
})

describe("style", () => {
  it("custom style output is a fixed point (per-config convergence)", () => {
    const markdown = "Some *italic* and **bold** text.\n\n- item\n\n---\n"
    const style = { emphasis: "_", bullet: "*" } as const
    const roundTrip = (input: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(input), {
        style: style
      })
    const once = roundTrip(markdown)
    expect(roundTrip(once)).toBe(once)
    expect(once).toContain("_italic_")
    expect(once).toContain("* item")
  })
})

describe("recordMarkdownStyle", () => {
  it("leaves a non-canonical but consistent document untouched", () => {
    const markdown = "* item one\n* item two\n"

    expect(
      convertOrgToMarkdown(
        convertMarkdownToOrg(markdown, { recordMarkdownStyle: true })
      )
    ).toBe(markdown)
  })

  it("converges in both directions with a recorded style", () => {
    const markdown =
      "_italic_ and __bold__\n\n* item\n\n~~~js\ncode()\n~~~\n\n***\n"
    const mdRoundTrip = (input: string): string =>
      convertOrgToMarkdown(
        convertMarkdownToOrg(input, { recordMarkdownStyle: true })
      )
    const orgRoundTrip = (input: string): string =>
      convertMarkdownToOrg(convertOrgToMarkdown(input), {
        recordMarkdownStyle: true
      })

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

  it("keeps code in a list item as indented as it was", () => {
    const markdown = "- a\n  ```py\n  if x:\n      y()\n  ```\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
    // the item comes back tight: org has no loose items
    expect(mdRoundTrip(markdown.replace("a\n", "a\n\n"))).toBe(markdown)
    // outside a list item, the code's own indentation is all there is
    const indented = "```yaml\n    - a\n      b\n```\n"
    expect(mdRoundTrip(indented)).toBe(indented)
  })

  it("ordered list keeps its numbering through a round trip", () => {
    const input = "1. one\n2. two\n3. three\n"
    const once = mdRoundTrip(input)
    expect(mdRoundTrip(once)).toBe(once)
    expect(convertMarkdownToOrg(input)).toBe("1. one\n2. two\n3. three\n")
  })

  it("ordered list starting at zero keeps its start", () => {
    const markdown = "0. zero\n1. one\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("hard break in a list item adds no leading whitespace", () => {
    const markdown = "- a\n  - b\\\n    c\n"
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })
})

describe("a descriptive list no definition list can hold (ADR 0007 §3)", () => {
  const MARKER = "<!-- morg_descriptive_list -->\n\n"

  it("goes through below a marker", () => {
    for (const org of [
      "- [ ] term :: def\n- [X] b :: c\n",
      "- term :: def\n- plain item\n",
      "- plain item\n- term :: def\n",
      // Emacs reads a numbered list as one, terms or not
      "1. a :: b\n2. c :: d\n"
    ]) {
      expect(convertOrgToMarkdown(org)).toBe(MARKER + org.replace("[X]", "[x]"))
      expect(orgRoundTrip(org)).toBe(org)
    }
  })

  it("is read back from Markdown below a marker", () => {
    const markdown = `${MARKER}- [ ] term :: def\n- plain item\n`
    expect(convertMarkdownToOrg(markdown)).toBe(
      "- [ ] term :: def\n- plain item\n"
    )
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("goes through in a list item and a quote", () => {
    for (const org of [
      "- outer\n  - [ ] term :: def\n",
      "#+begin_quote\n- [ ] term :: def\n#+end_quote\n"
    ]) {
      expect(convertOrgToMarkdown(org)).toContain(MARKER.trim())
      expect(orgRoundTrip(org)).toBe(org)
    }
    for (const markdown of [
      "- outer\n\n  <!-- morg_descriptive_list -->\n  - [ ] term :: def\n",
      "> <!-- morg_descriptive_list -->\n> - [ ] term :: def\n"
    ]) {
      expect(convertMarkdownToOrg(markdown)).not.toContain("\u200B")
    }
  })

  it("reads a term on a line of its own onto its definition's", () => {
    // org reads both as one item; the term line org→md writes
    expect(convertMarkdownToOrg(`${MARKER}- [ ] *a* ::\n  b\n- c\n`)).toBe(
      "- [ ] /a/ :: b\n- c\n"
    )
    // a definition list in the item comes back as its text
    const org = "- a ::\n  - b :: c\n- [ ] d\n"
    const once = orgRoundTrip(org)
    expect(orgRoundTrip(once)).toBe(once)
  })

  it("leaves a marker without a list below an ordinary comment", () => {
    const markdown = `${MARKER}text\n`
    expect(convertMarkdownToOrg(markdown)).toBe(
      "# morg_descriptive_list\ntext\n"
    )
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("leaves an unmarked list below a marked one ordinary", () => {
    const markdown = `${MARKER}- a :: b\n\n<!-- -->\n\n- c :: d\n`
    expect(convertMarkdownToOrg(markdown)).toContain("- c \u200B:: d")
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
      "---\nmorg_keywords:\n  - OPTIONS: ^:nil\n---\n\na\\_b and x^{2}\n"
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

describe("a pipe in code in a table cell", () => {
  it("stays in its cell as a lookalike, with a warning", () => {
    // org has no escape inside ~code~: U+2223 stands in for the pipe
    const markdown =
      "| cmd            |\n| -------------- |\n| `ls \\| grep x` |\n"
    const warnings: string[] = []
    expect(
      convertMarkdownToOrg(markdown, { onWarning: m => warnings.push(m) })
    ).toBe("| cmd |\n|-|\n| ~ls \u2223 grep x~ |\n")
    expect(warnings).toEqual([
      "a | in code in a table cell becomes ∣ (U+2223) in org"
    ])
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
      "text\n\n: fixed below text\n",
      // inline math across lines keeps a Markdown escape (`\:`)
      ": cd $DIR\n: ls $DIR\n",
      "* H\n:LOGBOOK:\nx\n:END:\n",
      "CLOCK: [2026-01-01 Thu 10:00]\n"
    ]) {
      expect(orgRoundTrip(org)).toBe(org)
    }
  })

  it("loses a descriptive list nested in a list item (known limitation)", () => {
    // micromark-extension-definition-list reads no definition list
    // inside a list item; once it does, this keeps the nested list
    const org = "- a\n  - b :: c\n"

    expect(orgRoundTrip(org)).toBe("- a\n  b\n  \u200B:   c\n")
    expect(orgRoundTrip(orgRoundTrip(org))).toBe(orgRoundTrip(org))
  })

  it("keeps a descriptive list nested in a definition", () => {
    const org = "- a :: b\n  - nested :: x\n"

    expect(orgRoundTrip(org)).toBe(org)
  })

  it("keeps a list item's leading colon as written", () => {
    // MDN writes a definition as a nested `- : ` item; an item's first
    // line has no text above it, so no definition starts there
    const markdown = "- term\n  - : definition\n"

    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("is no line of a paragraph's or list item's text", () => {
    // escaped: unescaped, a `: ` line below text starts a definition
    expect(convertMarkdownToOrg("- a\n  \\: b\n\nc\n\\: d\n")).toBe(
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
    // the backslash escape leaves no LaTeX environment to escape
    expect(convertMarkdownToOrg(math)).toBe(
      "\\\u200Bbegin{equation}\nx\n\\\u200Bend{equation}\n"
    )
    expect(mdRoundTrip(math)).toBe(math)
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

describe("a literal backslash before a letter", () => {
  it("stays text through a round trip", () => {
    // org reads `\Users` as a LaTeX fragment, `\alpha` as an entity
    const markdown =
      "Path C:\\Users\\me, \\alpha, \\n and \\foo{x}\n\n| a        |\n| -------- |\n| C:\\Users |\n"
    expect(convertMarkdownToOrg(markdown)).toContain(
      "Path C:\\\u200BUsers\\\u200Bme, \\\u200Balpha, \\\u200Bn and \\\u200Bfoo{x}\n"
    )
    expect(mdRoundTrip(markdown)).toBe(markdown)
  })

  it("stays an entity or LaTeX fragment written in org", () => {
    const org = "\\alpha and \\foo{x}\n"
    expect(convertOrgToMarkdown(org)).toBe("α and $\\foo{x}$\n")
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
