import type {
  OrgData,
  Headline,
  PropertyDrawer,
  NodeProperty,
  Text
} from "uniorg"
import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import type { Preset } from "./types.js"

export interface LogseqPresetOptions {
  /**
   * Content following a heading becomes children of that heading's block
   * in Logseq's outline. Default: `true`.
   * TODO: not consumed yet — outline nesting is not implemented.
   */
  nestUnderHeadings?: boolean
}

/**
 * Logseq dialect preset: `heading::` properties, outline nesting, hiccup.
 */
export function logseq(_options: LogseqPresetOptions = {}): Preset {
  return {
    name: "logseq",
    applyToUniorg: applyLogseqSpecificsToUniorgAst,
    extractFromUniorg: extractLogseqSpecificsFromUniorgAst
  }
}

/**
 * Applies Logseq-specific conventions and features to a uniorg AST.
 * This includes handling outliner structure, properties, and other Logseq peculiarities.
 * @param uniorgAst The uniorg AST to transform.
 * @returns The Logseq-flavored uniorg AST.
 */
export function applyLogseqSpecificsToUniorgAst(uniorgAst: OrgData): OrgData {
  visit(
    uniorgAst as Parent,
    "headline",
    (node: Headline, index: number, parent: Parent) => {
      const properties: NodeProperty[] = [
        {
          type: "node-property",
          key: "heading",
          value: String(node.level)
        }
      ]

      const propertyDrawer: PropertyDrawer = {
        type: "property-drawer",
        children: properties,
        contentsBegin: 0,
        contentsEnd: 0
      }

      const newline: Text = {
        type: "text",
        value: "\n"
      }

      parent.children.splice(
        index + 1,
        0,
        propertyDrawer,
        newline // Newline after the property drawer
      )
      // Tell visit to skip the nodes we just added
      return index + 3 // Skip headline, propertyDrawer and newline
    }
  )
  return uniorgAst
}

/**
 * Extracts Logseq-specific conventions and features from a uniorg AST,
 * normalizing it into a more generic uniorg AST representation.
 * @param uniorgAst The Logseq-flavored uniorg AST to transform.
 * @returns The generic uniorg AST.
 */
export function extractLogseqSpecificsFromUniorgAst(
  uniorgAst: OrgData
): OrgData {
  // TODO: Implement extraction of Logseq-specific transformations.
  return uniorgAst
}
