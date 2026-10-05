import { escapingBlockHandlers } from "../commaEscapes.js"
import type { PhrasingContent, RootContent } from "mdast"
import type { AffiliatedKeywords, OrgData } from "uniorg"
import { affiliatedEntries } from "../affiliated.js"
import { unified } from "unified"
import { uniorgStringify } from "uniorg-stringify"
import {
  spellingOf,
  toggleEnabled,
  type HtmlConstruct,
  type Spellings,
  type Toggle
} from "../../options.js"

export interface UniorgToMdastOptions {
  preserveOrgisms?: Toggle
  spelling?: Spellings
  taskCheckboxes?: boolean
  orgismKeys?: Record<string, string>
  onWarning?: (message: string) => void
  // YAML text of the marked frontmatter block (ADR 0005), taken out of
  // the document before the transform
  frontmatter?: string
  // properties of the file-level drawer, taken out likewise
  fileProperties?: [string, string][]
  // whether the block's YAML can take morg's entries, if already known
  takesMorgEntries?: boolean
  // whether the file starts with an Emacs mode line, taken likewise
  startsWithModeLine?: boolean
  // the org text a tree was parsed from: uniorg drops the marker of the
  // frontmatter block, which the transform then finds by its begin line
  org?: string
}

// per-run state threaded through the recursive transform helpers;
// inlineFootnotes collects inline footnotes ([fn:: text], [fn:label: text]):
// GFM has no inline form, so they normalize to a standard reference plus a
// definition hoisted to the document end
export interface TransformContext {
  options: UniorgToMdastOptions
  inlineFootnotes: { label: string; children: PhrasingContent[] }[]
  usedFootnoteLabels: Set<string>
}

export function orgismEnabled(ctx: TransformContext, key: string): boolean {
  return toggleEnabled(ctx.options.preserveOrgisms, key)
}

export function htmlEnabled(
  ctx: TransformContext,
  construct: HtmlConstruct
): boolean {
  return spellingOf(ctx.options.spelling, construct) === "html"
}

export function warn(ctx: TransformContext, message: string): void {
  ctx.options.onWarning?.(message)
}

// org-ism key:: names are user-configurable (ADR 0002 point 5)
export function keyName(ctx: TransformContext, key: string): string {
  return ctx.options.orgismKeys?.[key] ?? key
}

// custom mdast node stringified verbatim (see orgToMarkdown handlers) so
// keys like custom_id are not markdown-escaped to custom\_id
export function keyValueParagraph(lines: string[]): RootContent {
  return { type: "keyValue", value: lines.join("\n") } as unknown as RootContent
}

// renders a single uniorg node back to its org text (without the
// trailing newline), for verbatim passthrough of org-only constructs
export function orgNodeToText(node: unknown): string {
  const orgText = unified()
    // a preset's verbatim-inline text is org text already
    .use(uniorgStringify, {
      handlers: {
        ...escapingBlockHandlers,
        "verbatim-inline": (inline: { value: string }) => inline.value
      }
    } as Parameters<typeof uniorgStringify>[0])
    .stringify({
      type: "org-data",
      children: [node],
      contentsBegin: 0,
      contentsEnd: 0
    } as OrgData)
  return orgText.replace(/\n$/, "")
}

// uniorg block values keep the newline before the #+end_ line; mdast
// code values do not include it
export function trimTrailingNewline(value: string): string {
  return value.replace(/\n$/, "")
}

// affiliated keywords (#+CAPTION:, #+NAME:, #+ATTR_*) precede their
// element as verbatim lines so the return trip re-attaches them natively
export function affiliatedLines(node: unknown): string[] {
  const affiliated = (node as { affiliated?: AffiliatedKeywords }).affiliated
  return affiliatedEntries(affiliated).map(
    ([key, value]) => `#+${key}: ${value}`
  )
}
