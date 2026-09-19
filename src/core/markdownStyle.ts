import type { Root } from "mdast"
import type { OrgData } from "uniorg"
import { visit } from "unist-util-visit"
import type { MarkdownStyleOptions } from "../options.js"

/**
 * The org keyword carrying a recorded Markdown style, per ADR 0004.
 * `MORG_`-prefixed for the same reason `morg_` properties are (ADR 0002):
 * ownership on the return trip must be unambiguous.
 */
export const STYLE_KEYWORD = "MORG_MARKDOWN_STYLE"

/**
 * Detects the Markdown style knobs a source document was written with,
 * by reading the markers back out of the source at each node's position.
 * Knobs used inconsistently are omitted rather than guessed at (see
 * ADR 0004): style is recorded per document, so there is no honest
 * answer for a document that mixes markers.
 * @param mdast The parsed Markdown AST.
 * @param markdown The Markdown source the AST was parsed from.
 * @returns The detected knobs; keys without consistent evidence are absent.
 */
export function detectMarkdownStyle(
  mdast: Root,
  markdown: string,
  onWarning?: (message: string) => void
): MarkdownStyleOptions {
  const seen: Record<Knob, Set<string>> = {
    bullet: new Set(),
    emphasis: new Set(),
    strong: new Set(),
    fence: new Set(),
    rule: new Set()
  }
  // the rule is the one marker whose length also matters
  const rules = new Set<string>()
  visit(mdast, (node, _index, parent) => {
    const offset = node.position?.start.offset
    if (offset === undefined) {
      return
    }
    const marker = markdown[offset] as string
    const knob = knobOf(node.type, marker, parent)
    if (knob) {
      seen[knob].add(marker)
    }
    if (node.type === "thematicBreak") {
      rules.add(
        markdown.slice(offset, node.position?.end.offset).replace(/\s/g, "")
      )
    }
  })
  const style: MarkdownStyleOptions = {}
  for (const knob of KNOBS) {
    record(style, knob, seen[knob], onWarning)
  }
  recordRuleRepetition(style, rules)
  return style
}

const KNOBS = ["bullet", "emphasis", "strong", "fence", "rule"] as const

type Knob = (typeof KNOBS)[number]

function knobOf(
  type: string,
  marker: string,
  parent: { type: string; ordered?: boolean | null } | undefined
): Knob | undefined {
  switch (type) {
    case "emphasis":
      return "emphasis"
    case "strong":
      return "strong"
    case "thematicBreak":
      return "rule"
    case "code":
      // an indented code block has no fence to read
      return marker === "`" || marker === "~" ? "fence" : undefined
    case "listItem":
      // an ordered item starts with its number, not with a bullet
      return parent?.type === "list" && !parent.ordered ? "bullet" : undefined
    default:
      return undefined
  }
}

// "---" is remark's own default repetition, so only a longer run is
// worth recording; a document mixing lengths records none
function recordRuleRepetition(
  style: MarkdownStyleOptions,
  rules: Set<string>
): void {
  const lengths = new Set([...rules].map(rule => rule.length))
  const [length] = [...lengths]
  if (style.rule && lengths.size === 1 && length !== undefined && length > 3) {
    style.ruleRepetition = length
  }
}

// a marker with no instances in the document has nothing to record and
// nothing to warn about; one used two ways has no honest single answer
function record(
  style: MarkdownStyleOptions,
  knob: Knob,
  markers: Set<string>,
  onWarning?: (message: string) => void
): void {
  if (markers.size === 1) {
    Object.assign(style, { [knob]: [...markers][0] })
    return
  }
  if (markers.size > 1) {
    onWarning?.(`${knob} marker is not used consistently; not recorded`)
  }
}

/**
 * Removes a recorded-style keyword from an org AST and returns what it
 * held, so it reaches the stringifier instead of the document body.
 * @param uniorgAst The parsed org AST; mutated when the keyword is present.
 * @returns The recorded knobs, or `undefined` when nothing was recorded.
 */
export function takeRecordedStyle(
  uniorgAst: OrgData
): MarkdownStyleOptions | undefined {
  const index = uniorgAst.children.findIndex(
    child =>
      child.type === "keyword" &&
      (child as unknown as { key: string }).key === STYLE_KEYWORD
  )
  if (index === -1) {
    return undefined
  }
  const [keyword] = uniorgAst.children.splice(index, 1)
  const value = (keyword as unknown as { value: string }).value
  try {
    return JSON.parse(value) as MarkdownStyleOptions
  } catch {
    return undefined
  }
}
