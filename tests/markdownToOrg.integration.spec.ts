import { describe, it, expect } from "vitest"
import { convertMarkdownToOrg } from "../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../src/orgToMarkdown.js"
import { logseq } from "../src/presets/logseq.js"

describe("convertMarkdownToOrg", () => {
  it("should convert a simple markdown string to a generic org-mode string", () => {
    const markdown = "# Hello World\n\nThis is a paragraph."
    const expectedOrgMode = `* Hello World
This is a paragraph.
`

    const orgOutput = convertMarkdownToOrg(markdown)

    expect(orgOutput).toBe(expectedOrgMode)
  })

  it("should convert inline code to org verbatim markup", () => {
    const markdown = "Use `foo` here.\n"

    expect(convertMarkdownToOrg(markdown)).toBe("Use ~foo~ here.\n")
  })

  it("should join multi-line inline code with spaces", () => {
    // org markup spans at most two lines; CommonMark renders a line
    // ending in a code span as a space anyway
    const markdown = "a `x\ny\nz` b\n"

    expect(convertMarkdownToOrg(markdown)).toBe("a ~x y z~ b\n")
  })

  it("should join the lines of markup spanning more than two", () => {
    // org markup spans at most two lines
    expect(convertMarkdownToOrg("**a\nb\nc** d\n*e\nf*\n")).toBe(
      "*a b c* d\n/e\nf/\n"
    )
  })

  it("should join CRLF and CR line endings in inline code too", () => {
    expect(convertMarkdownToOrg("a `x\r\ny\rz` b\n")).toBe("a ~x y z~ b\n")
  })

  it("should separate markup from adjacent word characters", () => {
    // org markup needs a boundary; U+200B is org's own escape for it
    const markdown = "a `x`s, foo**bar**baz and [l](u)*i*\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "a ~x~\u200Bs, foo\u200B*bar*\u200Bbaz and [[file:u][l]]\u200B/i/\n"
    )
  })

  it("should keep literal org markers in text literal", () => {
    // a zero-width space after the opening marker leaves no markup
    const markdown = "see /etc/, a \\*b\\* and x =y= z\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "see /\u200Betc/, a *\u200Bb* and x =\u200By= z\n"
    )
  })

  it("should keep a literal marker pair split by another node literal", () => {
    const markdown = "a \\*b `x` c\\* d, a /b [l](u) c/ d, a =b **c** d= e\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "a *\u200Bb ~x~ c* d, a /\u200Bb [[file:u][l]] c/ d, a =\u200Bb *c* d= e\n"
    )
  })

  it("should keep bare underscores and carets out of org scripts", () => {
    // ^:{} limits org sub/superscripts to the braced form morg emits
    const markdown = "see a_b_c and x^y\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "#+OPTIONS: ^:{}\nsee a_b_c and x^y\n"
    )
  })

  it.each(["**a**_b", "`x`_b", "[l](u)_b", "**a**^b"])(
    "should keep a script after another inline node out: %s",
    markdown => {
      // org reads the script in the rendered line, marker or ] before it
      expect(convertMarkdownToOrg(`${markdown}\n`)).toMatch(
        /^#\+OPTIONS: \^:\{\}\n/
      )
    }
  )

  it.each(["[l](https://a.b/c_d^e)", "[[a_b|c]]", "`a_b`", "H_{2}O x^{2}"])(
    "should need no braced scripts where org reads none bare: %s",
    markdown => {
      expect(convertMarkdownToOrg(`${markdown}\n`)).not.toMatch(/OPTIONS/)
    }
  )

  it.each([
    "1\\_[[^1][x](u_v)",
    "- |[[a_b|c]]",
    "a_{https://a.b/c}x^1",
    "\\[\\[a_b\\]\\[\\]\\]"
  ])(
    "should keep a script out of brackets org reads as no link: %s",
    markdown => {
      expect(convertMarkdownToOrg(`${markdown}\n`)).toMatch(
        /^#\+OPTIONS: \^:\{\}\n/
      )
    }
  )

  it("should move edge whitespace of inline code outside the markers", () => {
    // org markup may not start or end with whitespace
    const markdown = "a ``x` `` b\n"

    expect(convertMarkdownToOrg(markdown)).toBe("a ~x`~  b\n")
  })

  it("should move code edge whitespace out of enclosing markup too", () => {
    // bold may not end with whitespace either
    expect(convertMarkdownToOrg("a **`x `** b\n")).toBe("a *~x~*  b\n")
  })

  it("should keep inline code no org markup can hold as text, with a warning", () => {
    // a `~` would end ~code~ early, a `=` =verbatim=
    const warnings: string[] = []

    expect(
      convertMarkdownToOrg("`a~ b= c`\n", { onWarning: m => warnings.push(m) })
    ).toBe("a~ b= c\n")
    expect(warnings).toEqual(["inline code holding both ~ and = kept as text"])
  })

  it("should keep whitespace-only inline code as text, with a warning", () => {
    // org has no empty code markup
    const warnings: string[] = []

    expect(
      convertMarkdownToOrg("a ` ` b\n", { onWarning: m => warnings.push(m) })
    ).toBe("a   b\n")
    expect(warnings).toEqual(["whitespace-only inline code kept as text"])
  })

  it("should keep paragraph lines that look like org syntax text", () => {
    // a zero-width space at line start keeps org from reading a list
    // item, headline, comment or table there
    const markdown = "\\* a\n1\\. b\n\\- c\n\\# d\n\\| e |\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "\u200B* a\n\u200B1. b\n\u200B- c\n\u200B# d\n\u200B| e |\n"
    )
  })

  it("should check line syntax on the rendered line, not the first text", () => {
    // [fn:1] at line start is a footnote definition; `* ~x~` a headline
    expect(convertMarkdownToOrg("[^1] a\n\n[^1]: n\n")).toBe(
      "\u200B[fn:1] a\n\n[fn:1] n\n"
    )
    expect(convertMarkdownToOrg("\\*` x`\n")).toBe("\u200B* ~x~\n")
  })

  it("should survive uniorg failing to read a heading or table cell", () => {
    // parsed alone, `_. a` throws in uniorg (it takes `_.` for a bullet)
    expect(convertMarkdownToOrg("# _. a\n")).toBe("* _. a\n")
    // unchecked, so a literal marker pair stays as is
    expect(convertMarkdownToOrg("| _. /b/ |\n| - |\n")).toBe(
      "| _. /b/ |\n|-|\n"
    )
  })

  it("should keep a heading inside a list item as text, with a warning", () => {
    // org headlines cannot live inside a list item
    const warnings: string[] = []
    const markdown = "- item\n\n  ## Head [l](u)\n\n  text\n"

    expect(
      convertMarkdownToOrg(markdown, { onWarning: m => warnings.push(m) })
    ).toBe("- item\n  Head [[file:u][l]]\n  text\n")
    expect(warnings).toEqual(["heading inside a list item became text"])
  })

  it("should keep a heading inside a blockquote as text, with a warning", () => {
    // Emacs ends a quote block at a headline
    const warnings: string[] = []

    expect(
      convertMarkdownToOrg("> ## H\n>\n> text\n", {
        onWarning: m => warnings.push(m)
      })
    ).toBe("#+begin_quote\nH\n\ntext\n#+end_quote\n")
    expect(warnings).toEqual(["heading inside a blockquote became text"])
  })

  it("should convert relative links and images to org file links", () => {
    // a bare org path is a fuzzy link (a heading search), not a file
    const markdown =
      "[K3s](kubernetes.md#Using%20MetalLB), ![a](i.png) and [w](https://e.com)\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "[[file:kubernetes.md::Using MetalLB][K3s]], [[file:i.png][a]] and [[https://e.com][w]]\n"
    )
  })

  it("should convert fenced code blocks to src blocks", () => {
    const markdown = '```js\nconsole.log("hi")\n```\n'

    expect(convertMarkdownToOrg(markdown)).toBe(
      '#+begin_src js\nconsole.log("hi")\n#+end_src\n'
    )
  })

  it("should keep the indentation of code inside a list item", () => {
    const markdown = "- a\n\n  ```py\n  if x:\n      y()\n  ```\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "- a\n  #+begin_src py\n  if x:\n      y()\n  #+end_src\n"
    )
  })

  it("should convert fenced code blocks without language to example blocks", () => {
    const markdown = "```\nplain text\n```\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "#+begin_example\nplain text\n#+end_example\n"
    )
  })

  it("should convert blockquotes to quote blocks", () => {
    const markdown = "> Quoted *wisdom* here.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "#+begin_quote\nQuoted /wisdom/ here.\n#+end_quote\n"
    )
  })

  it("should convert images to org links", () => {
    const markdown = "![](image.png)\n\n![A diagram](diagram.svg)\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "[[file:image.png]]\n\n[[file:diagram.svg][A diagram]]\n"
    )
  })

  it("should percent-encode brackets in link and image urls", () => {
    // org bracket-link paths cannot contain [ or ]
    expect(convertMarkdownToOrg("[x](http://e.com/?a[]=1)\n")).toBe(
      "[[http://e.com/?a%5B%5D=1][x]]\n"
    )
    expect(convertMarkdownToOrg("![a](i[1].png)\n")).toBe(
      "[[file:i%5B1%5D.png][a]]\n"
    )
  })

  it("should drop image title attributes (documented)", () => {
    const markdown = '![A diagram](diagram.svg "The title")\n'

    expect(convertMarkdownToOrg(markdown)).toBe(
      "[[file:diagram.svg][A diagram]]\n"
    )
  })

  it("should report dropped constructs via onWarning", () => {
    const warnings: string[] = []
    const markdown = '![A diagram](diagram.svg "The title")\n'

    convertMarkdownToOrg(markdown, { onWarning: m => warnings.push(m) })

    expect(warnings).toEqual(['dropped image title "The title" (diagram.svg)'])
  })

  it("should convert tables with a header rule", () => {
    const markdown = "| a | b |\n| --- | --- |\n| 1 | 2 |\n"

    expect(convertMarkdownToOrg(markdown)).toBe("| a | b |\n|-|\n| 1 | 2 |\n")
  })

  it("should convert column alignment to an org cookie row", () => {
    const markdown = "| a | b | c |\n| :-- | --: | :-: |\n| 1 | 2 | 3 |\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "| a | b | c |\n|-|\n| <l> | <r> | <c> |\n| 1 | 2 | 3 |\n"
    )
  })

  it("should restore table.el fenced blocks to table.el tables", () => {
    const markdown = "```table.el\n+---+---+\n| a | b |\n+---+---+\n```\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "+---+---+\n| a | b |\n+---+---+\n"
    )
  })

  it("should restore remapped org-ism key names", () => {
    const markdown =
      "# Ship it\n\nstate:: TODO\npriority:: A\n\nwhen:: <2026-09-15 Tue>\n"

    expect(
      convertMarkdownToOrg(markdown, {
        orgismKeys: { todo: "state", scheduled: "when" }
      })
    ).toBe("* TODO [#A] Ship it\nSCHEDULED: <2026-09-15 Tue>\n")
  })

  it("should restore known key:: values to native org syntax", () => {
    const markdown =
      "# Ship it\n\ntodo:: TODO\npriority:: A\ntags:: work, urgent\n\nBody text.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "* TODO [#A] Ship it :work:urgent:\nBody text.\n"
    )
  })

  it("should keep unusable todo, priority and tags values as properties", () => {
    // a drawer property that happens to be named todo would otherwise be
    // written onto the headline and corrupt the title
    const markdown =
      "# Head\n\ntodo:: something\npriority:: not-a-letter\ntags:: no spaces here\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "* Head\n:PROPERTIES:\n:todo: something\n:priority: not-a-letter\n" +
        ":tags: no spaces here\n:END:\n"
    )
  })

  it("should restore planning keys and unknown keys as drawer properties", () => {
    const markdown =
      "# Meeting\n\nscheduled:: <2026-09-15 Tue>\ndeadline:: <2026-09-20 Sun>\n\ncustom_id:: mtg\n\nNotes.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "* Meeting\nSCHEDULED: <2026-09-15 Tue> DEADLINE: <2026-09-20 Sun>\n:PROPERTIES:\n:custom_id: mtg\n:END:\nNotes.\n"
    )
  })

  it("should restore an empty key:: value as an empty property", () => {
    const markdown = "# Meeting\n\nroom::\ncustom_id:: mtg\n\nNotes.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "* Meeting\n:PROPERTIES:\n:room:\n:custom_id: mtg\n:END:\nNotes.\n"
    )
  })

  it("should convert html comments to org comments", () => {
    const markdown = "<!-- a note -->\n\n<!--\nfirst\nsecond\n-->\n\nText.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "# a note\n# first\n# second\nText.\n"
    )
  })

  it("should restore an escaped comment terminator", () => {
    const markdown = "<!-- see --&gt; here -->\n"

    expect(convertMarkdownToOrg(markdown)).toBe("# see --> here\n")
  })

  it("should preserve block html as an export block", () => {
    const markdown = '<div class="note">\nRaw html\n</div>\n'

    expect(convertMarkdownToOrg(markdown)).toBe(
      '#+begin_export html\n<div class="note">\nRaw html\n</div>\n#+end_export\n'
    )
  })

  it("should preserve inline html as export snippets", () => {
    const markdown = "Press <kbd>x</kbd> now.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "Press @@html:<kbd>@@x@@html:</kbd>@@ now.\n"
    )
  })

  it("should interpret <u> as org underline with interpretHtml", () => {
    const markdown = "Some <u>underlined</u> text.\n"

    expect(convertMarkdownToOrg(markdown, { interpretHtml: true })).toBe(
      "Some _underlined_ text.\n"
    )
  })

  it("should interpret <sup> and <sub> as org script markup with interpretHtml", () => {
    const markdown = "E = mc<sup>2</sup> and H<sub>2</sub>O.\n"

    expect(convertMarkdownToOrg(markdown, { interpretHtml: true })).toBe(
      "E = mc^{2} and H_{2}O.\n"
    )
  })

  it("should preserve html with attributes or unknown tags despite interpretHtml", () => {
    const markdown = 'Keep <u class="x">this</u> and <kbd>that</kbd>.\n'

    expect(convertMarkdownToOrg(markdown, { interpretHtml: true })).toBe(
      'Keep @@html:<u class="x">@@this@@html:</u>@@ and ' +
        "@@html:<kbd>@@that@@html:</kbd>@@.\n"
    )
  })

  it("should preserve morg's html vocabulary without interpretHtml", () => {
    const markdown = "Some <u>underlined</u> text.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "Some @@html:<u>@@underlined@@html:</u>@@ text.\n"
    )
  })

  it("should interpret <dl> as org descriptive list with interpretHtml", () => {
    const markdown =
      "<dl>\n<dt>term</dt>\n<dd>a definition</dd>\n" +
      "<dt>other</dt>\n<dd>second entry</dd>\n</dl>\n"

    expect(convertMarkdownToOrg(markdown, { interpretHtml: true })).toBe(
      "- term :: a definition\n- other :: second entry\n"
    )
  })

  it("should interpret <dl> regardless of whitespace between tags", () => {
    const sameLine = "<dl>\n<dt>foo</dt><dd>bar</dd>\n</dl>\n"
    const indented = "<dl>\n  <dt>foo</dt>\n  <dd>bar</dd>\n</dl>\n"
    const oneLine = "<dl><dt>foo</dt><dd>bar</dd></dl>\n"

    for (const markdown of [sameLine, indented, oneLine]) {
      expect(convertMarkdownToOrg(markdown, { interpretHtml: true })).toBe(
        "- foo :: bar\n"
      )
    }
  })

  it("should interpret html tags case-insensitively and with tag whitespace", () => {
    const markdown =
      "Some <U>underlined</U > text.\n\n<DL>\n<dt >foo</dt>\n<dd>bar</dd >\n</DL>\n"

    expect(convertMarkdownToOrg(markdown, { interpretHtml: true })).toBe(
      "Some _underlined_ text.\n\n- foo :: bar\n"
    )
  })

  it("should drop html when preserveMdisms.html is false", () => {
    const markdown = "Press <kbd>x</kbd> now.\n\n<div>\nblock\n</div>\n"

    expect(
      convertMarkdownToOrg(markdown, { preserveMdisms: { html: false } })
    ).toBe("Press x now.\n")
  })

  it("should convert thematic breaks to org horizontal rules", () => {
    const markdown = "before\n\n---\n\nafter\n"

    expect(convertMarkdownToOrg(markdown)).toBe("before\n\n-----\nafter\n")
  })

  it("should convert hard line breaks to org line breaks", () => {
    const markdown = "line one\\\nline two\n"

    expect(convertMarkdownToOrg(markdown)).toBe("line one\\\\\nline two\n")
  })

  it("should write frontmatter verbatim into a marked comment block", () => {
    const markdown = "---\ntitle: My Note\nauthor: Rem\n---\n\nBody.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "#+begin_comment morg_frontmatter\ntitle: My Note\nauthor: Rem\n#+end_comment\nBody.\n"
    )
  })

  it("should comma-escape frontmatter lines org would read as structure", () => {
    // Org's own block escaping: a headline or keyword line, or one that
    // is already escaped, gets one more comma
    const markdown =
      "---\n#+not a keyword\ndesc: |\n  * star\n  #+end_comment\n  ,* comma\n---\n\nBody.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "#+begin_comment morg_frontmatter\n,#+not a keyword\ndesc: |\n  ,* star\n  ,#+end_comment\n  ,,* comma\n#+end_comment\nBody.\n"
    )
  })

  it("should restore morg_keywords as keywords ahead of the block", () => {
    const markdown =
      '---\ntitle: x # kept\nmorg_keywords:\n  - STARTUP: overview\n  - AUTHOR: a\n  - AUTHOR: b\n  - FILETAGS: ":one:two:"\nafter: 1\n---\n\nBody.\n'

    expect(convertMarkdownToOrg(markdown)).toBe(
      "#+STARTUP: overview\n#+AUTHOR: a\n#+AUTHOR: b\n#+FILETAGS: :one:two:\n#+begin_comment morg_frontmatter\ntitle: x # kept\nafter: 1\n#+end_comment\nBody.\n"
    )
  })

  it("should keep the comments of a restored entry in its place", () => {
    const markdown =
      '---\na: 1\nmorg_keywords: # restored by morg\n  # first\n  - TITLE: "t #1" # c2\nb: 2\n---\n\nBody.\n'

    expect(convertMarkdownToOrg(markdown)).toBe(
      "#+TITLE: t #1\n#+begin_comment morg_frontmatter\na: 1\n# restored by morg\n# first\n# c2\nb: 2\n#+end_comment\nBody.\n"
    )
    expect(
      convertMarkdownToOrg("---\na: 1\nmorg_keywords: # c\n  - TITLE: t\n---\n")
    ).toBe(
      "#+TITLE: t\n#+begin_comment morg_frontmatter\na: 1\n# c\n#+end_comment\n"
    )
  })

  it("should write CRLF frontmatter with the file's line endings", () => {
    expect(
      convertMarkdownToOrg(
        "---\r\na: 1\r\nmorg_keywords:\r\n  - TITLE: t\r\nb: 2\r\n---\r\n\r\nx\r\n"
      )
    ).toBe(
      "#+TITLE: t\n#+begin_comment morg_frontmatter\na: 1\nb: 2\n#+end_comment\nx\n"
    )
  })

  it("should restore morg_keywords values as written, not as parsed", () => {
    const markdown =
      "---\nmorg_keywords:\n  - VERSION: 1.10\n  - ZIP: 01234\n  - HEX: 0x1F\n  - EMPTY:\n  - QUOTED: 'a: b'\n---\n\nBody.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "#+VERSION: 1.10\n#+ZIP: 01234\n#+HEX: 0x1F\n#+EMPTY:\n#+QUOTED: a: b\nBody.\n"
    )
  })

  it("should leave morg_keywords in the block when a keyword line cannot hold it", () => {
    // a line break would end the keyword and inject org structure; a
    // key org does not read as a keyword name would not come back
    for (const entry of [
      '- TITLE: "x\\n* injected\\n#+INCLUDE: ~/.ssh/id_rsa"',
      '- TITLE: "x\\ry"',
      "- TITLE: |\n      l1\n      l2",
      "- TI TLE: x",
      "- begin_src: x",
      "- '': x"
    ]) {
      const markdown = `---\nmorg_keywords:\n  ${entry}\n---\n\nBody.\n`
      const org = convertMarkdownToOrg(markdown)

      expect(org).toMatch(/^#\+begin_comment morg_frontmatter\nmorg_keywords:/)
      expect(convertOrgToMarkdown(org)).toBe(markdown)
    }
  })

  it("should restore morg_properties as the leading file-level drawer", () => {
    expect(
      convertMarkdownToOrg(
        "---\nmorg_keywords:\n  - TITLE: x\nmorg_properties:\n  - ID: abc\n---\n\nBody.\n"
      )
    ).toBe(":PROPERTIES:\n:ID: abc\n:END:\n#+TITLE: x\nBody.\n")
    // a key with a space or a value with a line break would not come back
    for (const entry of ['- "A B": x', '- ID: "a\\nb"']) {
      const markdown = `---\nmorg_properties:\n  ${entry}\n---\n\nBody.\n`
      expect(convertMarkdownToOrg(markdown)).toMatch(
        /^#\+begin_comment morg_frontmatter\nmorg_properties:/
      )
    }
  })

  it("should write no block when morg_keywords is all there is", () => {
    const markdown =
      "---\nmorg_keywords:\n  - STARTUP: overview\n---\n\nBody.\n"

    expect(convertMarkdownToOrg(markdown)).toBe("#+STARTUP: overview\nBody.\n")
  })

  it("should emit plain org links when the text equals the url", () => {
    const markdown = "<https://example.com/a_b/> in text.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "[[https://example.com/a_b/]] in text.\n"
    )
  })

  it("should resolve reference-style links and images to inline", () => {
    const markdown =
      "A [reference][ref] and ![alt][img].\n\n[ref]: https://example.com\n\n[img]: image.png\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "A [[https://example.com][reference]] and [[file:image.png][alt]].\n"
    )
  })

  it("should convert markdown math to latex fragments", () => {
    const markdown = "Inline $x^2$ here.\n\n$$\na + b\n$$\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "Inline $x^2$ here.\n\n$$\na + b\n$$\n"
    )
  })

  it("should restore math blocks with begin to latex environments", () => {
    const markdown = "$$\n\\begin{equation}\nE = mc^2\n\\end{equation}\n$$\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "\\begin{equation}\nE = mc^2\n\\end{equation}\n"
    )
  })

  it("should convert strikethrough to org strike-through", () => {
    const markdown = "This is ~~gone~~ now.\n"

    expect(convertMarkdownToOrg(markdown)).toBe("This is +gone+ now.\n")
  })

  it("should convert footnotes to org footnotes", () => {
    const markdown = "A claim.[^1]\n\n[^1]: The evidence.\n"

    expect(convertMarkdownToOrg(markdown)).toBe(
      "A claim.[fn:1]\n\n[fn:1] The evidence.\n"
    )
  })

  it("should add heading:: property drawers with the logseq preset", () => {
    const markdown = "# Hello World\n\nThis is a paragraph."
    const expectedOrgMode = `* Hello World
:PROPERTIES:
:heading: 1
:END:
** This is a paragraph.
`

    const orgOutput = convertMarkdownToOrg(markdown, { preset: logseq() })

    expect(orgOutput).toBe(expectedOrgMode)
  })

  it("should convert markdown with various features with the logseq preset", () => {
    const markdown = `
# Features Test

This is *italic* and **bold** text.

Visit [Example](https://example.com).

- Unordered Item 1
- Unordered Item 2

- [ ] Todo Item
- [X] Done Item
`
    const expectedOrgMode = `* Features Test
:PROPERTIES:
:heading: 1
:END:
** This is /italic/ and *bold* text.
** Visit [[https://example.com][Example]].
- Unordered Item 1
- Unordered Item 2
- [ ] Todo Item
- [X] Done Item
`

    const orgOutput = convertMarkdownToOrg(markdown, { preset: logseq() })

    expect(orgOutput).toBe(expectedOrgMode)
  })
})

describe("recordStyle", () => {
  it("should record the source bullet marker as a MORG_MARKDOWN_STYLE keyword", () => {
    const orgOutput = convertMarkdownToOrg("* item\n* other\n", {
      recordStyle: true
    })

    expect(orgOutput).toContain('#+MORG_MARKDOWN_STYLE: {"bullet":"*"}')
  })

  it("should record the source emphasis and strong markers", () => {
    const orgOutput = convertMarkdownToOrg("_soft_ and __loud__\n", {
      recordStyle: true
    })

    expect(orgOutput).toContain(
      '#+MORG_MARKDOWN_STYLE: {"emphasis":"_","strong":"_"}'
    )
  })

  it("should record the source fence marker", () => {
    const orgOutput = convertMarkdownToOrg("~~~js\ncode()\n~~~\n", {
      recordStyle: true
    })

    expect(orgOutput).toContain('#+MORG_MARKDOWN_STYLE: {"fence":"~"}')
  })

  it("should record the thematic break marker and its repetition", () => {
    const orgOutput = convertMarkdownToOrg(`${"_".repeat(70)}\n`, {
      recordStyle: true
    })

    expect(orgOutput).toContain(
      '#+MORG_MARKDOWN_STYLE: {"rule":"_","ruleRepetition":70}'
    )
  })

  it("should not record a marker the source uses inconsistently", () => {
    const warnings: string[] = []

    const orgOutput = convertMarkdownToOrg("* item\n\n\n- other\n", {
      recordStyle: true,
      onWarning: message => warnings.push(message)
    })

    expect(orgOutput).not.toContain("#+MORG_MARKDOWN_STYLE:")
    expect(warnings).toEqual([
      "bullet marker is not used consistently; not recorded"
    ])
  })
})
