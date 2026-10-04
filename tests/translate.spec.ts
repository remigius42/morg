import { describe, it, expect } from "vitest"
import { translateMarkdown, translateOrg } from "../src/translate.js"
import { logseq } from "../src/presets/logseq.js"
import { obsidian } from "../src/presets/obsidian.js"

const TODO_LINE =
  "#+TODO: TODO NOW LATER DOING WAIT WAITING IN-PROGRESS STARTED | DONE CANCELED CANCELLED"

describe("translateOrg", () => {
  it("writes Logseq org's headlines as Emacs reads them", () => {
    const org = "* a\n*\n** #+BEGIN_SRC sh\necho\n#+END_SRC\n"

    expect(translateOrg(org, { inputPreset: logseq() })).toBe(
      "* a\n* \n** \n#+BEGIN_SRC sh\necho\n#+END_SRC\n"
    )
  })

  it("writes Vanilla org's headlines as Logseq org does", () => {
    const org =
      "#+title: P\n\n* \n** \n| a |\n| b |\n* 1. Which\n* DONE x :tag:\n  :PROPERTIES:\n  :ID:       1\n  :END:\n"

    expect(translateOrg(org, { outputPreset: logseq() })).toBe(
      "#+title: P\n\n*\n** | a |\n| b |\n* 1. Which\n* DONE x :tag:\n  :PROPERTIES:\n  :ID:       1\n  :END:\n"
    )
  })

  it("names Logseq's task markers for Emacs in a #+TODO: line", () => {
    const org = "#+title: P\n#+tags: a\n\n* DOING x\n* TODO y\n"

    expect(translateOrg(org, { inputPreset: logseq() })).toBe(
      `#+title: P\n#+tags: a\n${TODO_LINE}\n\n* DOING x\n* TODO y\n`
    )
    expect(translateOrg("* TODO y\n", { inputPreset: logseq() })).toBe(
      "* TODO y\n"
    )
  })

  it("writes no #+TODO: line for markers the page declares", () => {
    const org = "#+SEQ_TODO: TODO STARTED(s) | DONE\n* STARTED x\n"

    expect(translateOrg(org, { inputPreset: logseq() })).toBe(org)
  })

  it("drops the #+TODO: line it writes for Logseq org", () => {
    const org = `#+title: P\n${TODO_LINE}\n\n* DOING x\n`

    expect(translateOrg(org, { outputPreset: logseq() })).toBe(
      "#+title: P\n\n* DOING x\n"
    )
  })

  it("keeps an own #+TODO: line, warning of markers Logseq shows as text", () => {
    const warnings: string[] = []
    const org =
      "#+TODO: TODO NEXT(n) | DONE\n#+seq_todo: WAIT | KILL\n* NEXT x\n"

    expect(
      translateOrg(org, {
        outputPreset: logseq(),
        onWarning: m => warnings.push(m)
      })
    ).toBe(org)
    expect(warnings).toEqual([
      "Logseq reads no #+TODO: line; it shows NEXT as text",
      "Logseq reads no #+TODO: line; it shows KILL as text"
    ])
  })

  it("folds a collapsed block for Emacs", () => {
    const org = "* a\n:PROPERTIES:\n:collapsed: true\n:END:\n** b\n"

    expect(translateOrg(org, { inputPreset: logseq() })).toBe(
      "* a\n:PROPERTIES:\n:VISIBILITY: folded\n:END:\n** b\n"
    )
  })

  it("collapses a folded block for Logseq, warning of other visibility", () => {
    const warnings: string[] = []
    const org =
      "* a\n  :properties:\n  :Visibility: folded\n  :end:\n* b\n  :PROPERTIES:\n  :VISIBILITY: children\n  :END:\n"

    expect(
      translateOrg(org, {
        outputPreset: logseq(),
        onWarning: m => warnings.push(m)
      })
    ).toBe(
      "* a\n  :properties:\n  :collapsed: true\n  :end:\n* b\n  :PROPERTIES:\n  :VISIBILITY: children\n  :END:\n"
    )
    expect(warnings).toEqual([
      "Logseq has no VISIBILITY children; kept as a property"
    ])
  })

  it("warns of Emacs constructs Logseq misreads, once per kind", () => {
    const warnings: string[] = []
    const org = [
      "#+title: T",
      "* a",
      "[[*H][l]] [[#cid]] [[*H2]] [[id:u]] [[id:u][block ref]] <<<r>>> <<t>>",
      "#+NAME: tbl",
      "| x |",
      "#+BEGIN_SRC org",
      "[[*in code]] <<<in code>>>",
      "#+END_SRC",
      ""
    ].join("\n")

    expect(
      translateOrg(org, {
        outputPreset: logseq(),
        onWarning: m => warnings.push(m)
      })
    ).toBe(org)
    expect(warnings).toEqual([
      "Logseq reads 3 [[*heading]] or [[#custom-id]] links as refs to pages of that name",
      "Logseq reads 1 [[id:…]] link without a label as a ref to a page of that name",
      "Logseq misreads 1 <<<radio>>> target",
      "Logseq takes 1 #+KEY: line below the first headline for a page property"
    ])
  })

  it("keeps an empty page empty", () => {
    expect(translateOrg("", { inputPreset: logseq() })).toBe("")
  })

  it("points to normalizeOrg for one dialect on both sides", () => {
    expect(() => translateOrg("* a\n")).toThrow(
      "for 'vanilla' on both sides, use normalizeOrg"
    )
    expect(() => translateOrg("* a\n", { preset: logseq() })).toThrow(
      "for 'logseq' on both sides, use normalizeOrg"
    )
  })
})

describe("translateMarkdown", () => {
  it("writes Logseq md's blocks as a Vanilla md list", () => {
    const markdown =
      "- TODO a\n  SCHEDULED: <2026-10-04 Sun>\n\t- ## b\n\t  text *x* [[Page]]\n- c\n  id:: 1\n"

    expect(translateMarkdown(markdown, { inputPreset: logseq() })).toBe(
      "- [ ] a\n  scheduled:: <2026-10-04 Sun>\n  - ## b\n    text *x* [[Page]]\n- c\n  id:: 1\n"
    )
  })

  it("writes page properties as frontmatter and back", () => {
    const logseqMarkdown = "title:: P\ntags:: a, b\nnum:: 01234\n\n- a\n"
    const vanilla = '---\ntitle: P\ntags: a, b\nnum: "01234"\n---\n\n- a\n'

    expect(translateMarkdown(logseqMarkdown, { inputPreset: logseq() })).toBe(
      vanilla
    )
    expect(translateMarkdown(vanilla, { outputPreset: logseq() })).toBe(
      logseqMarkdown
    )
  })

  it("keeps frontmatter Logseq reads no property from", () => {
    const vanilla = "---\ntitle: P\nnested:\n  k: v\n---\n\n- a\n"

    expect(translateMarkdown(vanilla, { outputPreset: logseq() })).toBe(
      "---\nnested:\n  k: v\n---\ntitle:: P\n\n- a\n"
    )
  })

  it("reads a rule that a Vanilla md list ends in as a rule block", () => {
    expect(translateMarkdown("- a\n- ---\n", { outputPreset: logseq() })).toBe(
      "- a\n- ---\n"
    )
  })

  it("writes Logseq md's org blocks as Markdown does", () => {
    const markdown = [
      "- a",
      "  #+BEGIN_SRC sh",
      "  echo *x*",
      "  #+END_SRC",
      "- #+BEGIN_QUOTE",
      "  q **b**",
      "  #+END_QUOTE",
      "- #+BEGIN_QUERY",
      "  {:q 1}",
      "  #+END_QUERY",
      "- #+begin_example",
      "  ex",
      "  #+end_example",
      "- #+BEGIN_NOTE",
      "  n",
      "  #+END_NOTE",
      ""
    ].join("\n")

    expect(translateMarkdown(markdown, { inputPreset: logseq() })).toBe(
      [
        "- a",
        "  ```sh",
        "  echo *x*",
        "  ```",
        "- > q **b**",
        "- ```query",
        "  {:q 1}",
        "  ```",
        "- ```",
        "  ex",
        "  ```",
        "- #+BEGIN_NOTE",
        "  n",
        "  #+END_NOTE",
        ""
      ].join("\n")
    )
  })

  it("writes a query code block as Logseq md's query block", () => {
    const markdown =
      "- a\n  ```query\n  {:q 1}\n  ```\n- ```sh\n  echo\n  ```\n"

    expect(translateMarkdown(markdown, { outputPreset: logseq() })).toBe(
      "- a\n  #+BEGIN_QUERY\n  {:q 1}\n  #+END_QUERY\n- ```sh\n  echo\n  ```\n"
    )
  })

  it("reads a list item's content from its content column", () => {
    expect(
      translateMarkdown("1.  a\n    1.  b\n", { outputPreset: logseq() })
    ).toBe(
      "- a\n  logseq.order-list-type:: number\n\t- b\n\t  logseq.order-list-type:: number\n"
    )
  })

  it("drops a block's common indentation", () => {
    expect(
      translateMarkdown("-  → a\n\t-  ```\n\t   x\n\t   ```\n", {
        inputPreset: logseq()
      })
    ).toBe("- → a\n  - ```\n    x\n    ```\n")
  })

  it("reads text after a list from its own column", () => {
    expect(
      translateMarkdown("1. a\n\n  > q\n  > r\n", { outputPreset: logseq() })
    ).toBe("- a\n  logseq.order-list-type:: number\n- > q\n  > r\n")
  })

  it("maps Obsidian's wikilinks to Logseq's page refs and back", () => {
    const obsidianMarkdown =
      "- See [[P|a]] and [[Q]], not `[[P|code]]`\n- ```\n  [[P|fenced]]\n  ```\n"
    const logseqMarkdown =
      "- See [a]([[P]]) and [[Q]], not `[[P|code]]`\n- ```\n  [[P|fenced]]\n  ```\n"

    expect(
      translateMarkdown(obsidianMarkdown, {
        inputPreset: obsidian(),
        outputPreset: logseq()
      })
    ).toBe(logseqMarkdown)
    expect(
      translateMarkdown(logseqMarkdown, {
        inputPreset: logseq(),
        outputPreset: obsidian()
      })
    ).toBe(obsidianMarkdown)
  })

  it("writes Obsidian's comments as HTML comments", () => {
    const markdown = "a %%hidden%% b `%%code%%`\n\n%%\nblock\n%%\n"

    expect(translateMarkdown(markdown, { inputPreset: obsidian() })).toBe(
      "a <!--hidden--> b `%%code%%`\n\n<!--\nblock\n-->\n"
    )
  })

  it("writes Obsidian's inline footnotes as footnotes", () => {
    const markdown = "a^[note [x](u)] b[^1] `^[code]`\n\n[^1]: one\n"

    expect(translateMarkdown(markdown, { inputPreset: obsidian() })).toBe(
      "a[^2] b[^1] `^[code]`\n\n[^1]: one\n\n[^2]: note [x](u)\n"
    )
  })

  it("translates Obsidian md to Logseq md through Vanilla md", () => {
    expect(
      translateMarkdown("- a %%c%% b^[n] [[P|x]]\n", {
        inputPreset: obsidian(),
        outputPreset: logseq()
      })
    ).toBe("- a <!--c--> b[^1] [x]([[P]])\n  \n  [^1]: n\n")
  })

  it("writes and reads planning under the orgismKeys names", () => {
    const logseqMarkdown = "- a\n  SCHEDULED: <2026-10-04 Sun>\n"
    const vanilla = "- a\n  due:: <2026-10-04 Sun>\n"
    const orgismKeys = { scheduled: "due" }

    expect(
      translateMarkdown(logseqMarkdown, { inputPreset: logseq(), orgismKeys })
    ).toBe(vanilla)
    expect(
      translateMarkdown(vanilla, { outputPreset: logseq(), orgismKeys })
    ).toBe(logseqMarkdown)
  })

  it("keeps Obsidian's sized embeds, and reads a table's escaped alias pipe", () => {
    expect(
      translateMarkdown("- see ![[img.png|300]]\n- | [[P\\|a]] |\n", {
        inputPreset: obsidian(),
        outputPreset: logseq()
      })
    ).toBe("- see ![[img.png|300]]\n- | [a]([[P]]) |\n")
  })

  it("translates Obsidian comments and footnotes that hold code", () => {
    expect(
      translateMarkdown("a %% fix `foo()` later %% b^[see `x`] `%%`\n", {
        inputPreset: obsidian()
      })
    ).toBe("a <!-- fix `foo()` later --> b[^1] `%%`\n\n[^1]: see `x`\n")
  })

  it("writes the bullets a markdownStyle names", () => {
    expect(
      translateMarkdown("- a\n\t- b\n", {
        inputPreset: logseq(),
        markdownStyle: { bullet: "*" }
      })
    ).toBe("* a\n  * b\n")
  })

  it("keeps the bullet Logseq md's blocks need, and says so", () => {
    const warnings: string[] = []
    expect(
      translateMarkdown("* a\n  * b\n", {
        outputPreset: logseq(),
        markdownStyle: { bullet: "*" },
        onWarning: m => warnings.push(m)
      })
    ).toBe("- a\n\t- b\n")
    expect(warnings).toEqual([
      "logseq Markdown writes its blocks with '-'; bullet '*' not applied"
    ])
  })

  it("writes the emphasis and strong markers a markdownStyle names", () => {
    expect(
      translateMarkdown("- *a* and **b**, `*c*`, snake*case*word\n", {
        inputPreset: logseq(),
        markdownStyle: { emphasis: "_", strong: "_" }
      })
    ).toBe("- _a_ and __b__, `*c*`, snake*case*word\n")
  })

  it("writes the fence and rule markers a markdownStyle names", () => {
    expect(
      translateMarkdown("```sh\necho\n```\n\n---\n\n````\n~~~\n````\n", {
        inputPreset: obsidian(),
        markdownStyle: { fence: "~", rule: "_", ruleRepetition: 5 }
      })
    ).toBe("~~~sh\necho\n~~~\n\n_____\n\n````\n~~~\n````\n")
    expect(
      translateMarkdown("```\na\n`````\n", {
        inputPreset: obsidian(),
        markdownStyle: { fence: "~" }
      })
    ).toBe("~~~\na\n~~~~~\n")
  })
})
