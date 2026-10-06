import type { List } from "mdast"
import {
  toggleEnabled,
  type HtmlConstruct,
  type Toggle
} from "../../options.js"
import type { markdownAnchors } from "../internalLinks.js"

// ends a bullet's line where uniorg-stringify would trim the line
// break, taken out with the space before it once stringified
export const BULLET_LINE_END = "\u0001"

export interface MdastToUniorgOptions {
  preserveMdisms?: Toggle
  interpretHtml?: Toggle
  onWarning?: (message: string) => void
}

export interface TransformContext {
  options: MdastToUniorgOptions
  // link definitions of the current run, for resolving reference-style
  // links and images to inline (org has no reference links)
  definitions: Map<string, { url: string; title?: string }>
  // lists below a descriptive list marker (ADR 0007 §3)
  markedLists: Set<List>
  // the org link of an anchor in the document
  anchors: ReturnType<typeof markdownAnchors>
}

export function mdismEnabled(ctx: TransformContext, key: string): boolean {
  return toggleEnabled(ctx.options.preserveMdisms, key)
}

// whether a construct's html spelling reads as the org construct
export function htmlInterpreted(
  ctx: TransformContext,
  construct: HtmlConstruct
): boolean {
  return toggleEnabled(ctx.options.interpretHtml, construct, false)
}

export function warn(ctx: TransformContext, message: string): void {
  ctx.options.onWarning?.(message)
}
