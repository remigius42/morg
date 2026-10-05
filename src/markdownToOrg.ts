import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import remarkMath from "remark-math"
import { remarkDefinitionList } from "remark-definition-list"
import { uniorgStringify } from "uniorg-stringify"
import { visit } from "unist-util-visit"
import type { Parent } from "unist"
import type { Headline, NodeProperty, OrgData, Text, Timestamp } from "uniorg"
import { transformMdastToUniorgDraft } from "./core/mdastToUniorg/index.js"
import { BULLET_LINE_END } from "./core/mdastToUniorg/context.js"
import { detectMarkdownStyle, STYLE_KEYWORD } from "./core/markdownStyle.js"
import { escapeOrgMarkup } from "./core/markupBoundary.js"
import { renderFileHeader } from "./core/frontmatterBlock.js"
import { escapeLineSyntax } from "./core/lineSyntax.js"
import { escapeFootnoteReferences } from "./core/footnoteReferences.js"
import { escapeDescriptiveTags } from "./core/descriptiveTags.js"
import { escapeBackslashCommands } from "./core/backslashCommands.js"
import { escapeTablePipes } from "./core/tablePipes.js"
import { requireBracedScripts } from "./core/bracedScripts.js"
import { keepPassthroughSource } from "./core/passthroughSource.js"
import type { Root } from "mdast"
import type { MarkdownStyleOptions, MarkdownToOrgOptions } from "./options.js"
import type { Preset } from "./presets/types.js"
import {
  conversionContext,
  fragmentSides,
  readMarkdownWriteOrg,
  takeOver
} from "./presets/hooks.js"
import { resolveSides, type Sides } from "./presets/sides.js"
import { keyValueEntries } from "./core/keyValueLines.js"

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
  return convertMarkdownSides(
    markdown,
    options,
    resolveSides(options, "markdown", "org")
  )
}

function convertMarkdownSides(
  markdown: string,
  options: MarkdownToOrgOptions,
  sides: Sides
): string {
  const over = takeOver(sides, "convertMarkdown")
  return over
    ? // a fragment's style is the preset's, not one to record
      over.preset.convertMarkdown!(
        markdown,
        (fragment, preset, carried) =>
          convertMarkdownSides(
            fragment,
            { ...options, recordMarkdownStyle: false },
            fragmentSides(sides, over.side, preset, carried)
          ),
        conversionContext(over, options)
      )
    : convertMarkdownDocument(markdown, options, sides)
}

function convertMarkdownDocument(
  markdown: string,
  options: MarkdownToOrgOptions,
  sides: Sides
): string {
  // Phase 1: Parse Markdown to mdast
  const mdast = parseMarkdown(markdown, sides.input)

  // Phase 2: Generic mdast to uniorg-ast transformation
  let uniorgAst = transformMdastToUniorgDraft(mdast, {
    ...(options.preserveMdisms !== undefined && {
      preserveMdisms: options.preserveMdisms
    }),
    ...(options.interpretHtml !== undefined && {
      interpretHtml: options.interpretHtml
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

  // Phase 2c: formatting-as-structure. Adjacent lists need two blank
  // lines between them, adjacent tables one, or org's parser merges them
  separateAdjacentElements(uniorgAst)

  // Phase 2d: record the source's own style markers, so the return trip
  // can reproduce them instead of morg's canonical ones (ADR 0004)
  if (options.recordMarkdownStyle) {
    recordStyleKeyword(
      uniorgAst,
      detectMarkdownStyle(mdast, markdown, options.onWarning)
    )
  }

  // Phase 3: Apply dialect preset, if any: read the md dialect, then
  // write the org dialect
  uniorgAst = readMarkdownWriteOrg(uniorgAst, sides)

  // Phase 3b: literal footnote references, paragraph lines org would
  // read as line syntax, literal markers org would read as markup, and
  // markup touching a word character, need a zero-width space escape;
  // a pipe in a table cell an entity; a literal backslash before a
  // letter first, the entity being none
  escapeBackslashCommands(uniorgAst)
  escapeTablePipes(uniorgAst, options.onWarning)
  escapeFootnoteReferences(uniorgAst)
  escapeDescriptiveTags(uniorgAst)
  escapeLineSyntax(uniorgAst)
  escapeOrgMarkup(uniorgAst)

  // Phase 3c: md text has no sub/superscripts; keep org from reading
  // bare underscores and carets as such. Checked on the text as
  // rendered: after the preset, whose text rewrites (wikilink aliases)
  // org parses too, and after the escapes, next to which org reads them
  requireBracedScripts(uniorgAst)

  // Phase 3d: the file's header (ADR 0005): mode line and file-level
  // drawer first, keywords apart from what follows, the frontmatter as
  // a marked comment block; raw text, past every pass that rewrites text
  renderFileHeader(uniorgAst)

  // Phase 4: Render uniorg-ast to Org-mode string
  const orgContent = String(stringifier.stringify(uniorgAst))

  return orgContent
    .replaceAll(SPACE_KEEPER, "")
    .replaceAll(` ${BULLET_LINE_END}`, "")
}

// uniorg-stringify trims a headline's line, and the document's end, but
// Emacs reads stars without a space after them as text; the space ends
// in a character no trim takes, removed after. null leaves the rest to
// uniorg-stringify
const SPACE_KEEPER = "\u0000"

function emptyHeadline(node: Headline): string | null {
  const empty =
    !node.children.length &&
    !node.todoKeyword &&
    !node.priority &&
    !node.commented &&
    !node.tags.length
  return empty ? `${"*".repeat(node.level)} ${SPACE_KEEPER}\n` : null
}

// built once: a preset converts a page block by block
const stringifier = unified()
  .use(uniorgStringify, {
    handlers: { headline: emptyHeadline }
  } as Parameters<typeof uniorgStringify>[0])
  .freeze()

// a preset's dialect conventions that need the Markdown source apply
// to the parse, before the generic transform
function parseMarkdown(markdown: string, preset?: Preset): Root {
  const mdast = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter)
    .use(remarkMath)
    .use(remarkDefinitionList)
    .parse(markdown)
  keepPassthroughSource(mdast, markdown)
  preset?.markdown?.read?.mdast?.(mdast, markdown)
  return mdast
}

// leads the document, ahead of restored keywords and the frontmatter block
function recordStyleKeyword(
  uniorgAst: OrgData,
  style: MarkdownStyleOptions
): void {
  if (!Object.keys(style).length) {
    return
  }
  uniorgAst.children.unshift({
    type: "keyword",
    key: STYLE_KEYWORD,
    value: JSON.stringify(style)
  } as OrgData["children"][number])
}

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
  return keyValueEntries(node.children.map(child => child.value ?? "").join(""))
}

function makeTimestamp(rawValue: string): Timestamp {
  return { type: "timestamp", rawValue } as Timestamp
}

type Planning = Partial<Record<"scheduled" | "deadline" | "closed", Timestamp>>

// the headline slots have a syntax of their own: a value org could not
// carry there (a drawer property that merely shares the name, a
// hand-written line) stays a property instead of corrupting the title
const TODO_KEYWORD_RE = /^[A-Z][A-Z0-9_-]*$/
const PRIORITY_RE = /^[A-Z]$/
const TAG_LIST_RE = /^[\w@#%]+(?:,\s*[\w@#%]+)*$/
const TIMESTAMP_RE = /^[<[].*[>\]]$/

function applyOrgismEntry(
  headline: Headline,
  planning: Planning,
  properties: NodeProperty[],
  key: string,
  value: string
): void {
  switch (key) {
    case "todo":
      if (!TODO_KEYWORD_RE.test(value)) {
        break
      }
      headline.todoKeyword = value
      return
    case "priority":
      if (!PRIORITY_RE.test(value)) {
        break
      }
      headline.priority = value
      return
    case "tags":
      if (!TAG_LIST_RE.test(value)) {
        break
      }
      headline.tags = value.split(/,\s*/)
      return
    case "scheduled":
    case "deadline":
    case "closed":
      if (!TIMESTAMP_RE.test(value)) {
        break
      }
      planning[key] = makeTimestamp(value)
      return
    default:
      break
  }
  properties.push({ type: "node-property", key, value })
}

function consumeOrgismParagraphs(
  children: { type: string }[],
  i: number,
  canonicalKeys: Map<string, string>
): { planning: Planning; properties: NodeProperty[]; consumed: number } {
  const headline = children[i] as Headline
  const planning: Planning = {}
  const properties: NodeProperty[] = []
  let consumed = 0
  let entries
  while ((entries = parseKeyValueParagraph(children[i + 1 + consumed]))) {
    for (const [rawKey, value] of entries) {
      const key = canonicalKeys.get(rawKey) ?? rawKey
      applyOrgismEntry(headline, planning, properties, key, value)
    }
    consumed++
  }
  return { planning, properties, consumed }
}

function buildOrgismReplacements(
  planning: Planning,
  properties: NodeProperty[]
): object[] {
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
  return replacements
}

function restoreOrgisms(
  uniorgAst: OrgData,
  canonicalKeys: Map<string, string>
): void {
  const children = uniorgAst.children as { type: string }[]
  for (let i = 0; i < children.length; i++) {
    if (children[i]?.type !== "headline") {
      continue
    }
    const { planning, properties, consumed } = consumeOrgismParagraphs(
      children,
      i,
      canonicalKeys
    )
    if (!consumed) {
      continue
    }
    const replacements = buildOrgismReplacements(planning, properties)
    children.splice(i + 1, consumed, ...(replacements as { type: string }[]))
  }
}

// the blank lines that keep two adjacent elements of a type apart
const SEPARATORS: Record<string, string> = {
  "plain-list": "\n\n",
  table: "\n"
}

function separateAdjacentElements(uniorgAst: Parent): void {
  visit(
    uniorgAst,
    (node: { type: string }, index, parent: Parent | undefined) => {
      const value = SEPARATORS[node.type]
      if (
        value === undefined ||
        index === undefined ||
        parent?.children[index + 1]?.type !== node.type
      ) {
        return undefined
      }
      const separator: Text = { type: "text", value }
      parent.children.splice(index + 1, 0, separator)
      return index + 2
    }
  )
}
