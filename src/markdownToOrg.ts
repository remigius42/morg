import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import remarkMath from "remark-math"
import { uniorgStringify } from "uniorg-stringify"
import { visit } from "unist-util-visit"
import type { Parent } from "unist"
import type {
  Headline,
  List,
  NodeProperty,
  OrgData,
  Text,
  Timestamp
} from "uniorg"
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
  const mdast = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter)
    .use(remarkMath)
    .parse(markdown)

  // Phase 2: Generic mdast to uniorg-ast transformation
  let uniorgAst = transformMdastToUniorgAst(mdast, {
    ...(options.preserveMdisms !== undefined && {
      preserveMdisms: options.preserveMdisms
    }),
    ...(options.onWarning !== undefined && { onWarning: options.onWarning })
  })

  // Phase 2b: restore key:: value lines below headings to native org
  // syntax (see ADR 0002): known keys become TODO keywords, priorities,
  // tags and planning; unknown keys become property drawer entries.
  // orgismKeys maps custom names back to canonical (per-config).
  const canonicalKeys = new Map(
    Object.entries(options.orgismKeys ?? {}).map(([canonical, custom]) => [
      custom,
      canonical
    ])
  )
  restoreOrgisms(uniorgAst, canonicalKeys)

  // Phase 2c: formatting-as-structure — adjacent lists need two blank
  // lines between them, or org's parser merges them into one list.
  separateAdjacentLists(uniorgAst)

  // Phase 3: Apply dialect preset, if any
  if (options.preset?.applyToUniorg) {
    uniorgAst = options.preset.applyToUniorg(uniorgAst)
  }

  // Phase 4: Render uniorg-ast to Org-mode string
  const processor = unified().use(uniorgStringify)
  const orgContent = processor.stringify(uniorgAst)

  return orgContent
}

const KEY_VALUE_LINE_RE = /^([\w-]+):: (.*)$/

function parseKeyValueParagraph(
  node:
    { type?: string; children?: { type: string; value?: string }[] } | undefined
): [string, string][] | null {
  if (node?.type !== "paragraph" || !node.children?.length) {
    return null
  }
  if (!node.children.every(child => child.type === "text")) {
    return null
  }
  const lines = node.children
    .map(child => child.value ?? "")
    .join("")
    .split("\n")
  const entries: [string, string][] = []
  for (const line of lines) {
    const match = KEY_VALUE_LINE_RE.exec(line)
    if (!match) {
      return null
    }
    entries.push([match[1] as string, match[2] as string])
  }
  return entries
}

function makeTimestamp(rawValue: string): Timestamp {
  return { type: "timestamp", rawValue } as Timestamp
}

function restoreOrgisms(
  uniorgAst: OrgData,
  canonicalKeys: Map<string, string>
): void {
  const children = uniorgAst.children as { type: string }[]
  for (let i = 0; i < children.length; i++) {
    const headline = children[i]
    if (headline?.type !== "headline") {
      continue
    }
    const planning: Partial<
      Record<"scheduled" | "deadline" | "closed", Timestamp>
    > = {}
    const properties: NodeProperty[] = []
    let consumed = 0
    let entries
    while ((entries = parseKeyValueParagraph(children[i + 1 + consumed]))) {
      for (const [rawKey, value] of entries) {
        const key = canonicalKeys.get(rawKey) ?? rawKey
        switch (key) {
          case "todo":
            ;(headline as Headline).todoKeyword = value
            break
          case "priority":
            ;(headline as Headline).priority = value
            break
          case "tags":
            ;(headline as Headline).tags = value.split(/,\s*/)
            break
          case "scheduled":
          case "deadline":
          case "closed":
            planning[key] = makeTimestamp(value)
            break
          default:
            properties.push({ type: "node-property", key, value })
        }
      }
      consumed++
    }
    if (!consumed) {
      continue
    }
    const replacements: object[] = []
    if (Object.keys(planning).length) {
      replacements.push({
        type: "planning",
        scheduled: planning.scheduled ?? null,
        deadline: planning.deadline ?? null,
        closed: planning.closed ?? null
      })
    }
    if (properties.length) {
      replacements.push({
        type: "property-drawer",
        children: properties,
        contentsBegin: 0,
        contentsEnd: 0
      })
    }
    children.splice(i + 1, consumed, ...(replacements as { type: string }[]))
  }
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
