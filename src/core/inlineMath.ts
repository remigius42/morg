import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import {
  isInline,
  positionParser,
  renderChildren,
  tryParse,
  type Node
} from "./render.js"

type Fragment = Node & { contents: string }

// stands in for a fragment, to find its neighbors in the rendered line
const PLACEHOLDER = "\u0002"

// uniorg's `$x$` rule (parseLatexFragment): no `$` before, content
// neither starting with a blank or `,.;` nor ending with a blank or `,.`
// nor holding a `$`, punctuation, a blank or the end after
const AFTER_RE = /^(?:$|[\p{P}\p{White_Space}])/u
const CONTENT_RE = /^[^\s,.;$](?:[^$]*[^\s,.$])?$/

function readsAsDollar(contents: string, line: string, at: number): boolean {
  return (
    line[at - 1] !== "$" &&
    CONTENT_RE.test(contents) &&
    AFTER_RE.test(line.slice(at + 1))
  )
}

// whether org reads the fragment in its place, as written: a literal
// `$` earlier in the text can pair with its opening one (`$a$\a$`)
function readsInPlace(text: string, at: number, value: string): boolean {
  let found = false
  const tree = tryParse(text, positionParser)
  if (tree) {
    visit(tree, "latex-fragment", (node: Node) => {
      found ||= node.position?.start.offset === at && node.value === value
    })
  }
  return found
}

function isDollarFragment(node: Node): node is Fragment {
  return node.type === "latex-fragment" && /^\$(?!\$)/.test(node.value ?? "")
}

// a line's `$x$` fragments, in order, inside its inline nodes
function fragmentsIn(children: Node[]): Fragment[] {
  const found: Fragment[] = []
  for (const child of children.filter(isInline)) {
    visit(child, (node: Node) => {
      if (isDollarFragment(node)) {
        found.push(node)
      }
    })
  }
  return found
}

/**
 * md→org: writes inline math as `\(x\)` where org would not read `$x$`
 * in its place (`$\a$|`, `$$\a$`, `$a$\a$`), which would stay text or
 * pair with another `$`.
 */
export function delimitInlineMath(tree: Parent): void {
  visit(tree, (node: Node | Parent) => {
    if (isInline(node) || !("children" in node)) {
      return undefined
    }
    const children = node.children as Node[]
    // left to right: a rewritten fragment is the next one's neighbor
    for (const fragment of fragmentsIn(children)) {
      const value = fragment.value
      fragment.value = PLACEHOLDER
      const line = renderChildren(children).join("")
      fragment.value = value
      const at = line.indexOf(PLACEHOLDER)
      const reads =
        readsAsDollar(fragment.contents, line, at) &&
        readsInPlace(line.replace(PLACEHOLDER, value ?? ""), at, value ?? "")
      // org→md trims blank math to `$$`, a math block fence
      if (
        fragment.contents.trim() &&
        !reads &&
        !fragment.contents.includes("\\)")
      ) {
        fragment.value = `\\(${fragment.contents}\\)`
      }
    }
    return undefined
  })
}
