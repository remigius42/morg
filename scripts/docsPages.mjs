import { posix } from "node:path"
import rehypeShiki from "@shikijs/rehype"
import rehypeSlug from "rehype-slug"
import rehypeStringify from "rehype-stringify"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"

const repository = "https://github.com/remigius42/morg/"
const site = "https://morg.binarypoetry.ch/"

/**
 * Code blocks are highlighted at build time in binarypoetry.ch's theme
 * pair, its light theme's colors that fail contrast replaced as it does
 * by the brand's. `light-dark()` follows the `color-scheme` Pico sets
 * for the theme toggle, and the block keeps Pico's own background and
 * text color, which the transformer leaves in place by dropping
 * Shiki's. A language not loaded here stays plain.
 */
const highlighting = {
  themes: { light: "light-plus", dark: "synthwave-84" },
  colorReplacements: {
    "light-plus": {
      "#267f99": "var(--theme-color)",
      "#098658": "var(--theme-color-2)",
      "#e50000": "var(--theme-color)"
    }
  },
  defaultColor: "light-dark()",
  langs: ["bash", "markdown", "org", "toml", "yaml"],
  fallbackLanguage: "text",
  transformers: [{ pre: node => void delete node.properties.style }]
}

/**
 * Where a published Markdown file lands on the site, relative to the
 * site root: `docs/` keeps its layout, a folder's README becomes its
 * index, and CONTEXT.md, outside `docs/`, joins it as the glossary.
 * docs/README.md becomes the docs index, which the site generates
 * (`indexPage`) rather than renders.
 * @param {string} file repository-relative path of a Markdown file
 * @returns {string}
 */
export function pagePath(file) {
  if (file === "CONTEXT.md") return "docs/context.html"
  return file
    .replace(/(^|\/)README\.md$/, "$1index.md")
    .replace(/\.md$/, ".html")
}

/**
 * Renders one published Markdown file as a site page.
 * @param {string} file repository-relative path of the file
 * @param {string} markdown its content
 * @param {Set<string>} published repository-relative paths of every
 *   published file, which a link to stays on the site; a link to
 *   anything else in the repository goes to GitHub
 * @returns {Promise<{ title: string, html: string }>}
 */
export async function renderPage(file, markdown, published) {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown)
  const title = toText(tree.children.find(node => node.type === "heading"))
  rewriteLinks(tree, file, published)
  // the docs are this repository's own, so their HTML is kept as
  // written, as GitHub shows it, rather than dropped as untrusted
  const hast = await unified()
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeShiki, highlighting)
    .use(() => scrollTables)
    .run(tree)
  const body = unified()
    .use(rehypeStringify, { allowDangerousHtml: true })
    .stringify(hast)
  return { title, html: page(pagePath(file), title, body) }
}

/**
 * The docs index: every page by title, a folder's pages nested under
 * its own index page.
 * @param {{ file: string, title: string }[]} pages the pages to list,
 *   the docs index itself not among them
 * @returns {string}
 */
export function indexPage(pages) {
  const at = "docs/index.html"
  const href = file => posix.relative(posix.dirname(at), pagePath(file))
  const item = ({ file, title }) =>
    `<li><a href="${href(file)}">${escape(title)}</a></li>`
  const inFolder = ({ file }) =>
    file.startsWith("docs/") && posix.dirname(file) !== "docs"
  const top = pages.filter(p => !inFolder(p))
  const folders = Object.groupBy(pages.filter(inFolder), ({ file }) =>
    posix.dirname(file)
  )
  const nested = Object.entries(folders).map(([folder, inside]) => {
    const readme = inside.find(({ file }) => file === `${folder}/README.md`)
    const rest = inside
      .filter(p => p !== readme)
      .map(item)
      .join("\n")
    const label = readme
      ? `<a href="${href(readme.file)}">${escape(readme.title)}</a>`
      : escape(folder)
    return `<li>${label}<ul>\n${rest}\n</ul></li>`
  })
  const list = [...top.map(item), ...nested]
  return page(
    at,
    "Documentation",
    `<h1>Documentation</h1>\n<ul>\n${list.join("\n")}\n</ul>`
  )
}

/**
 * Points each relative link at what it names on the site: another
 * published file's page, or, for any other file of the repository,
 * GitHub's view of it. A link with a scheme or only a fragment stays.
 */
function rewriteLinks(node, file, published) {
  if (
    (node.type === "link" || node.type === "definition") &&
    isRelative(node.url)
  ) {
    node.url = siteUrl(node.url, file, published)
  }
  for (const child of node.children ?? []) rewriteLinks(child, file, published)
}

function isRelative(url) {
  return !/^([a-z][a-z\d+.-]*:|#|\/)/i.test(url)
}

function siteUrl(url, file, published) {
  const [path, fragment] = url.split(/(?=#)/)
  const target = posix.normalize(posix.join(posix.dirname(file), path))
  const readme = posix.join(target, "README.md")
  const doc = [target, readme].find(candidate => published.has(candidate))
  const resolved = doc
    ? posix.relative(posix.dirname(pagePath(file)), pagePath(doc))
    : `${repository}${path.endsWith("/") ? "tree" : "blob"}/main/${target}`
  return resolved + (fragment ?? "")
}

/**
 * Lets a table wider than the page scroll on its own, the scroll area
 * focusable so a keyboard can scroll it, as Shiki makes a code block.
 */
function scrollTables(node) {
  if (!node.children) return
  node.children = node.children.map(child => {
    scrollTables(child)
    return child.type === "element" && child.tagName === "table"
      ? {
          type: "element",
          tagName: "div",
          properties: { className: ["overflow-auto"], tabIndex: 0 },
          children: [child]
        }
      : child
  })
}

function toText(node) {
  return node?.value ?? node?.children?.map(toText).join("") ?? ""
}

function escape(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function page(at, title, body) {
  return `<!doctype html>
<html lang="en">
  <head>
    <!-- chrome:head -->
    <title>morg: ${escape(title)}</title>
    <link rel="canonical" href="${site}${at}" />
  </head>
  <body>
    <!-- chrome:header -->
    <div class="container docs">
      <main>
${body}
      </main>
    </div>
    <!-- chrome:footer -->
    <script type="module" src="/src/site.ts"></script>
  </body>
</html>
`
}
