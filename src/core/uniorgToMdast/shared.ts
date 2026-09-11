import type { PhrasingContent, RootContent } from "mdast"
import type { ObjectType, OrgData } from "uniorg"
import { toString as orgastToString } from "orgast-util-to-string"
import { unified } from "unified"
import { uniorgStringify } from "uniorg-stringify"
import { toggleEnabled, type Toggle } from "../../options.js"

export interface UniorgToMdastOptions {
  preserveOrgisms?: Toggle
  useHtml?: Toggle
  taskCheckboxes?: boolean
  orgismKeys?: Record<string, string>
  onWarning?: (message: string) => void
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

export function htmlEnabled(ctx: TransformContext, key: string): boolean {
  return toggleEnabled(ctx.options.useHtml, key, false)
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
    .use(uniorgStringify)
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
  const affiliated = (node as { affiliated?: Record<string, unknown> })
    .affiliated
  return Object.entries(affiliated ?? {}).flatMap(([key, value]) => {
    const entries = Array.isArray(value) ? value : [value]
    return entries.map(entry => {
      const text = Array.isArray(entry)
        ? entry.map(child => orgastToString(child as ObjectType)).join("")
        : String(entry)
      return `#+${key}: ${text}`
    })
  })
}
