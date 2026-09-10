import { unified } from "unified"
import uniorgParse from "uniorg-parse"
import remarkStringify from "remark-stringify"
import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import remarkMath from "remark-math"
import { transformUniorgAstToMdast } from "./core/uniorgToMdast.js"
import type { OrgToMarkdownOptions } from "./options.js"

/**
 * Converts an Org-mode string to a Markdown string.
 * @param org The Org-mode string to convert.
 * @param options Conversion options (org-ism serialization, dialect preset).
 * @returns The converted Markdown string.
 */
export function convertOrgToMarkdown(
  org: string,
  options: OrgToMarkdownOptions = {}
): string {
  // Phase 1: Parse Org-mode to uniorg-ast
  let uniorgAst = unified().use(uniorgParse).parse(org)

  // Phase 2: Extract dialect preset conventions, if any
  if (options.preset?.extractFromUniorg) {
    uniorgAst = options.preset.extractFromUniorg(uniorgAst)
  }

  // Phase 3: Generic uniorg-ast to mdast transformation
  const mdast = transformUniorgAstToMdast(uniorgAst, {
    ...(options.preserveOrgisms !== undefined && {
      preserveOrgisms: options.preserveOrgisms
    }),
    ...(options.useHtml !== undefined && { useHtml: options.useHtml }),
    ...(options.taskCheckboxes !== undefined && {
      taskCheckboxes: options.taskCheckboxes
    }),
    ...(options.onWarning !== undefined && { onWarning: options.onWarning })
  })

  // Phase 4: Render mdast to Markdown string
  // bullet and rule "-" (not remark's default "*") are morg's canonical
  // Markdown form
  const markdownContent = unified()
    .use(remarkStringify, {
      bullet: "-",
      rule: "-",
      handlers: {
        // key:: value blocks and preset inline passthroughs (e.g.
        // wikilinks) are emitted verbatim, unescaped
        keyValue: (node: { value: string }) => node.value,
        verbatimInline: (node: { value: string }) => node.value
      }
    } as Parameters<typeof remarkStringify>[0])
    .use(remarkGfm)
    .use(remarkFrontmatter)
    .use(remarkMath)
    .stringify(mdast)

  return markdownContent
}
