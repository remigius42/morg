import { describe, it, expect } from "vitest"
import { convertMarkdownToOrg } from "../../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../../src/orgToMarkdown.js"
import { obsidian } from "../../src/presets/obsidian.js"
import { logseq } from "../../src/presets/logseq.js"

describe("obsidian preset", () => {
  it("should convert org fuzzy links to wikilinks", () => {
    const org = "See [[Some Page]] and [[Other Page][an alias]].\n"

    expect(convertOrgToMarkdown(org, { preset: obsidian() })).toBe(
      "See [[Some Page]] and [[Other Page|an alias]].\n"
    )
  })

  it("should convert aliased wikilinks to org link descriptions", () => {
    const markdown = "See [[Some Page]] and [[Other Page|an alias]].\n"

    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(
      "See [[Some Page]] and [[Other Page][an alias]].\n"
    )
  })

  it("wikilinks converge after one round trip", () => {
    const markdown = "A [[Page]] and [[Other|alias]] in text.\n"
    const roundTrip = (md: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(md, { preset: obsidian() }), {
        preset: obsidian()
      })
    const once = roundTrip(markdown)
    expect(roundTrip(once)).toBe(once)
    expect(once).toContain("[[Page]]")
  })

  it("escapes the alias pipe of a wikilink inside a table cell", () => {
    // Obsidian's own convention; a bare | would split the cell
    const org = "| a |\n|-|\n| [[Page][alias]] |\n"
    const markdown = convertOrgToMarkdown(org, { preset: obsidian() })

    expect(markdown).toBe(
      "| a               |\n| --------------- |\n| [[Page\\|alias]] |\n"
    )
    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(org)
  })

  it("keeps underscores in a wikilink alias out of org scripts", () => {
    const markdown = "[[a_b.md|a_b]]\n"

    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(
      "#+OPTIONS: ^:{}\n[[a_b.md][a_b]]\n"
    )
  })

  it("keeps relative markdown links as links, not wikilinks", () => {
    const markdown = "[t](file.md) and [[Page]]\n"
    const org = convertMarkdownToOrg(markdown, { preset: obsidian() })

    expect(convertOrgToMarkdown(org, { preset: obsidian() })).toBe(markdown)
  })

  it("keeps a link to a heading a Markdown link, not a wikilink", () => {
    const markdown =
      "## General plugins\n\nSee [the plugins](#general-plugins).\n"
    const org = convertMarkdownToOrg(markdown, { preset: obsidian() })

    expect(convertOrgToMarkdown(org, { preset: obsidian() })).toBe(markdown)
  })

  it("keeps an embed's size, not reading it as an alias", () => {
    const markdown = "An ![[image.png|300]] and [[Page|alias]].\n"

    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(
      "An ![[image.png|300]] and [[Page][alias]].\n"
    )
  })

  it("writes an embed unescaped", () => {
    const org = "![[image.png]] and ![[image.png|300]]\n"

    expect(convertOrgToMarkdown(org, { preset: obsidian() })).toBe(org)
  })

  it("reads an image's size as its #+ATTR_HTML: line (ADR 0007)", () => {
    const markdown = "![a|300](img.png)\n\n> ![|300x200](b.png)\n"
    const org =
      "#+ATTR_HTML: :width 300\n[[file:img.png][a]]\n\n" +
      "#+begin_quote\n#+ATTR_HTML: :width 300 :height 200\n[[file:b.png]]\n#+end_quote\n"

    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(org)
    expect(convertOrgToMarkdown(org, { preset: obsidian() })).toBe(markdown)
  })

  it("writes its own size spelling over the html one", () => {
    const org = "#+ATTR_HTML: :width 300\n[[file:img.png][a]]\n"

    expect(
      convertOrgToMarkdown(org, { preset: obsidian(), spelling: "html" })
    ).toBe("![a|300](img.png)\n")
  })

  it("keeps a size Obsidian cannot spell, or an image in text, as written", () => {
    for (const org of [
      "#+ATTR_HTML: :height 200\n[[file:img.png]]\n",
      "#+ATTR_HTML: :width 50%\n[[file:img.png]]\n",
      "- x\n  #+ATTR_HTML: :width 300\n  [[file:img.png]]\n"
    ]) {
      expect(convertOrgToMarkdown(org, { preset: obsidian() })).toContain(
        "#+ATTR_HTML"
      )
    }
    expect(
      convertMarkdownToOrg("A ![a|300](img.png) b\n\n- ![c|3](d.png)\n", {
        preset: obsidian()
      })
    ).toBe("A [[file:img.png][a|300]] b\n\n- [[file:d.png][c|3]]\n")
  })

  it("reads a comment as an org comment, inline as an html snippet", () => {
    const markdown = "%%alone%%\n\na %%hidden%% b `%%code%%`\n\n%%\nblock\n%%\n"

    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(
      "# alone\na @@html:<!--hidden-->@@ b ~%%code%%~\n\n# block\n"
    )
  })

  it("reads a comment starting a line's text as an html snippet", () => {
    expect(
      convertMarkdownToOrg(
        "%%c%% seen\n\n- %%d%%\n\nx[^1]\n\n[^1]: %%e%% note\n",
        { preset: obsidian() }
      )
    ).toBe(
      "@@html:<!--c-->@@ seen\n\n- @@html:<!--d-->@@\nx[fn:1]\n\n[fn:1] @@html:<!--e-->@@ note\n"
    )
  })

  it("reads an inline comment's lines as one, its --> escaped", () => {
    expect(
      convertMarkdownToOrg("a %%x\n\n* y-->z%% b\n", { preset: obsidian() })
    ).toBe("a @@html:<!--x * y--&gt;z-->@@ b\n")
  })

  it("keeps a comment outside text as written", () => {
    expect(
      convertMarkdownToOrg(
        "[a](http://x.org/%%u%%) [[P %%w%%]]\n\n> [!note] T %%c%%\n",
        {
          preset: obsidian()
        }
      )
    ).toBe(
      "[[http://x.org/%%u%%][a]] [[P %%w%%]]\n\n#+begin_note T %%c%%\n#+end_note\n"
    )
  })

  it("reads a comment alone in a footnote definition as a snippet", () => {
    expect(
      convertMarkdownToOrg("x[^1]\n\n[^1]: %%e%%\n", { preset: obsidian() })
    ).toBe("x[fn:1]\n\n[fn:1] @@html:<!--e-->@@\n")
  })

  it("reads an inline footnote starting with a wikilink", () => {
    expect(
      convertMarkdownToOrg("a^[[[Source]] p. 4] b\n", { preset: obsidian() })
    ).toBe("a[fn:1] b\n\n[fn:1] [[Source]] p. 4\n")
  })

  // linear, but CI's coverage slows it past the default 5 s
  it("reads a long comment", { timeout: 30_000 }, () => {
    const body = "x".repeat(200_000)

    expect(
      convertMarkdownToOrg(`a %%${body}%% b\n`, { preset: obsidian() })
    ).toBe(`a @@html:<!--${body}-->@@ b\n`)
  })

  it("writes an html snippet of comments and text as it is", () => {
    const org = "x @@html:<!--a-->b<!--c-->@@ y\n"

    expect(convertOrgToMarkdown(org, { preset: obsidian() })).toBe(
      "x <!--a-->b<!--c--> y\n"
    )
  })

  it("keeps a diary timestamp's %% no comment", () => {
    const org =
      "* a\nSCHEDULED: <%%(diary-float t 4 2)>\n* b\nSCHEDULED: <%%(diary-float t 4 3)>\n"
    const markdown = convertOrgToMarkdown(org, { preset: obsidian() })

    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(org)
  })

  it("reads an inline footnote as a footnote, numbered on", () => {
    const markdown = "a^[note *x*] b[^1] `^[code]`\n\n[^1]: one\n"

    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(
      "a[fn:2] b[fn:1] ~^[code]~\n\n[fn:1] one\n[fn:2] note /x/\n"
    )
  })

  it("reads a comment in an inline footnote into its definition", () => {
    expect(
      convertMarkdownToOrg("x^[a %%c%% b] y\n", { preset: obsidian() })
    ).toBe("x[fn:1] y\n\n[fn:1] a @@html:<!--c-->@@ b\n")
  })

  it("numbers inline footnotes on the page, not per Logseq block", () => {
    const org = convertMarkdownToOrg(
      "# H\n\na^[one] %%c%%\n\n# I\n\nb^[two]\n",
      { inputPreset: obsidian(), outputPreset: logseq() }
    )

    expect(org).toContain("a[fn:1] @@html:<!--c-->@@\n")
    expect(org).toContain("b[fn:2]\n\n[fn:2] two\n")
  })

  it("writes an html snippet's comment as Obsidian's", () => {
    // `<!--` starting the item's line would open an HTML block
    const org = "- @@html:<!--c-->@@ seen @@html:<!--x--&gt;%%-->@@\n"
    const markdown = "- %%c%% seen <!--x--&gt;%%-->\n"

    expect(convertOrgToMarkdown(org, { preset: obsidian() })).toBe(markdown)
    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(org)
  })

  it("carries a Logseq query in its own code block", () => {
    // Obsidian runs a `query` code block as its search
    const org = "* a\n#+BEGIN_QUERY\n{:q 1}\n#+END_QUERY\n"
    const markdown = convertOrgToMarkdown(org, {
      inputPreset: logseq(),
      outputPreset: obsidian()
    })
    expect(markdown).toBe("- a\n\n  ```logseq-query\n  {:q 1}\n  ```\n")
    expect(
      convertMarkdownToOrg(markdown, {
        inputPreset: obsidian(),
        outputPreset: logseq()
      })
    ).toBe("* a\n\n#+BEGIN_QUERY\n{:q 1}\n#+END_QUERY\n")
    // without Logseq too
    const vanilla = "#+begin_query\n{:q 1}\n#+end_query\n"
    expect(convertOrgToMarkdown(vanilla, { preset: obsidian() })).toBe(
      "```logseq-query\n{:q 1}\n```\n"
    )
    // Obsidian's own query stays code
    expect(
      convertMarkdownToOrg("```query\ntag:#a\n```\n", {
        inputPreset: obsidian(),
        outputPreset: logseq()
      })
    ).toBe("* #+BEGIN_SRC query\ntag:#a\n#+END_SRC\n")
    expect(
      convertOrgToMarkdown("#+begin_src query\ntag:#a\n#+end_src\n", {
        preset: obsidian()
      })
    ).toBe("```query\ntag:#a\n```\n")
  })

  it("keeps a named Logseq query's name and body apart", () => {
    const org = "#+NAME: q\n#+begin_query\n{:q 1}\n#+end_query\n"
    const markdown = convertOrgToMarkdown(org, { preset: obsidian() })

    expect(markdown).toBe("#+NAME: q\n\n```logseq-query\n{:q 1}\n```\n")
    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(
      "#+NAME: q\n#+begin_QUERY\n{:q 1}\n#+end_QUERY\n"
    )
  })

  it("comments and inline footnotes converge after one round trip", () => {
    const roundTrip = (md: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(md, { preset: obsidian() }), {
        preset: obsidian()
      })
    const once = roundTrip("a %%c%% b^[n]\n\n%%\nblock\n%%\n")
    expect(roundTrip(once)).toBe(once)
    expect(once).toBe("a %%c%% b[^1]\n\n<!-- block -->\n\n[^1]: n\n")
  })
})

describe("obsidian callouts", () => {
  const both = (org: string, markdown: string): void => {
    expect(convertOrgToMarkdown(org, { preset: obsidian() })).toBe(markdown)
    expect(convertMarkdownToOrg(markdown, { preset: obsidian() })).toBe(org)
  }

  it("write an alert's type lower case, as Obsidian does", () => {
    both("#+begin_note\nb\n#+end_note\n", "> [!note]\n>\n> b\n")
  })

  it("keep folding as the parameters' leading token", () => {
    both(
      "#+begin_tip - Stretch first\nb\n#+end_tip\n",
      "> [!tip]- Stretch first\n>\n> b\n"
    )
    both("#+begin_faq +\nb\n#+end_faq\n", "> [!faq]+\n>\n> b\n")
    // a known limit: a title starting `- ` comes back folded
    expect(convertMarkdownToOrg("> [!tip] - T\n", { preset: obsidian() })).toBe(
      "#+begin_tip - T\n#+end_tip\n"
    )
  })

  it("nest as callouts", () => {
    both(
      "#+begin_note\n#+begin_tip -\nx\n#+end_tip\n#+end_note\n",
      "> [!note]\n>\n> > [!tip]-\n> >\n> > x\n"
    )
  })

  it("leave an alert in org text org text", () => {
    for (const org of [
      "#+begin_center\n#+begin_note\nx\n#+end_note\n#+end_center\n",
      "* H\n:LOGBOOK:\n#+begin_note\nx\n#+end_note\n:END:\n"
    ]) {
      expect(convertOrgToMarkdown(org, { preset: obsidian() })).toContain(
        "#+begin_note\n"
      )
    }
  })

  it("fold only in Obsidian Markdown", () => {
    // no alert elsewhere: the marker's `]` is followed by no space
    expect(convertMarkdownToOrg("> [!tip]- T\n")).toBe(
      "#+begin_quote\n[!tip]- T\n#+end_quote\n"
    )
  })
})
