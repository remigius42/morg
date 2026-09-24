import type { OrgData } from "uniorg"
import type { Parent } from "unist"
import { unified } from "unified"
import uniorgParse from "uniorg-parse"
import { visit } from "unist-util-visit"

// org's `#+OPTIONS: ^:{}` limits sub/superscripts to the braced form
// (`H_{2}O`), so a bare underscore or caret (`a_b`, `x^y`) stays text.
// Markdown has no script syntax, so md text needs it; the braced
// scripts morg itself emits are unaffected
const BRACED_SCRIPTS = "^:{}"

type Keyword = OrgData["children"][number] & { key: string; value: string }

// built once: constructing a processor per parse dominates the cost
const scriptsParser = unified().use(uniorgParse).freeze()
const bracedScriptsParser = unified()
  .use(uniorgParse, { useSubSuperscripts: "{}" })
  .freeze()

function countScripts(text: string, braced: boolean): number {
  const tree = (braced ? bracedScriptsParser : scriptsParser).parse(text)
  let count = 0
  visit(tree as Parent, node => {
    if (node.type === "subscript" || node.type === "superscript") {
      count++
    }
  })
  return count
}

function readsBareScripts(tree: Parent): boolean {
  let found = false
  visit(tree, "text", (node: { value: string }) => {
    if (/[_^]/.test(node.value)) {
      found ||= countScripts(node.value, false) > countScripts(node.value, true)
    }
  })
  return found
}

function isOptions(node: OrgData["children"][number]): node is Keyword {
  return (
    node.type === "keyword" && (node as Keyword).key.toUpperCase() === "OPTIONS"
  )
}

/**
 * md→org: adds `^:{}` to the document's `#+OPTIONS:` when its text
 * holds a bare underscore or caret org would read as a script.
 */
export function requireBracedScripts(uniorgAst: OrgData): void {
  if (!readsBareScripts(uniorgAst)) {
    return
  }
  const options = uniorgAst.children.find(isOptions)
  if (!options) {
    uniorgAst.children.unshift({
      type: "keyword",
      key: "OPTIONS",
      value: BRACED_SCRIPTS
    } as Keyword)
  } else if (!/(^|\s)\^:/.test(options.value)) {
    // an explicit ^: setting is the author's call
    options.value = `${options.value} ${BRACED_SCRIPTS}`
  }
}

// whether the document may limit scripts to the braced form, which the
// parser has to know up front; only a top-level keyword counts, which
// takes a parse to tell
function mayUseBracedScripts(org: string): boolean {
  return [...org.matchAll(/^[ \t]*#\+options:(.*)$/gim)].some(([, value]) =>
    (value ?? "").split(/\s+/).includes(BRACED_SCRIPTS)
  )
}

// drops `^:{}` from the top-level `#+OPTIONS:`, the whole keyword if
// nothing else is left; md text has no scripts, so the return trip
// re-adds it wherever it is needed. Returns whether there was one
function takeBracedScripts(uniorgAst: OrgData): boolean {
  let taken = false
  uniorgAst.children = uniorgAst.children.filter(node => {
    if (!isOptions(node)) {
      return true
    }
    const items = node.value.split(/\s+/)
    node.value = items.filter(item => item && item !== BRACED_SCRIPTS).join(" ")
    taken ||= items.includes(BRACED_SCRIPTS)
    return node.value !== ""
  })
  return taken
}

/**
 * org→md: parses org, honoring and then consuming `^:{}`.
 */
export function parseOrg(org: string): OrgData {
  if (mayUseBracedScripts(org)) {
    // keywords parse the same either way
    const uniorgAst = bracedScriptsParser.parse(org)
    if (takeBracedScripts(uniorgAst)) {
      return uniorgAst
    }
  }
  return scriptsParser.parse(org)
}
