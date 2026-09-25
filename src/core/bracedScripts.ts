import type { OrgData } from "uniorg"
import type { Parent } from "unist"
import { unified } from "unified"
import uniorgParse from "uniorg-parse"
import { EXIT, visit } from "unist-util-visit"
import {
  isInline,
  orgParser,
  renderChildren,
  tryParse,
  type Node
} from "./render.js"

// org's `#+OPTIONS: ^:{}` limits sub/superscripts to the braced form
// (`H_{2}O`), so a bare underscore or caret (`a_b`, `x^y`) stays text.
// Markdown has no script syntax, so md text needs it; the braced
// scripts morg itself emits are unaffected
const BRACED_SCRIPTS = "^:{}"

type Keyword = OrgData["children"][number] & { key: string; value: string }

// built once: constructing a processor per parse dominates the cost
const bracedScriptsParser = unified()
  .use(uniorgParse, { useSubSuperscripts: "{}" })
  .freeze()

// a text uniorg fails to read counts as holding none
function countScripts(text: string, braced: boolean): number {
  const tree = tryParse(text, braced ? bracedScriptsParser : orgParser)
  if (!tree) {
    return 0
  }
  let count = 0
  visit(tree, node => {
    if (node.type === "subscript" || node.type === "superscript") {
      count++
    }
  })
  return count
}

// a block's inline content as org renders it; a block element inside
// (a list item's nested list) only ends a line
function renderedContent(node: Node | Parent): string | undefined {
  if (
    isInline(node) ||
    !("children" in node) ||
    !node.children.some(isInline)
  ) {
    return undefined
  }
  return renderChildren(node.children).join("")
}

// whether org reads a script in the text that `^:{}` would keep text.
// Checked per block as rendered, not per text node: the char before a
// `_` or `^` may belong to a neighbor (a marker, a link's `]`, an
// escape); a script never spans blocks
function readsBareScripts(tree: Parent): boolean {
  let found = false
  visit(tree, (node: Node | Parent) => {
    const content = renderedContent(node)
    found =
      content !== undefined &&
      /[_^]/.test(content) &&
      countScripts(content, false) > countScripts(content, true)
    return found ? EXIT : undefined
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

// the `^:` setting in an `#+OPTIONS:` value, if any
function scriptsSetting(options: string): string | undefined {
  const items = options.split(/\s+/).filter(item => item.startsWith("^:"))
  return items.at(-1)?.slice(2)
}

// org→md honors every `^:` setting: `{}` limits scripts to the braced
// form, `nil` turns them off, `t` (org's default) keeps them on
const scriptsParsers: Record<string, { parse(org: string): unknown }> = {
  "{}": bracedScriptsParser,
  nil: unified().use(uniorgParse, { useSubSuperscripts: false }).freeze()
}

// the settings the document may use, which the parser has to know up
// front; only a top-level keyword counts, which takes a parse to tell
function mayUseScripts(org: string): string[] {
  const settings = [...org.matchAll(/^[ \t]*#\+options:(.*)$/gim)].map(
    ([, value]) => scriptsSetting(value ?? "")
  )
  return [...new Set(settings)].filter(
    (setting): setting is string => setting !== undefined
  )
}

function usesScripts(uniorgAst: OrgData, setting: string): boolean {
  return uniorgAst.children.some(
    node => isOptions(node) && scriptsSetting(node.value) === setting
  )
}

// drops `^:{}` from the top-level `#+OPTIONS:`, the whole keyword if
// nothing else is left; md text has no scripts, so the return trip
// re-adds it wherever it is needed
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
 * org→md: parses org, honoring its `^:` setting, and consuming `^:{}`
 * where the text needs it: md→org adds it only then, so anywhere else
 * it is the author's own setting.
 */
export function parseOrg(org: string): OrgData {
  for (const setting of mayUseScripts(org)) {
    const parser = scriptsParsers[setting]
    if (!parser) {
      continue
    }
    // keywords parse the same either way
    const uniorgAst = parser.parse(org) as OrgData
    if (usesScripts(uniorgAst, setting)) {
      if (setting === "{}" && readsBareScripts(uniorgAst)) {
        takeBracedScripts(uniorgAst)
      }
      return uniorgAst
    }
  }
  return orgParser.parse(org)
}
