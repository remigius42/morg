import { describe, expect, it } from "vitest"
// @ts-expect-error -- plain ESM helper, no declarations emitted for scripts/
import * as docsPages from "../../scripts/docsPages.mjs"

const { pagePath, renderPage, indexPage } = docsPages as {
  pagePath: (file: string) => string
  renderPage: (
    file: string,
    markdown: string,
    published: Set<string>
  ) => Promise<{ title: string; html: string }>
  indexPage: (pages: { file: string; title: string }[]) => string
}

const published = new Set([
  "CONTEXT.md",
  "docs/README.md",
  "docs/mappings.md",
  "docs/adr/README.md",
  "docs/adr/0001-x.md"
])
const render = (file: string, markdown: string) =>
  renderPage(file, markdown, published)

describe("pagePath", () => {
  it("keeps docs/'s layout, a README as its folder's index", () => {
    expect(pagePath("docs/mappings.md")).toBe("docs/mappings.html")
    expect(pagePath("docs/adr/README.md")).toBe("docs/adr/index.html")
    expect(pagePath("docs/README.md")).toBe("docs/index.html")
  })

  it("puts CONTEXT.md among the docs", () => {
    expect(pagePath("CONTEXT.md")).toBe("docs/context.html")
  })
})

describe("renderPage", () => {
  it("titles the page after its first heading", async () => {
    const { title, html } = await render(
      "docs/mappings.md",
      "# A `b` c\n\ntext"
    )

    expect(title).toBe("A b c")
    expect(html).toContain("<title>morg: A b c</title>")
    expect(html).toContain(
      `href="https://morg.binarypoetry.ch/docs/mappings.html"`
    )
  })

  it("links a published file to its page, fragment kept", async () => {
    const { html } = await render(
      "docs/adr/0001-x.md",
      "[a](../mappings.md#lists) [b](../../CONTEXT.md) [c](README.md)"
    )

    expect(html).toContain(`href="../mappings.html#lists"`)
    expect(html).toContain(`href="../context.html"`)
    expect(html).toContain(`href="index.html"`)
  })

  it("links a folder to its index page", async () => {
    const { html } = await render("docs/mappings.md", "[a](adr/) [b](adr)")

    expect(html.match(/href="adr\/index\.html"/g)).toHaveLength(2)
  })

  it("links a folder without a published README on GitHub", async () => {
    const { html } = await render("docs/mappings.md", "[a](../tests/fixtures/)")

    expect(html).toContain(
      `href="https://github.com/remigius42/morg/tree/main/tests/fixtures/"`
    )
  })

  it("links any other file of the repository on GitHub", async () => {
    const { html } = await render("docs/adr/0001-x.md", "[a](../../src/cli.ts)")

    expect(html).toContain(
      `href="https://github.com/remigius42/morg/blob/main/src/cli.ts"`
    )
  })

  it("leaves absolute links, fragments and code alone", async () => {
    const { html } = await render(
      "docs/mappings.md",
      "[a](https://x.org/y.md) [b](#z) `[c](d.md)` [e][f]\n\n[f]: mailto:g@h.i"
    )

    expect(html).toContain(`href="https://x.org/y.md"`)
    expect(html).toContain(`href="#z"`)
    expect(html).toContain("<code>[c](d.md)</code>")
    expect(html).toContain(`href="mailto:g@h.i"`)
  })

  it("anchors headings as GitHub does", async () => {
    const { html } = await render("docs/mappings.md", "## Org-only: `key::`")

    expect(html).toContain(`<h2 id="org-only-key">`)
  })

  it("lets a table scroll on its own, by keyboard too", async () => {
    const { html } = await render("docs/mappings.md", "| a |\n| - |\n| b |")

    expect(html).toContain(`<div class="overflow-auto" tabindex="0"><table>`)
  })
})

describe("renderPage's code blocks", () => {
  it("highlights a block in both color schemes", async () => {
    const { html } = await render("docs/mappings.md", "```org\n* TODO a\n```")

    expect(html).toContain(
      `<pre class="shiki shiki-themes light-plus synthwave-84"`
    )
    expect(html).toMatch(/style="color:light-dark\([^,]+, #[\dA-Fa-f]+\);/)
  })

  it("leaves the block's own colors to the site", async () => {
    const { html } = await render("docs/mappings.md", "```toml\na = 1\n```")

    expect(html).not.toMatch(/<pre [^>]*style=/)
  })

  it("leaves a block in a language it has not loaded plain", async () => {
    const { html } = await render("docs/mappings.md", "```cobol\nX\n```")

    expect(html).toContain("<pre")
    expect(html).toContain(">X<")
  })
})

describe("indexPage", () => {
  it("lists every page, a folder's nested under its index", () => {
    const html = indexPage([
      { file: "docs/README.md", title: "Documentation" },
      { file: "docs/adr/0001-x.md", title: "0001 & X" },
      { file: "docs/adr/README.md", title: "ADRs" },
      { file: "docs/mappings.md", title: "Mappings" },
      { file: "CONTEXT.md", title: "Context" }
    ])

    expect(html).toContain(`<li><a href="mappings.html">Mappings</a></li>`)
    expect(html).toContain(`<li><a href="context.html">Context</a></li>`)
    expect(html).toContain(
      `<li><a href="adr/index.html">ADRs</a><ul>\n<li><a href="adr/0001-x.html">0001 &amp; X</a></li>`
    )
    // the index is this page, not an entry on it
    expect(html).not.toContain(`href="index.html"`)
  })
})
