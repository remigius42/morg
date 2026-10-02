import { describe, it, expect } from "vitest"
import {
  applyLogseqSpecificsToUniorgAst,
  logseq
} from "../../src/presets/logseq.js"
import { convertMarkdownToOrg } from "../../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../../src/orgToMarkdown.js"
import type { OrgData, Headline, PropertyDrawer } from "uniorg"
import { parse as parseYaml } from "yaml"

describe("applyLogseqSpecificsToUniorgAst", () => {
  it("should add :PROPERTIES: drawer as a sibling to headlines", () => {
    const uniorgAst: OrgData = {
      type: "org-data",
      children: [
        {
          type: "headline",
          level: 1,
          children: [{ type: "text", value: "Hello World" }]
        } as Headline
      ],
      contentsBegin: 0,
      contentsEnd: 0
    }

    const result = applyLogseqSpecificsToUniorgAst(uniorgAst)

    // Expect the root's children to contain the headline, then the property drawer
    expect(result.children).toHaveLength(2) // Headline, PropertyDrawer

    const headline = result.children[0] as Headline
    const propertyDrawer = result.children[1] as PropertyDrawer

    expect(headline.type).toBe("headline")
    expect(headline.children).toEqual([{ type: "text", value: "Hello World" }])

    expect(propertyDrawer).toEqual({
      type: "property-drawer",
      children: [
        {
          type: "node-property",
          key: "heading",
          value: "1"
        }
      ],
      contentsBegin: 0,
      contentsEnd: 0
    })
  })
})

describe("logseq outline nesting", () => {
  const markdown = "# foo\n\nabc\n\n## bar\n\ndef\n\n### baz\n\ngamma\n"
  const logseqOrg =
    "* foo\n:PROPERTIES:\n:heading: 1\n:END:\n** abc\n** bar\n:PROPERTIES:\n:heading: 2\n:END:\n*** def\n*** baz\n:PROPERTIES:\n:heading: 3\n:END:\n**** gamma\n"

  it("nests content as child blocks under headings", () => {
    expect(convertMarkdownToOrg(markdown, { preset: logseq() })).toBe(logseqOrg)
  })

  it("extracts logseq outline org back to generic markdown", () => {
    expect(convertOrgToMarkdown(logseqOrg, { preset: logseq() })).toBe(markdown)
  })

  it("logseq round trip converges", () => {
    const roundTrip = (md: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(md, { preset: logseq() }), {
        preset: logseq()
      })
    const once = roundTrip(markdown)
    expect(roundTrip(once)).toBe(once)
  })

  it("keeps a block's lines that look like org syntax text", () => {
    // a block headline's title lines below the first are its body
    const org = convertMarkdownToOrg("a\n1\\. b\n", { preset: logseq() })
    expect(org).toBe("* a\n\u200B1. b\n")
    // the body comes back as a paragraph of its own
    expect(convertOrgToMarkdown(org, { preset: logseq() })).toBe(
      "a\n\n1\\. b\n"
    )
  })

  it("emits hiccup blocks unescaped in markdown", () => {
    const org =
      '* foo\n:PROPERTIES:\n:heading: 1\n:END:\n** [:div {:class "note"} "hi"]\n'

    expect(convertOrgToMarkdown(org, { preset: logseq() })).toBe(
      '# foo\n\n[:div {:class "note"} "hi"]\n'
    )
  })

  it("hiccup blocks survive a logseq round trip", () => {
    const markdown = '# foo\n\n[:div {:class "note"} "hi"]\n'
    const roundTrip = (md: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(md, { preset: logseq() }), {
        preset: logseq()
      })
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it("maps TODO/DONE text markers to org keywords and back", () => {
    const markdown = "# TODO Ship it\n\nTODO write tests\n\nDONE plan work\n"
    const logseqOrg =
      "* TODO Ship it\n:PROPERTIES:\n:heading: 1\n:END:\n** TODO write tests\n** DONE plan work\n"

    expect(convertMarkdownToOrg(markdown, { preset: logseq() })).toBe(logseqOrg)
    expect(convertOrgToMarkdown(logseqOrg, { preset: logseq() })).toBe(markdown)
  })

  it("keeps ^^highlight^^ markup intact", () => {
    const org =
      "* Head\n:PROPERTIES:\n:heading: 1\n:END:\n** Some ^^bright words^^ here.\n"

    expect(convertOrgToMarkdown(org, { preset: logseq() })).toBe(
      "# Head\n\nSome ^^bright words^^ here.\n"
    )
  })

  it("maps page references to wikilinks and labeled forms", () => {
    const org =
      "** See [[my page name]] and [[other page][a label]]\n** [[((60ab-uuid))][a block ref]]\n"

    expect(convertOrgToMarkdown(org, { preset: logseq() })).toBe(
      "See [[my page name]] and [a label]([[other page]])\n\n[a block ref](((60ab-uuid)))\n"
    )
  })

  it("restores labeled page references from markdown", () => {
    const markdown = "See [a label]([[other page]]) here.\n"

    expect(convertMarkdownToOrg(markdown, { preset: logseq() })).toBe(
      "* See [[other page][a label]] here.\n"
    )
  })

  it("maps priorities to [#A] text markers and back", () => {
    const org = "** TODO [#A] urgent thing\n"

    expect(convertOrgToMarkdown(org, { preset: logseq() })).toBe(
      "TODO [#A] urgent thing\n"
    )
    expect(
      convertMarkdownToOrg("TODO [#A] urgent thing\n", { preset: logseq() })
    ).toBe("* TODO [#A] urgent thing\n")
  })

  it("logseq syntax survives a full round trip", () => {
    const markdown =
      "# TODO [#B] Plan garden\n\nSee [[seed catalog]] and [notes]([[soil types]]).\n\nRefs: [context](((abc-123))) and ((abc-123)) inline.\n\nSome ^^bright words^^ here.\n\n{{embed [[seed catalog]]}}\n"
    const roundTrip = (md: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(md, { preset: logseq() }), {
        preset: logseq()
      })
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it("keeps org's element order around a planning line", () => {
    // planning must sit directly below the headline and org reads only
    // one property drawer, so :heading: has to join the existing one
    const markdown =
      "# Task\n\ntodo:: TODO\nscheduled:: <2026-01-01 Thu>\ncustom_id:: abc\n"

    expect(convertMarkdownToOrg(markdown, { preset: logseq() })).toBe(
      "* TODO Task\nSCHEDULED: <2026-01-01 Thu>\n:PROPERTIES:\n" +
        ":heading: 1\n:custom_id: abc\n:END:\n"
    )
  })

  it("still recognizes a heading whose drawer follows a planning line", () => {
    const org =
      "* Heading\nSCHEDULED: <2026-01-01 Thu>\n:PROPERTIES:\n:heading: 1\n:END:\n\nbody\n"

    expect(convertOrgToMarkdown(org, { preset: logseq() })).toBe(
      "# Heading\n\nscheduled:: <2026-01-01 Thu>\n\nbody\n"
    )
  })

  it("rewrites labeled page refs whose page name has no space", () => {
    // remark parses [label]([[soil]]) as a real link -- unlike
    // [[other page]], whose space makes it an invalid destination
    expect(
      convertMarkdownToOrg("See [label]([[soil]]) here.\n", {
        preset: logseq()
      })
    ).toBe("* See [[soil][label]] here.\n")
  })

  it("round-trips a single-word labeled page ref", () => {
    const markdown = "See [label]([[soil]]) here.\n"
    expect(
      convertOrgToMarkdown(
        convertMarkdownToOrg(markdown, { preset: logseq() }),
        {
          preset: logseq()
        }
      )
    ).toBe(markdown)
  })

  it("converges with a planning line and a drawer property", () => {
    const markdown =
      "# Task\n\ntodo:: TODO\nscheduled:: <2026-01-01 Thu>\ncustom_id:: abc\n"
    const roundTrip = (md: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(md, { preset: logseq() }), {
        preset: logseq()
      })
    const once = roundTrip(markdown)
    expect(roundTrip(once)).toBe(once)
  })

  it("keeps flat body content with nestUnderHeadings false", () => {
    expect(
      convertMarkdownToOrg("# foo\n\nabc\n", {
        preset: logseq({ nestUnderHeadings: false })
      })
    ).toBe("* foo\n:PROPERTIES:\n:heading: 1\n:END:\n\nabc\n")
  })
})

describe("logseq page properties", () => {
  const toOrg = (markdown: string): string =>
    convertMarkdownToOrg(markdown, { preset: logseq() })
  const toMd = (org: string): string =>
    convertOrgToMarkdown(org, { preset: logseq() })

  it("maps a first block of key:: lines to #+key: keywords", () => {
    expect(toOrg("title:: My Page\ntags:: a, [[b c]]\n\n- first block\n")).toBe(
      "#+title: My Page\n#+tags: a, [[b c]]\n- first block\n"
    )
  })
  it("maps leading #+key: keywords to a first block of key:: lines", () => {
    // Logseq reads only lower-case keys; uniorg upper-cases them
    expect(
      toMd("#+TITLE: My Page\n#+tags: a, [[b c]]\n\n- first block\n")
    ).toBe("title:: My Page\ntags:: a, [[b c]]\n\n- first block\n")
  })
  it("maps flat frontmatter entries to #+key: keywords", () => {
    // a sequence as Logseq writes it; what a keyword line cannot hold
    // (nested, multi-line, an item with a comma) stays in the block
    const markdown =
      '---\ntitle: My Page\ntags: [a, b]\nauthor:\n  name: X\ndesc: |\n  one\n  two\nodd: ["a, b"]\ndraft: true\n---\n\n- first block\n'

    expect(toOrg(markdown)).toBe(
      '#+title: My Page\n#+tags: a, b\n#+draft: true\n#+begin_comment morg_frontmatter\nauthor:\n  name: X\ndesc: |\n  one\n  two\nodd: ["a, b"]\n#+end_comment\n- first block\n'
    )
  })
  it("keeps page property values verbatim, urls and markup included", () => {
    const markdown =
      "source:: https://example.com/a_b\nalias:: snake_case, *bold*, `code`\n\n- b\n"
    const org = toOrg(markdown)

    expect(org).toBe(
      "#+source: https://example.com/a_b\n\n#+alias: snake_case, *bold*, `code`\n- b\n"
    )
    expect(toMd(org)).toBe(markdown)
  })
  it("page properties are a round-trip identity both ways", () => {
    expect(toMd(toOrg("title:: x\nend_date:: y\n\n- b\n"))).toBe(
      "title:: x\nend_date:: y\n\n- b\n"
    )
    const markdown = "title:: My Page\ntags:: a, b\n\n- first block\n"
    expect(toMd(toOrg(markdown))).toBe(markdown)
    const org = "#+title: My Page\n#+tags: a, b\n- first block\n"
    expect(toOrg(toMd(org))).toBe(org)
  })

  it("yaml frontmatter converges to a key:: block, the rest stays yaml", () => {
    const markdown =
      "---\ntitle: My Page\ntags: [a, b]\nauthor:\n  name: X\n---\n\n- first block\n"
    const once = toMd(toOrg(markdown))

    expect(once).toBe(
      "---\nauthor:\n  name: X\n---\n\ntitle:: My Page\ntags:: a, b\n\n- first block\n"
    )
    expect(toMd(toOrg(once))).toBe(once)
    expect(toOrg(once)).toBe(toOrg(markdown))
  })

  it("leaves key:: lines alone unless they are the page's first block", () => {
    expect(toOrg("Intro.\n\ntitle:: x\n")).not.toContain("#+title")
    expect(toOrg("title:: x\nnot a property\n")).not.toContain("#+title")
  })

  it("keeps an empty frontmatter as a block", () => {
    const markdown = "---\n---\n\n- b\n"
    expect(toOrg(markdown)).toBe(
      "#+begin_comment morg_frontmatter\n#+end_comment\n- b\n"
    )
    expect(toMd(toOrg(markdown))).toBe(markdown)
  })
  it("keeps frontmatter values as written", () => {
    expect(
      toOrg(
        "---\nversion: 1.10\nzip: 01234\nbig: 12345678901234567890\n---\n\n- b\n"
      )
    ).toBe("#+version: 1.10\n#+zip: 01234\n#+big: 12345678901234567890\n- b\n")
  })
  it("leaves entries a keyword line cannot hold in the block", () => {
    expect(
      toOrg('---\ntitle: x\nnote: "a\\rb"\nbegin_src: y\n---\n\n- b\n')
    ).toBe(
      '#+title: x\n#+begin_comment morg_frontmatter\nnote: "a\\rb"\nbegin_src: y\n#+end_comment\n- b\n'
    )
  })
  it("keeps flow-style or aliased frontmatter whole", () => {
    for (const yaml of ["{title: x, tags: [a, b]}", "base: &b x\nother: *b"]) {
      expect(toOrg(`---\n${yaml}\n---\n\n- b\n`)).toBe(
        `#+begin_comment morg_frontmatter\n${yaml}\n#+end_comment\n- b\n`
      )
    }
  })
  it("maps only frontmatter keys that come back as key:: lines", () => {
    // uniorg upper-cases keys and Logseq reads lower case: `Title` or
    // `größe` (upper-cased with SS) would not come back as written
    const yaml = ["foo.bar: x", "größe: 3", "Title: t"]
    const markdown = ["---", ...yaml, "---", "", "- b", ""].join("\n")
    expect(toOrg(markdown)).toBe(
      [
        "#+begin_comment morg_frontmatter",
        ...yaml,
        "#+end_comment",
        "- b",
        ""
      ].join("\n")
    )
    expect(toMd(toOrg(markdown))).toBe(markdown)
  })
  it("keeps a keep-chomped scalar's trailing lines above a cut", () => {
    const back = toMd(toOrg("---\na: |+\n  x\n\ntitle: t\n---\n\n- b\n"))
    const yaml = /^---\n([\s\S]*?)\n---/.exec(back)?.[1] ?? ""
    expect(parseYaml(yaml)).toEqual({ a: "x\n\n" })
  })
  it("keeps frontmatter keys that act in Emacs in the block", () => {
    // frontmatter is passive data; `tags` is Logseq's page tags
    const acting = [
      "todo: LATER",
      "include: /etc/passwd",
      "setupfile: https://x/y.org",
      "html_head: <script>",
      "call: f()",
      "bibliography: refs.bib",
      "cite_export: csl",
      "print_bibliography: t",
      "html: <script>",
      "latex: \\input{x}",
      "toc: headlines 2",
      "index: entry",
      "cindex: entry",
      "hugo_section: posts",
      "reveal_extra_scripts: x.js",
      "md_toplevel_hlevel: 2",
      "icalendar_timezone: UTC",
      "infojs_opt: view:info",
      "markdown: <script>",
      "lco: letter",
      "begin: 2024-01-01",
      "end: 2024-01-02"
    ]
    expect(
      toOrg(["---", "tags: [a]", ...acting, "---", "", "- b", ""].join("\n"))
    ).toBe(
      [
        "#+tags: a",
        "#+begin_comment morg_frontmatter",
        ...acting,
        "#+end_comment",
        "- b",
        ""
      ].join("\n")
    )
  })

  it("maps an org page's own acting keywords back as keywords", () => {
    const org = "#+startup: overview\n#+todo: LATER DONE\n- b\n"
    expect(toOrg(toMd(org))).toBe(org)
  })
  it("takes only a key:: block whose source is plain key:: lines", () => {
    for (const markdown of ["[title](x):: y\n\n- b\n", "**k**:: v\n\n- b\n"]) {
      expect(toOrg(markdown)).not.toMatch(/^#\+/)
    }
  })

  it("maps an empty page property and CRLF line endings", () => {
    expect(toOrg("title:: x\ntags::\n\n- b\n")).toBe(
      "#+title: x\n#+tags:\n- b\n"
    )
    expect(toMd("#+title: x\n#+tags:\n- b\n")).toBe(
      "title:: x\ntags::\n\n- b\n"
    )
    expect(toOrg("title:: x\r\ntags:: a\r\n\r\n- b\r\n")).toBe(
      "#+title: x\n#+tags: a\n- b\n"
    )
  })
  it("cuts whole entries, key properties included", () => {
    for (const yaml of [
      "? a\n: 1\nb: 2",
      "&x a: 1\nb: 2",
      "!!str a: 1\nb: 2"
    ]) {
      expect(toOrg(`---\n${yaml}\n---\n\n- c\n`)).toBe("#+a: 1\n#+b: 2\n- c\n")
    }
  })

  it("keeps frontmatter with YAML errors whole", () => {
    const yaml = 'a: 1\nb: "open\nc: 2'
    expect(toOrg(`---\n${yaml}\n---\n\n- c\n`)).toBe(
      `#+begin_comment morg_frontmatter\n${yaml}\n#+end_comment\n- c\n`
    )
  })
  it("finds the key:: block below a drawer or a mode line", () => {
    expect(
      toOrg("---\nmorg_properties:\n  - ID: abc\n---\n\nfoo:: bar\n\n- b\n")
    ).toBe(":PROPERTIES:\n:ID: abc\n:END:\n#+foo: bar\n- b\n")
    expect(toOrg("<!-- -*- mode: org -*- -->\n\nfoo:: bar\n\n- b\n")).toBe(
      "# -*- mode: org -*-\n#+foo: bar\n- b\n"
    )
  })

  it("leaves a key:: block alone if a key is no keyword name", () => {
    const org = toOrg("begin_src:: x\nfoo:: y\n\n- b\n")
    expect(org).not.toContain("#+begin_src")
    expect(org).not.toContain("#+foo")
    // acting keys do map here: it is how an org page's own come back
    expect(toOrg("bind:: y\n\n- b\n")).toBe("#+bind: y\n- b\n")
  })
  it("page properties below a mode line round-trip", () => {
    const markdown = "<!-- -*- mode: org -*- -->\n\ntitle:: x\n\n- b\n"
    expect(toMd(toOrg(markdown))).toBe(markdown)
  })
  it("takes no key:: block below a comment other than a mode line", () => {
    const markdown = "<!-- c -->\n\nalias:: *x*\n\n- b\n"
    expect(toOrg(markdown)).not.toContain("#+alias")
    expect(toMd(toOrg(markdown))).toBe(markdown)
    expect(toMd("# c\n#+title: x\n- b\n")).not.toContain("title::")
  })
  it("keeps a -*- comment below page properties inert", () => {
    const org = toOrg(toMd("#+tags: a, b\n\n# -*- mode: org -*-\n- b\n"))
    expect(org.startsWith("# -*-")).toBe(false)
  })
  it("a keyword whose key ends in a colon converges", () => {
    // org reads `#+FOO:: bar` as the key FOO:
    const once = toMd(toOrg("#+NAME: n\n#+TITLE: t\n#+FOO:: bar\n"))
    expect(toMd(toOrg(once))).toBe(once)
  })
  it("keywords below a comment converge", () => {
    const once = toOrg(toMd("# hello\n#+title: y\n- b\n"))
    expect(toOrg(toMd(once))).toBe(once)
  })
  it("keeps a keyword above a page property", () => {
    expect(toMd("#+NAME: n\n#+title: y\n- b\n")).toBe(
      "name:: n\ntitle:: y\n\n- b\n"
    )
  })
  it("a short caption converges apart from the block", () => {
    for (const markdown of [
      "---\nmorg_keywords:\n  - CAPTION[s]: long\ntitle: x\nnested:\n  a: 1\n---\n\n- b\n",
      "---\nmorg_keywords:\n  - CAPTION[s]: long\ntitle: x\n---\n\nPara\n"
    ]) {
      const once = toMd(toOrg(markdown))
      expect(toMd(toOrg(once))).toBe(once)
    }
  })
})
