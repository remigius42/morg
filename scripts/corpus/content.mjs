// Counts the files whose round trip kept their content: per file x and
// its round trip b (roundtrip.sh's naming), the words of the text, code
// and keywords (case aside) and the link targets, link kind included,
// must be the same. A file can converge and still lose content once,
// on the first trip (a heading link turned into a file link, a block
// read back as text), which only this check sees. Prints one count,
// never contents; what differs per file lands in $WORK/content.txt.
//
//   printf '%s\0' notes/*.org | node scripts/corpus/content.mjs "$WORK"

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import console from "node:console"
import process from "node:process"
import { join } from "node:path"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkParse from "remark-parse"
import { unified } from "unified"
import uniorgParse from "uniorg-parse"
import { visit, SKIP } from "unist-util-visit"
// uniorg loses a table's keywords and throws on a `_.` line: read both
// files with morg's workarounds (this checkout's build)
import { separateTableKeywords } from "../../dist/core/tableKeywords.js"
import { guardUnderscoreBullets } from "../../dist/core/underscoreBullets.js"

const WORDS_RE = /[\p{L}\p{N}]+/gu
const words = text =>
  typeof text === "string" ? (text.toLowerCase().match(WORDS_RE) ?? []) : []

const markdownParser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter)

// percent-encoding a url's character keeps the url
function decoded(url) {
  try {
    return decodeURI(url)
  } catch {
    return url
  }
}

// a reference link counts as its definition's url, so inlining one
// changes nothing
function markdownContent(markdown) {
  const tree = markdownParser.parse(markdown)
  const definitions = new Map()
  visit(tree, "definition", node => {
    definitions.set(node.identifier, node.url)
  })
  const content = { words: [], links: [] }
  visit(tree, node => {
    if (node.type === "definition") {
      return SKIP
    }
    if (node.type === "link" || node.type === "image") {
      content.links.push(decoded(node.url))
    }
    if (node.type === "linkReference" || node.type === "imageReference") {
      const url = definitions.get(node.identifier)
      content.links.push(url === undefined ? node.label : decoded(url))
    }
    content.words.push(...words(node.alt), ...words(node.value))
  })
  return content
}

const orgParser = unified().use(uniorgParse)

const plainText = node =>
  node.value ?? (node.children ?? []).map(plainText).join("")

// a link without a description of its own shows its target: `[[url]]`,
// `[[url][url]]` and a plain `url` hold the same words
function orgContent(org) {
  const tree = orgParser.parse(
    separateTableKeywords(guardUnderscoreBullets(org))
  )
  const content = { words: [], links: [] }
  visit(tree, node => {
    if (node.type === "link") {
      content.links.push(`${node.linkType}:${node.path}`)
      const description = plainText(node)
      if (["", node.rawLink, node.path].includes(description)) {
        content.words.push(...words(node.path))
        return SKIP
      }
    }
    // affiliated keywords (`#+NAME:`, `#+RESULTS:`) sit on the element
    for (const [key, value] of Object.entries(node.affiliated ?? {})) {
      const text = [value]
        .flat(Infinity)
        .map(item => (typeof item === "string" ? item : plainText(item)))
      content.words.push(...words(key), ...text.flatMap(words))
    }
    if (node.type === "headline") {
      content.words.push(
        ...words(node.todoKeyword),
        ...node.tags.flatMap(words)
      )
    }
    content.words.push(...words(node.key), ...words(node.utf8 ?? node.value))
  })
  return content
}

// the items of `a` that `b` holds fewer times, with how many fewer
function missing(a, b) {
  const counts = new Map()
  for (const item of a) {
    counts.set(item, (counts.get(item) ?? 0) + 1)
  }
  for (const item of b) {
    counts.set(item, (counts.get(item) ?? 0) - 1)
  }
  return [...counts].filter(([, count]) => count > 0)
}

const work = process.argv[2]
// stdin read as a stream: a sync read of a pipe can fail with EAGAIN
let list = ""
for await (const chunk of process.stdin) {
  list += chunk
}
const files = list.split("\0").filter(Boolean)
const report = []
let same = 0
for (const file of files) {
  const ext = file.endsWith(".org") ? "org" : "md"
  const stem = realpathSync(file)
    .replaceAll("/", "_")
    .slice(0, -ext.length - 1)
  const tripped = join(work, `${stem}.b.${ext}`)
  if (!existsSync(tripped)) {
    continue
  }
  const read = ext === "org" ? orgContent : markdownContent
  const before = read(readFileSync(file, "utf8"))
  const after = read(readFileSync(tripped, "utf8"))
  const changes = {
    "lost words": missing(before.words, after.words),
    "gained words": missing(after.words, before.words),
    "lost links": missing(before.links, after.links),
    "gained links": missing(after.links, before.links)
  }
  if (Object.values(changes).every(change => !change.length)) {
    same++
    continue
  }
  report.push(file)
  for (const [kind, change] of Object.entries(changes)) {
    if (change.length) {
      const list = change.map(([item, count]) => `${item} ×${count}`)
      report.push(`  ${kind}: ${list.join(", ")}`)
    }
  }
}
writeFileSync(join(work, "content.txt"), report.join("\n") + "\n")
console.log(`same-content=${same}`)
