import { unified } from "unified"
import remarkStringify from "remark-stringify"
import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import remarkMath from "remark-math"
import { remarkDefinitionList } from "remark-definition-list"
import { transformUniorgAstToMdast } from "./core/uniorgToMdast/index.js"
import { takeRecordedStyle } from "./core/markdownStyle.js"
import { takeFileHeader } from "./core/frontmatterBlock.js"
import { unescapeOrgMarkup } from "./core/markupBoundary.js"
import { unescapeLineSyntax } from "./core/lineSyntax.js"
import { unescapeFootnoteReferences } from "./core/footnoteReferences.js"
import { unescapeDescriptiveTags } from "./core/descriptiveTags.js"
import { unescapeBackslashCommands } from "./core/backslashCommands.js"
import { unescapeTablePipes } from "./core/tablePipes.js"
import { parseOrg } from "./core/bracedScripts.js"
import { guardCommaEscapes, unescapeCommaEscapes } from "./core/commaEscapes.js"
import { separateTableKeywords } from "./core/tableKeywords.js"
import {
  dropUnderscoreBulletGuards,
  guardUnderscoreBullets
} from "./core/underscoreBullets.js"
import type { OrgToMarkdownOptions } from "./options.js"
import {
  conversionContext,
  fragmentSides,
  readOrgWriteMarkdown,
  takeOver
} from "./presets/hooks.js"
import { resolveSides, type Sides } from "./presets/sides.js"

// a list item's paragraph after its nested list or quote needs a blank
// line, or md reads it as a lazy continuation of the list's last item or
// the quote, after its table as a table row, after HTML as HTML
function separateTextAfterBlock(
  left: { type: string },
  right: { type: string },
  parent: { type: string }
): number | undefined {
  return parent.type === "listItem" &&
    ["list", "blockquote", "table", "html"].includes(left.type) &&
    right.type === "paragraph"
    ? 1
    : undefined
}

// an empty nested item right below a list item's paragraph needs a blank
// line, or md reads its lone `-` as a setext underline: a heading
function separateEmptyItemFromText(
  left: { type: string },
  right: { type: string; ordered?: boolean; children?: { children?: [] }[] },
  parent: { type: string }
): number | undefined {
  return parent.type === "listItem" &&
    left.type === "paragraph" &&
    right.type === "list" &&
    !right.ordered &&
    right.children?.[0]?.children?.length === 0
    ? 1
    : undefined
}

/**
 * Converts an Org-mode string to a Markdown string.
 * @param org The Org-mode string to convert.
 * @param options Conversion options (org-ism serialization, dialect preset).
 * @returns The converted Markdown string.
 */
export function convertOrgToMarkdown(
  org: string,
  options: OrgToMarkdownOptions = {}
): string {
  return convertOrgSides(org, options, resolveSides(options, "org", "markdown"))
}

function convertOrgSides(
  org: string,
  options: OrgToMarkdownOptions,
  sides: Sides
): string {
  const over = takeOver(sides, "convertOrg")
  return over
    ? over.preset.convertOrg!(
        org,
        (fragment, preset, carried) =>
          convertOrgSides(
            fragment,
            options,
            fragmentSides(sides, over.side, preset, carried)
          ),
        conversionContext(over, options)
      )
    : convertOrgDocument(org, options, sides)
}

function convertOrgDocument(
  org: string,
  options: OrgToMarkdownOptions,
  sides: Sides
): string {
  // Phase 1: Parse Org-mode to uniorg-ast
  // md text has no scripts, so ^:{} is implied there and consumed here
  // (see markdownToOrg); uniorg misreads `_.` lines (see underscoreBullets)
  // and comma-escaped code lines (see commaEscapes), and drops a table's
  // keywords (see tableKeywords)
  const guarded = separateTableKeywords(
    guardCommaEscapes(guardUnderscoreBullets(org))
  )
  let uniorgAst = parseOrg(guarded)
  dropUnderscoreBulletGuards(uniorgAst)
  unescapeCommaEscapes(uniorgAst)

  // Phase 1b: a recorded style is morg's own (ADR 0004), so consume it so
  // it does not travel on as frontmatter; explicit options still win
  const recordedStyle = takeRecordedStyle(uniorgAst)
  // frontmatter travels in a block marked as morg's (ADR 0005)
  // and so does a file-level drawer (org-roam's :ID:)
  const fileHeader = takeFileHeader(uniorgAst, guarded, options.onWarning)

  // Phase 1c: markdown needs no zero-width space escapes (inverse of md→org)
  unescapeOrgMarkup(uniorgAst)
  unescapeLineSyntax(uniorgAst)
  unescapeFootnoteReferences(uniorgAst)
  unescapeDescriptiveTags(uniorgAst)
  unescapeBackslashCommands(uniorgAst)
  unescapeTablePipes(uniorgAst)

  // Phase 2: Extract dialect preset conventions, if any: read the org
  // dialect, then write the md dialect
  uniorgAst = readOrgWriteMarkdown(uniorgAst, sides)

  // Phase 3: Generic uniorg-ast to mdast transformation
  const mdast = transformUniorgAstToMdast(uniorgAst, {
    ...(options.preserveOrgisms !== undefined && {
      preserveOrgisms: options.preserveOrgisms
    }),
    ...(options.spelling !== undefined && { spelling: options.spelling }),
    ...(options.taskCheckboxes !== undefined && {
      taskCheckboxes: options.taskCheckboxes
    }),
    ...(options.orgismKeys !== undefined && {
      orgismKeys: options.orgismKeys
    }),
    ...(options.onWarning !== undefined && { onWarning: options.onWarning }),
    ...fileHeader
  })

  // Phase 4: Render mdast to Markdown string
  // bullet and rule "-" (not remark's default "*") are morg's canonical
  // Markdown form; style knobs override it (canonical form is
  // then per-config, see ADR 0001)
  const markdownContent = unified()
    .use(remarkStringify, {
      bullet: "-",
      rule: "-",
      ...recordedStyle,
      ...options.style,
      join: [separateTextAfterBlock, separateEmptyItemFromText],
      handlers: {
        // key:: value blocks and preset inline passthroughs (e.g.
        // wikilinks) are emitted verbatim, unescaped; only a pipe inside
        // a table cell is escaped, or it would split the cell
        keyValue: (node: { value: string }) => node.value,
        verbatimInline: (
          node: { value: string },
          _parent: unknown,
          state: { stack: string[] }
        ) =>
          state.stack.includes("tableCell")
            ? node.value.replaceAll("|", "\\|")
            : node.value
      }
    } as Parameters<typeof remarkStringify>[0])
    .use(remarkGfm)
    .use(remarkFrontmatter)
    .use(remarkMath)
    .use(remarkDefinitionList)
    .stringify(mdast)

  return markdownContent
}
