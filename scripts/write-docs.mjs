// Runs before every Web UI build and dev server start (`prebuild:web`,
// `predev:web`): renders docs/ and CONTEXT.md as site pages into
// web/docs/, which web/vite.config.ts builds along with the other pages.
// Why rendered at build time, not committed: docs/adr/0009-docs-on-the-site.md.
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { dirname, join } from "node:path"
import process from "node:process"
import { indexPage, pagePath, pageTitle, renderPage } from "./docsPages.mjs"

const files = [
  ...readdirSync("docs", { recursive: true })
    .filter(file => file.endsWith(".md"))
    .map(file => join("docs", file))
    .sort(),
  "CONTEXT.md"
]
const published = new Set(files)

rmSync("web/docs", { recursive: true, force: true })
// docs/README.md is linked to, as the index, but not rendered: the
// index is generated
const pages = files
  .filter(file => file !== "docs/README.md")
  .map(file => {
    const markdown = readFileSync(file, "utf8")
    return { file, markdown, title: pageTitle(markdown) }
  })
for (const { file, markdown } of pages) {
  const { html } = await renderPage(file, markdown, published, pages)
  write(pagePath(file), html)
}
write("docs/index.html", indexPage(pages))
process.stdout.write(`web/docs/: ${pages.length} pages\n`)

function write(path, html) {
  mkdirSync(dirname(join("web", path)), { recursive: true })
  writeFileSync(join("web", path), html)
}
