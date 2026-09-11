import type { PhrasingContent, RootContent, BlockContent } from "mdast"
import type { GreaterElementType, ObjectType } from "uniorg"
import { type TransformContext } from "./shared.js"
import { transformUniorgObjects } from "./objects.js"
import { transformNodes } from "./elements.js"

function nextFreeFootnoteLabel(ctx: TransformContext): string {
  let candidate = 1
  while (ctx.usedFootnoteLabels.has(String(candidate))) {
    candidate++
  }
  const label = String(candidate)
  ctx.usedFootnoteLabels.add(label)
  return label
}

export function collectFootnoteLabels(
  ctx: TransformContext,
  node: unknown
): void {
  if (!node || typeof node !== "object") {
    return
  }
  const candidate = node as {
    type?: string
    label?: string | null
    children?: unknown[]
  }
  if (
    (candidate.type === "footnote-reference" ||
      candidate.type === "footnote-definition") &&
    candidate.label
  ) {
    ctx.usedFootnoteLabels.add(candidate.label)
  }
  for (const child of candidate.children || []) {
    collectFootnoteLabels(ctx, child)
  }
}

export function transformFootnoteReference(
  ctx: TransformContext,
  node: Extract<ObjectType, { type: "footnote-reference" }>
): PhrasingContent {
  if ((node as { footnoteType?: string }).footnoteType === "inline") {
    return transformInlineFootnoteReference(ctx, node)
  }
  return {
    type: "footnoteReference",
    identifier: node.label,
    label: node.label
  }
}

function transformInlineFootnoteReference(
  ctx: TransformContext,
  node: Extract<ObjectType, { type: "footnote-reference" }>
): PhrasingContent {
  const label = node.label || nextFreeFootnoteLabel(ctx)
  const content = transformUniorgObjects(ctx, node.children)
  const firstChild = content[0]
  if (firstChild?.type === "text") {
    firstChild.value = firstChild.value.trimStart()
  }
  ctx.inlineFootnotes.push({ label, children: content })
  return { type: "footnoteReference", identifier: label, label }
}

export function transformFootnoteDefinition(
  ctx: TransformContext,
  node: Extract<GreaterElementType, { type: "footnote-definition" }>
): RootContent {
  return {
    type: "footnoteDefinition",
    identifier: node.label,
    label: node.label,
    children: transformNodes(ctx, node.children || []) as BlockContent[]
  }
}
