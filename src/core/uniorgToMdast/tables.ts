import type { PhrasingContent, RootContent } from "mdast"
import type { GreaterElementType, TableRow } from "uniorg"
import { trimTrailingNewline, type TransformContext } from "./shared.js"
import { transformUniorgObjects } from "./objects.js"

function cellText(cell: TableRow["children"][number]): string {
  return (cell.children || [])
    .map(child => (child.type === "text" ? child.value : ""))
    .join("")
    .trim()
}

function isAlignmentCookieRow(row: TableRow): boolean {
  const cells = row.children || []
  return (
    cells.length > 0 &&
    cells.every(cell => {
      const text = cellText(cell)
      return text === "" || /^<[lrc]\d*>$/.test(text)
    }) &&
    cells.some(cell => cellText(cell) !== "")
  )
}

// org cell content keeps the aligning whitespace padding; markdown
// cells are re-padded by the stringifier. Only the cell's edges are
// padding: a space between text and markup is content
function trimCellPadding(children: PhrasingContent[]): PhrasingContent[] {
  const first = children[0]
  if (first?.type === "text") {
    first.value = first.value.trimStart()
  }
  const last = children.at(-1)
  if (last?.type === "text") {
    last.value = last.value.trimEnd()
  }
  return children
}

export function transformTable(
  ctx: TransformContext,
  node: Extract<GreaterElementType, { type: "table" }>
): RootContent {
  if (node.tableType === "table.el") {
    // table.el tables have no cell structure, only a verbatim value;
    // a table.el-tagged fenced block carries it so the return trip
    // can restore the table
    return {
      type: "code",
      lang: "table.el",
      value: trimTrailingNewline((node as unknown as { value: string }).value)
    }
  }
  const standardRows = (node.children || []).filter(
    (row): row is TableRow =>
      row.type === "table-row" && row.rowType === "standard"
  )
  // an org alignment cookie row (| <l> | <r> | <c> |) becomes GFM
  // column alignment instead of a content row
  const cookieRow = standardRows.find(isAlignmentCookieRow)
  const align = cookieRow
    ? (cookieRow.children || []).map(cell => {
        const cookie = /^<([lrc])\d*>$/.exec(cellText(cell))?.[1]
        return cookie === "l"
          ? ("left" as const)
          : cookie === "r"
            ? ("right" as const)
            : cookie === "c"
              ? ("center" as const)
              : null
      })
    : null
  return {
    type: "table",
    align,
    children: standardRows
      .filter(row => row !== cookieRow)
      .map(row => ({
        type: "tableRow",
        children: (row.children || []).map(cell => ({
          type: "tableCell",
          children: trimCellPadding(transformUniorgObjects(ctx, cell.children))
        }))
      }))
  } as unknown as RootContent
}
