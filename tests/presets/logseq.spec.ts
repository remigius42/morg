import { describe, it, expect } from "vitest"
import { logseq } from "../../src/presets/logseq.js"
import { convertMarkdownToOrg } from "../../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../../src/orgToMarkdown.js"
import { translateOrg } from "../../src/translate.js"
import { parse as parseYaml } from "yaml"

describe("logseq outline", () => {
  const toMarkdown = (org: string): string =>
    convertOrgToMarkdown(org, { preset: logseq() })
  const toOrg = (markdown: string): string =>
    convertMarkdownToOrg(markdown, { preset: logseq() })
  const both = (org: string, markdown: string): void => {
    expect(toMarkdown(org)).toBe(markdown)
    expect(toOrg(markdown)).toBe(org)
  }

  it("maps block headlines to tab-indented bullets", () => {
    both(
      "* Page\n:PROPERTIES:\n:heading: 1\n:END:\n** a block\n*** a child\n** another\n",
      "- # Page\n\t- a block\n\t\t- a child\n\t- another\n"
    )
  })

  it("keeps a block's checkbox descriptive list below a marker", () => {
    // Logseq md hides the comment (ADR 0007 §3)
    const org = "* Phase\n\n- [ ] Foam :: 1 set\n- [ ] Cat :: 2 sets\n"

    expect(toMarkdown(org)).toContain(
      "  <!-- morg_descriptive_list -->\n  \n  - [ ] Foam :: 1 set\n"
    )
    expect(toOrg(toMarkdown(org))).toBe(org)
  })

  it("maps an empty block to a bare bullet", () => {
    both("* a\n**\n", "- a\n\t-\n")
  })

  it("keeps a block's lines below the first in the block", () => {
    both("* first line\nsecond line\n", "- first line\n  second line\n")
  })

  it("converts a code block that starts on the headline line", () => {
    // in upper case, as Logseq writes a block
    const org = "* #+BEGIN_SRC sh\necho hi\n#+END_SRC\n"

    both(org, "- ```sh\n  echo hi\n  ```\n")
    expect(toMarkdown("* #+begin_src sh\necho hi\n#+end_src\n")).toBe(
      "- ```sh\n  echo hi\n  ```\n"
    )
  })

  it("keeps code that holds block lines as written", () => {
    // escaped in org, fenced in Markdown; a fence line is no fence in org
    both(
      "* #+BEGIN_SRC org\n,#+begin_quote\n,#+end_quote\n#+END_SRC\n",
      "- ```org\n  #+begin_quote\n  #+end_quote\n  ```\n"
    )
    expect(
      toMarkdown(
        "* a\n#+BEGIN_SRC md\n```\n#+END_SRC\n#+BEGIN_TIP\nt\n#+END_TIP\n"
      )
    ).toBe(
      "- a\n  \n  ````md\n  ```\n  ````\n  \n  #+BEGIN_TIP\n  t\n  #+END_TIP\n"
    )
  })

  it("reads an org block in a Markdown block as org", () => {
    expect(toOrg("- #+BEGIN_SRC\n  read_flash x_y\n  #+END_SRC\n")).toBe(
      "* #+BEGIN_SRC\nread_flash x_y\n#+END_SRC\n"
    )
    expect(toOrg("- a\n  ```\n  #+BEGIN_X\n  #+END_X\n  ```\n")).toBe(
      "* a\n\n#+BEGIN_EXAMPLE\n,#+BEGIN_X\n,#+END_X\n#+END_EXAMPLE\n"
    )
  })

  it("keeps a bare underscore and caret text, as md does", () => {
    both("* snake_case 2^10\n", "- snake\\_case 2^10\n")
  })

  it("converts the markup in a quote block of a Markdown block", () => {
    const org = toOrg(
      "- #+BEGIN_QUOTE\n  some **bold** and [l](https://y.ch)\n  #+END_QUOTE\n"
    )

    expect(org).toBe(
      "* #+BEGIN_QUOTE\nsome *bold* and [[https://y.ch][l]]\n#+END_QUOTE\n"
    )
    expect(toMarkdown(org)).toBe("- > some **bold** and [l](https://y.ch)\n")
  })

  it("keeps the text of a block org writes as its org text", () => {
    both(
      "* #+BEGIN_TIP\nsee https://x.ch, a@b.ch and [#A]\n#+END_TIP\n",
      "- #+BEGIN_TIP\n  see https://x.ch, a@b.ch and [#A]\n  #+END_TIP\n"
    )
  })

  it("writes a special block as org does, no GFM alert", () => {
    // Logseq shows `#+BEGIN_TIP` as a box, `> [!TIP]` as a quote
    both(
      "* x\n#+BEGIN_TIP Stretch first\nb\n#+END_TIP\n",
      "- x\n  \n  #+BEGIN_TIP Stretch first\n  b\n  #+END_TIP\n"
    )
  })

  it("keeps a md block's other org blocks as written, in both directions", () => {
    const markdown = "- #+BEGIN_TIP\n  *emphasis* and **strong**\n  #+END_TIP\n"

    // the content as it is
    both("* #+BEGIN_TIP\n*emphasis* and **strong**\n#+END_TIP\n", markdown)
  })

  it("keeps a block's title inline, as Logseq reads it", () => {
    both("* : a ~b~\n", "- : a `b`\n")
    both("* ** a\n", "- \\*\\* a\n")
    both("* - a\n", "- \\- a\n")
    both("* # a\n", "- \\# a\n")
  })

  it("writes a block's leading comment below an empty title", () => {
    // a title is text: `* # d` would show the comment (ADR 0006)
    both("*\n# d\n* x\n", "- <!-- d -->\n- x\n")
  })

  it("converts a table or a rule that starts on the headline line", () => {
    expect(toMarkdown("* | a | b |\n| 1 | 2 |\n")).toBe(
      "- | a | b |\n  | - | - |\n  | 1 | 2 |\n"
    )
    expect(toMarkdown("* -----\n")).toBe("- ---\n")
  })

  it("maps block properties to key:: lines", () => {
    both(
      "* a\n:PROPERTIES:\n:collapsed: true\n:logseq.order-list-type: number\n:END:\n",
      "- a\n  collapsed:: true\n  logseq.order-list-type:: number\n"
    )
  })

  it("keeps properties that start a block's content on its first line", () => {
    both(
      "* q\n** :PROPERTIES:\n:query-table: false\n:END:\ntext\n",
      "- q\n\t- query-table:: false\n\t  text\n"
    )
  })

  it("keeps planning lines and drawers where they are", () => {
    both(
      "* TODO a\nSCHEDULED: <2026-01-01 Thu>\n:PROPERTIES:\n:heading: 2\n:id: x\n:END:\n:LOGBOOK:\nCLOCK: [2026-01-01 Thu 10:00]--[2026-01-01 Thu 11:00] =>  01:00\n:END:\n",
      "- ## TODO a\n  SCHEDULED: <2026-01-01 Thu>\n  id:: x\n  :LOGBOOK:\n  CLOCK: [2026-01-01 Thu 10:00]--[2026-01-01 Thu 11:00] =>  01:00\n  :END:\n"
    )
  })

  it("keeps a drawer below an indented planning line a drawer", () => {
    // Emacs indents the planning line below a headline
    const org =
      "* TODO a\n  SCHEDULED: <2026-01-01 Thu>\n:PROPERTIES:\n:id: x\n:END:\n** b\n"
    expect(toOrg(toMarkdown(org))).toBe(
      "* TODO a\nSCHEDULED: <2026-01-01 Thu>\n:PROPERTIES:\n:id: x\n:END:\n** b\n"
    )
    // a closed task's planning line too
    const closed =
      "* DONE a\nCLOSED: [2026-01-01 Thu 10:00]\n:PROPERTIES:\n:id: x\n:END:\n** b\n"
    expect(toOrg(toMarkdown(closed))).toBe(closed)
  })

  it("bullets a repeated task's state log as Logseq does per format", () => {
    both(
      '* DONE a\n:LOGBOOK:\n- State "DONE" from "TODO" [2026-01-01 Thu 10:00]\n:END:\n',
      '- DONE a\n  :LOGBOOK:\n  * State "DONE" from "TODO" [2026-01-01 Thu 10:00]\n  :END:\n'
    )
  })

  it("keeps task markers and priorities as text", () => {
    both(
      "* TODO [#A] urgent\n** DONE done\n",
      "- TODO [#A] urgent\n\t- DONE done\n"
    )
  })

  it("reads a heading outside the bullets as a top-level block", () => {
    expect(toOrg("# Garden\n\t- ## Android\n")).toBe(
      "* Garden\n:PROPERTIES:\n:heading: 1\n:END:\n** Android\n:PROPERTIES:\n:heading: 2\n:END:\n"
    )
  })

  it("keeps a heading line inside a fence in its block", () => {
    expect(toOrg("# a\n```sh\n# comment\n```\n")).toBe(
      "* a\n:PROPERTIES:\n:heading: 1\n:END:\n\n#+BEGIN_SRC sh\n# comment\n#+END_SRC\n"
    )
  })

  it("keeps a bare url bare and a bracketed one bracketed", () => {
    both(
      "* see https://x.ch/a_b and [[https://y.ch]]\n",
      "- see https://x.ch/a_b and <https://y.ch>\n"
    )
  })

  it("keeps a tag that starts a block a tag", () => {
    both(
      "* #meeting notes\n* #[[two words]] and C# stay\n",
      "- #meeting notes\n- #[[two words]] and C# stay\n"
    )
  })

  it("keeps a bare email address text", () => {
    both("* mail a.b@c.ch\n", "- mail a.b@c.ch\n")
  })

  it("keeps a url in a macro bare", () => {
    both(
      "* {{video https://youtube.com/watch?v=abc}}\n",
      "- {{video https://youtube.com/watch?v=abc}}\n"
    )
  })

  it("keeps a bare url org would cut short in brackets", () => {
    const markdown = "- https://x.ch/Band_(signal_processing)\n"

    expect(toOrg(markdown)).toBe(
      "* [[https://x.ch/Band_(signal_processing)]]\n"
    )
    expect(toMarkdown(toOrg(markdown))).toBe(
      "- <https://x.ch/Band_(signal_processing)>\n"
    )
  })

  it("ends a fence a bullet line opened", () => {
    expect(toOrg("- ```sh\n  echo\n  ```\n## B\n\t- y\n")).toBe(
      "* #+BEGIN_SRC sh\necho\n#+END_SRC\n* B\n:PROPERTIES:\n:heading: 2\n:END:\n** y\n"
    )
  })

  it("records no markdown style in a block", () => {
    expect(
      convertMarkdownToOrg("- some *it* text\n", {
        preset: logseq(),
        recordMarkdownStyle: true
      })
    ).toBe("* some /it/ text\n")
  })

  it("maps page references to wikilinks and labeled forms", () => {
    both(
      "* See [[my page name]] and [[other page][a label]]\n* [[((60ab-uuid))][a block ref]]\n",
      "- See [[my page name]] and [a label]([[other page]])\n- [a block ref](((60ab-uuid)))\n"
    )
  })

  it("rewrites labeled page refs whose page name has no space", () => {
    // remark parses [label]([[soil]]) as a real link -- unlike
    // [[other page]], whose space makes it an invalid destination
    both("* See [[soil][label]] here.\n", "- See [label]([[soil]]) here.\n")
  })

  it("keeps ^^highlight^^ markup and hiccup intact", () => {
    both(
      '* Some ^^bright words^^ here.\n* [:div {:class "note"} "hi"]\n',
      '- Some ^^bright words^^ here.\n- [:div {:class "note"} "hi"]\n'
    )
  })
})

describe("logseq page properties", () => {
  const toOrg = (markdown: string): string =>
    convertMarkdownToOrg(markdown, { preset: logseq() })
  const toMd = (org: string): string =>
    convertOrgToMarkdown(org, { preset: logseq() })

  it("maps a first block of key:: lines to #+key: keywords", () => {
    expect(toOrg("title:: My Page\ntags:: a, [[b c]]\n\n- first block\n")).toBe(
      "#+title: My Page\n#+tags: a, [[b c]]\n\n* first block\n"
    )
  })
  it("maps leading #+key: keywords to a first block of key:: lines", () => {
    // Logseq reads only lower-case keys; uniorg upper-cases them
    expect(
      toMd("#+TITLE: My Page\n#+tags: a, [[b c]]\n\n* first block\n")
    ).toBe("title:: My Page\ntags:: a, [[b c]]\n\n- first block\n")
  })
  it("maps flat frontmatter entries to #+key: keywords", () => {
    // a sequence as Logseq writes it; what a keyword line cannot hold
    // (nested, multi-line, an item with a comma) stays in the block
    const markdown =
      '---\ntitle: My Page\ntags: [a, b]\nauthor:\n  name: X\ndesc: |\n  one\n  two\nodd: ["a, b"]\ndraft: true\n---\n\n- first block\n'

    expect(toOrg(markdown)).toBe(
      '#+title: My Page\n#+tags: a, b\n#+draft: true\n#+begin_comment morg_frontmatter\nauthor:\n  name: X\ndesc: |\n  one\n  two\nodd: ["a, b"]\n#+end_comment\n\n* first block\n'
    )
  })
  it("keeps page property values verbatim, urls and markup included", () => {
    const markdown =
      "source:: https://example.com/a_b\nalias:: snake_case, *bold*, `code`\n\n- b\n"
    const org = toOrg(markdown)

    expect(org).toBe(
      "#+source: https://example.com/a_b\n\n#+alias: snake_case, *bold*, `code`\n\n* b\n"
    )
    expect(toMd(org)).toBe(markdown)
  })
  it("page properties are a round-trip identity both ways", () => {
    expect(toMd(toOrg("title:: x\nend_date:: y\n\n- b\n"))).toBe(
      "title:: x\nend_date:: y\n\n- b\n"
    )
    const markdown = "title:: My Page\ntags:: a, b\n\n- first block\n"
    expect(toMd(toOrg(markdown))).toBe(markdown)
    const org = "#+title: My Page\n#+tags: a, b\n\n* first block\n"
    expect(toOrg(toMd(org))).toBe(org)
  })

  it("reads a frontmatter's list items as frontmatter, not blocks", () => {
    expect(toOrg("---\ntitle: x\ntags:\n- a\n- b\n---\n\n- block\n")).toBe(
      "#+title: x\n#+tags: a, b\n\n* block\n"
    )
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
      "#+begin_comment morg_frontmatter\n#+end_comment\n\n* b\n"
    )
    expect(toMd(toOrg(markdown))).toBe(markdown)
  })
  it("keeps frontmatter values as written", () => {
    expect(
      toOrg(
        "---\nversion: 1.10\nzip: 01234\nbig: 12345678901234567890\n---\n\n- b\n"
      )
    ).toBe(
      "#+version: 1.10\n#+zip: 01234\n#+big: 12345678901234567890\n\n* b\n"
    )
  })
  it("leaves entries a keyword line cannot hold in the block", () => {
    expect(
      toOrg('---\ntitle: x\nnote: "a\\rb"\nbegin_src: y\n---\n\n- b\n')
    ).toBe(
      '#+title: x\n#+begin_comment morg_frontmatter\nnote: "a\\rb"\nbegin_src: y\n#+end_comment\n\n* b\n'
    )
  })
  it("keeps flow-style or aliased frontmatter whole", () => {
    for (const yaml of ["{title: x, tags: [a, b]}", "base: &b x\nother: *b"]) {
      expect(toOrg(`---\n${yaml}\n---\n\n- b\n`)).toBe(
        `#+begin_comment morg_frontmatter\n${yaml}\n#+end_comment\n\n* b\n`
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
        "",
        "* b",
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
        "",
        "* b",
        ""
      ].join("\n")
    )
  })

  it("maps an org page's own acting keywords back as keywords", () => {
    const org = "#+startup: overview\n#+todo: LATER DONE\n\n* b\n"
    expect(toOrg(toMd(org))).toBe(org)
  })
  it("takes only a key:: block whose source is plain key:: lines", () => {
    for (const markdown of ["[title](x):: y\n\n- b\n", "**k**:: v\n\n- b\n"]) {
      expect(toOrg(markdown)).not.toMatch(/^#\+/)
    }
  })

  it("maps an empty page property and CRLF line endings", () => {
    expect(toOrg("title:: x\ntags::\n\n- b\n")).toBe(
      "#+title: x\n#+tags:\n\n* b\n"
    )
    expect(toMd("#+title: x\n#+tags:\n\n* b\n")).toBe(
      "title:: x\ntags::\n\n- b\n"
    )
    expect(toOrg("title:: x\r\ntags:: a\r\n\r\n- b\r\n")).toBe(
      "#+title: x\n#+tags: a\n\n* b\n"
    )
  })
  it("cuts whole entries, key properties included", () => {
    for (const yaml of [
      "? a\n: 1\nb: 2",
      "&x a: 1\nb: 2",
      "!!str a: 1\nb: 2"
    ]) {
      expect(toOrg(`---\n${yaml}\n---\n\n- c\n`)).toBe(
        "#+a: 1\n#+b: 2\n\n* c\n"
      )
    }
  })

  it("keeps frontmatter with YAML errors whole", () => {
    const yaml = 'a: 1\nb: "open\nc: 2'
    expect(toOrg(`---\n${yaml}\n---\n\n- c\n`)).toBe(
      `#+begin_comment morg_frontmatter\n${yaml}\n#+end_comment\n\n* c\n`
    )
  })
  it("finds the key:: block below a drawer or a mode line", () => {
    expect(
      toOrg("---\nmorg_properties:\n  - ID: abc\n---\n\nfoo:: bar\n\n- b\n")
    ).toBe(":PROPERTIES:\n:ID: abc\n:END:\n#+foo: bar\n\n* b\n")
    expect(toOrg("<!-- -*- mode: org -*- -->\n\nfoo:: bar\n\n- b\n")).toBe(
      "# -*- mode: org -*-\n#+foo: bar\n\n* b\n"
    )
  })

  it("leaves a key:: block alone if a key is no keyword name", () => {
    const org = toOrg("begin_src:: x\nfoo:: y\n\n- b\n")
    expect(org).not.toContain("#+begin_src")
    expect(org).not.toContain("#+foo")
    // acting keys do map here: it is how an org page's own come back
    expect(toOrg("bind:: y\n\n- b\n")).toBe("#+bind: y\n\n* b\n")
  })
  it("page properties below a mode line round-trip", () => {
    const markdown = "<!-- -*- mode: org -*- -->\n\ntitle:: x\n\n- b\n"
    expect(toMd(toOrg(markdown))).toBe(markdown)
  })
  it("takes no key:: block below a comment other than a mode line", () => {
    const markdown = "<!-- c -->\n\nalias:: *x*\n\n- b\n"
    expect(toOrg(markdown)).not.toContain("#+alias")
    expect(toMd(toOrg(markdown))).toBe(markdown)
    expect(toMd("# c\n#+title: x\n\n* b\n")).not.toContain("title::")
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
    const once = toOrg(toMd("# hello\n#+title: y\n\n* b\n"))
    expect(toOrg(toMd(once))).toBe(once)
  })
  it("keeps a keyword above a page property", () => {
    expect(toMd("#+NAME: n\n#+title: y\n\n* b\n")).toBe(
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

describe("logseq image sizes (ADR 0007)", () => {
  const fromLogseq = { inputPreset: logseq() }
  const toLogseq = { outputPreset: logseq() }

  it("maps a body image's size to its #+ATTR_HTML: line and back", () => {
    const logseqOrg = "* b\n[[../assets/j.png]]{:height 200, :width 300}\n"
    const vanillaOrg =
      "* b\n#+ATTR_HTML: :height 200 :width 300\n[[../assets/j.png]]\n"

    expect(translateOrg(logseqOrg, fromLogseq)).toBe(vanillaOrg)
    expect(translateOrg(vanillaOrg, toLogseq)).toBe(logseqOrg)
  })

  it("reads Logseq md's size as the #+ATTR_HTML: line", () => {
    const markdown = "- b\n\n  ![x](../assets/j.png){:width 300}\n"

    expect(convertMarkdownToOrg(markdown, fromLogseq)).toContain(
      "#+ATTR_HTML: :width 300\n[[file:../assets/j.png][x]]\n"
    )
    expect(
      convertOrgToMarkdown(
        "* b\n#+ATTR_HTML: :width 300\n[[file:../assets/j.png][x]]\n",
        toLogseq
      )
    ).toContain("\n  ![x](../assets/j.png){:width 300}\n")
  })

  it("keeps the size as written between Logseq md and Logseq org", () => {
    const org = "* b\n[[../assets/j.png]]{:height 2, :width 3}\n"
    const markdown = "- b\n  ![](../assets/j.png){:height 2, :width 3}\n"

    expect(convertOrgToMarkdown(org, { preset: logseq() })).toBe(markdown)
    expect(convertMarkdownToOrg(markdown, { preset: logseq() })).toContain(
      "{:height 2, :width 3}"
    )
  })

  it("keeps a block title's size as written: org sizes no headline", () => {
    // the corpus's one case: an image that is the whole block title
    const org =
      "*** [[https://x.org/a.jpg][a.jpg (1200×1200)]]{:height 977, :width 969}\n"

    expect(translateOrg(org, fromLogseq)).toBe(org)
    expect(convertOrgToMarkdown(org, { preset: logseq() })).toContain(
      "{:height 977, :width 969}"
    )
  })
})
