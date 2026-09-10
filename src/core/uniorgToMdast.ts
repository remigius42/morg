import type {
  Root as MdastRoot,
  RootContent,
  PhrasingContent,
  Heading,
  List as MdastList,
  ListItem as MdastListItem,
  BlockContent,
  DefinitionContent
} from "mdast"
import type {
  OrgData,
  ElementType,
  GreaterElementType,
  ObjectType,
  Text,
  List,
  ListItem
} from "uniorg"

/**
 * Transforms a uniorg AST to a mdast (Markdown AST).
 * @param uniorgAst The uniorg AST to transform.
 * @returns The transformed mdast.
 */
export function transformUniorgAstToMdast(uniorgAst: OrgData): MdastRoot {
  const children: RootContent[] = (uniorgAst.children || [])
    .flatMap(transformUniorgNodeToMdastNode)
    .filter(Boolean) as RootContent[]
  return { type: "root", children: children }
}

function transformUniorgObjectToMdastPhrasingContent(
  node: ObjectType
): PhrasingContent | null {
  switch (node.type) {
    case "text":
      return { type: "text", value: node.value }
    case "bold":
      return {
        type: "strong",
        children: transformUniorgObjects(node.children)
      }
    case "italic":
      return {
        type: "emphasis",
        children: transformUniorgObjects(node.children)
      }
    case "link": {
      const children = transformUniorgObjects(node.children)
      return {
        type: "link",
        url: node.rawLink,
        // a plain org link has no description; mdast needs children, and
        // text === url makes remark-stringify emit an autolink (<url>)
        children: children.length
          ? children
          : [{ type: "text", value: node.rawLink }]
      }
    }
    case "code":
    case "verbatim":
      return { type: "inlineCode", value: node.value }
    // TODO: Add handlers for other uniorg object types
    default:
      return null
  }
}

// uniorg block values keep the newline before the #+end_ line; mdast
// code values do not include it
function trimTrailingNewline(value: string): string {
  return value.replace(/\n$/, "")
}

function transformUniorgObjects(
  children: ObjectType[] | undefined
): PhrasingContent[] {
  return (children || [])
    .map(transformUniorgObjectToMdastPhrasingContent)
    .filter(Boolean) as PhrasingContent[]
}

function transformUniorgNodeToMdastNode(
  node: GreaterElementType | ElementType | Text
): RootContent | RootContent[] | null {
  switch (node.type) {
    case "section":
      return (node.children || [])
        .flatMap(transformUniorgNodeToMdastNode)
        .filter(Boolean) as RootContent[]
    case "headline":
      return {
        type: "heading",
        depth: node.level as Heading["depth"],
        children: (node.children || [])
          .map(transformUniorgObjectToMdastPhrasingContent)
          .filter(Boolean) as PhrasingContent[]
      }
    case "paragraph": {
      const children = (node.children || [])
        .map(transformUniorgObjectToMdastPhrasingContent)
        .filter(Boolean) as PhrasingContent[]
      // uniorg keeps trailing blank lines inside the paragraph node; strip
      // them so remark-stringify produces canonical spacing.
      const last = children[children.length - 1]
      if (last?.type === "text") {
        last.value = last.value.replace(/\n+$/, "")
        if (last.value === "") {
          children.pop()
        }
      }
      return { type: "paragraph", children }
    }
    case "text":
      // Whitespace-only text at block level is a formatting artifact.
      if (node.value.trim() === "") {
        return null
      }
      return { type: "text", value: node.value }
    case "plain-list":
      return transformUniorgList(node)
    case "quote-block":
      return {
        type: "blockquote",
        children: (node.children || [])
          .flatMap(transformUniorgNodeToMdastNode)
          .filter(Boolean) as BlockContent[]
      }
    case "src-block":
      return {
        type: "code",
        lang: node.language || null,
        value: trimTrailingNewline(node.value)
      }
    case "example-block":
      return {
        type: "code",
        lang: null,
        value: trimTrailingNewline(node.value)
      }
    // TODO: Add handlers for other uniorg node types
    default:
      return null
  }
}

// A single blank line does not end a list in org, so one uniorg plain-list
// can mix ordered and unordered bullets. Markdown cannot: split the items
// into runs by bullet kind, one mdast list per run.
function transformUniorgList(node: List): MdastList[] {
  const items = (node.children || []).filter(
    (child): child is ListItem => child.type === "list-item"
  )
  const runs: ListItem[][] = []
  let previousOrdered: boolean | undefined
  for (const item of items) {
    const ordered = /^\d/.test(item.bullet)
    if (ordered === previousOrdered) {
      runs[runs.length - 1]?.push(item)
    } else {
      runs.push([item])
      previousOrdered = ordered
    }
  }
  return runs.map(run => {
    const firstBullet = run[0]?.bullet ?? "- "
    const ordered = /^\d/.test(firstBullet)
    return {
      type: "list",
      ordered,
      start: ordered ? parseInt(firstBullet, 10) || 1 : null,
      spread: false,
      children: run.map(transformUniorgListItem)
    }
  })
}

function transformUniorgListItem(item: ListItem): MdastListItem {
  return {
    type: "listItem",
    spread: false,
    checked:
      item.checkbox === "on" ? true : item.checkbox === "off" ? false : null,
    children: (item.children || [])
      .flatMap(transformUniorgNodeToMdastNode)
      .filter(Boolean) as (BlockContent | DefinitionContent)[]
  }
}
