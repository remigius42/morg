import type { OrgData, SpecialBlock, SrcBlock } from "uniorg"
import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import { tryParse } from "../core/render.js"
import { orgNodeToText } from "../core/uniorgToMdast/shared.js"

// a Logseq query block (`#+BEGIN_QUERY`): Markdown has none, so a code
// block carries it, in a language a Markdown dialect names (ADR 0006)

/**
 * org→md: a query block becomes a code block in `language`, marked with
 * the block's type as written; so does one read so before, for another
 * dialect's language.
 * @param uniorgAst The document.
 * @param language The code block's language.
 */
export function queryBlocksToCode(uniorgAst: OrgData, language: string): void {
  visit(
    uniorgAst as Parent,
    "special-block",
    (
      node: SpecialBlock,
      index: number | undefined,
      parent: Parent | undefined
    ) => {
      if (
        node.blockType.toUpperCase() !== "QUERY" ||
        !parent ||
        index === undefined
      ) {
        return
      }
      // its keywords stay its own, out of the body
      const lines = orgNodeToText({ ...node, affiliated: {} }).split("\n")
      parent.children[index] = {
        type: "src-block",
        affiliated: node.affiliated,
        language,
        // the block as written, for Logseq Markdown to write it back
        blockType: node.blockType,
        switches: null,
        parameters: null,
        value: `${lines.slice(1, -1).join("\n")}\n`
      } as unknown as Parent["children"][number]
    }
  )
  visit(uniorgAst as Parent, "src-block", (node: SrcBlock) => {
    if ((node as { blockType?: string }).blockType) {
      node.language = language
    }
  })
}

/**
 * md→org: a code block in `language` read as a query block
 * (queryBlocksToCode) goes back as it was written; with a fallback
 * type, so does any code block in it.
 * @param uniorgAst The document.
 * @param language The code block's language.
 * @param fallback The block type of a code block not so read.
 */
export function codeToQueryBlocks(
  uniorgAst: OrgData,
  language: string,
  fallback?: string
): void {
  visit(
    uniorgAst as Parent,
    "src-block",
    (node: SrcBlock, index: number | undefined, parent: Parent | undefined) => {
      const type = (node as { blockType?: string }).blockType ?? fallback
      if (
        node.language !== language ||
        !type ||
        !parent ||
        index === undefined
      ) {
        return
      }
      // a Markdown code block's value ends short of its last line break
      const body = node.value.replace(/\n?$/, "\n")
      const [block] =
        tryParse(`#+begin_${type}\n${body}#+end_${type}\n`)?.children ?? []
      if (block) {
        parent.children[index] = block
      }
    }
  )
}
