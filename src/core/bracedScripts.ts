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

// whether the document limits scripts to the braced form, which the
// parser has to know up front
function usesBracedScripts(org: string): boolean {
  return [...org.matchAll(/^[ \t]*#\+options:(.*)$/gim)].some(([, value]) =>
    (value ?? "").split(/\s+/).includes(BRACED_SCRIPTS)
  )
}

// drops `^:{}` from `#+OPTIONS:`, the whole keyword if nothing else is
// left; md text has no scripts, so the return trip re-adds it wherever
// it is needed
function takeBracedScripts(uniorgAst: OrgData): void {
  uniorgAst.children = uniorgAst.children.filter(node => {
    if (!isOptions(node)) {
      return true
    }
    node.value = node.value
      .split(/\s+/)
      .filter(item => item && item !== BRACED_SCRIPTS)
      .join(" ")
    return node.value !== ""
  })
}

/**
 * org→md: parses org, honoring and then consuming `^:{}`.
 */
export function parseOrg(org: string): OrgData {
  const braced = usesBracedScripts(org)
  const uniorgAst = (braced ? bracedScriptsParser : scriptsParser).parse(org)
  if (braced) {
    takeBracedScripts(uniorgAst)
  }
  return uniorgAst
}
