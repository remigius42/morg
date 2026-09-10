import { unified } from "unified"
import remarkParse from "remark-parse"
import { uniorgStringify } from "uniorg-stringify"
import { visit } from "unist-util-visit"
import type { Parent } from "unist"
import type { List, Text } from "uniorg"
import { transformMdastToUniorgAst } from "./core/mdastToUniorg.js"
import type { MarkdownToOrgOptions } from "./options.js"

/**
 * Converts a Markdown string to an Org-mode string.
 * @param markdown The Markdown string to convert.
 * @param options Conversion options (md-ism preservation, dialect preset).
 * @returns The converted Org-mode string.
 */
export function convertMarkdownToOrg(
  markdown: string,
  options: MarkdownToOrgOptions = {}
): string {
  // Phase 1: Parse Markdown to mdast
  const mdast = unified().use(remarkParse).parse(markdown)

  // Phase 2: Generic mdast to uniorg-ast transformation
  let uniorgAst = transformMdastToUniorgAst(mdast)

  // Phase 2b: formatting-as-structure — adjacent lists need two blank
  // lines between them, or org's parser merges them into one list.
  separateAdjacentLists(uniorgAst)

  // Phase 3: Apply dialect preset, if any
  if (options.preset?.applyToUniorg) {
    uniorgAst = options.preset.applyToUniorg(uniorgAst)
  }

  // Phase 4: Render uniorg-ast to Org-mode string
  const processor = unified().use(uniorgStringify, {
    handlers: {
      comment: () => ""
    }
  })
  const orgContent = processor.stringify(uniorgAst)

  return orgContent
}

function separateAdjacentLists(uniorgAst: Parent): void {
  visit(
    uniorgAst,
    "plain-list",
    (_node: List, index: number, parent: Parent) => {
      if (parent.children[index + 1]?.type === "plain-list") {
        const separator: Text = { type: "text", value: "\n\n" }
        parent.children.splice(index + 1, 0, separator)
        return index + 2
      }
      return undefined
    }
  )
}
