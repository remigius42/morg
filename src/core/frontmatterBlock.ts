import type { CommentBlock, OrgData } from "uniorg"
import { affiliatedEntries, DUAL_NAMES } from "./affiliated.js"
import { escapeBlockLines, unescapeBlockLines } from "./commaEscapes.js"
import { positionParser } from "./render.js"
import {
  CST,
  isMap,
  isScalar,
  isSeq,
  Lexer,
  parseDocument,
  visit,
  type Document,
  type Pair,
  type Scalar
} from "yaml"

// frontmatter travels verbatim in a comment block marked as morg's
// (ADR 0005); uniorg keeps neither the block's parameter nor its
// unescaped value, so the block is rendered as raw text
export const FRONTMATTER_BLOCK_BEGIN = "#+begin_comment morg_frontmatter"

// md→org carries the frontmatter as this node until just before
// the org text is written, so a preset can still take entries out
export interface FrontmatterNode {
  type: "morg-frontmatter"
  yaml: string
}

export function isFrontmatterNode(node: {
  type: string
}): node is FrontmatterNode {
  return node.type === "morg-frontmatter"
}

/**
 * md→org: puts the file's header in place, past keywords any pass put
 * in front: an Emacs mode line and the file-level drawer lead the file,
 * keywords org would attach to what follows stay apart, and the
 * frontmatter node becomes the marked comment block.
 * @param uniorgAst The document.
 */
export function renderFileHeader(uniorgAst: OrgData): void {
  leadWithFileHeader(uniorgAst)
  detachLeadingKeywords(uniorgAst)
  renderFrontmatterBlock(uniorgAst)
}

// the frontmatter node as a marked org comment block, raw text
// uniorg-stringify writes as is
function renderFrontmatterBlock(uniorgAst: OrgData): void {
  const children = uniorgAst.children as unknown as {
    type: string
    value?: string
  }[]
  const index = children.findIndex(isFrontmatterNode)
  const node = children[index] as FrontmatterNode | undefined
  if (node) {
    children[index] = { type: "text", value: frontmatterBlock(node.yaml) }
  }
}

// org reads these directly above an element as its affiliated keywords
// (uniorg-parse's list, aliases included), not as document keywords;
// `#+NAME:: x` too, which uniorg reads as the key `NAME:` elsewhere
const AFFILIATED_RE = new RegExp(
  String.raw`^(?:(?:${DUAL_NAMES})(?:\[.*\])?|DATA|HEADERS?|LABEL|NAME|PLOT|RESNAME|RESULT|SOURCE|SRCNAME|TBLNAME|ATTR_[-\w]+):*$`,
  "i"
)

function isAffiliatedKey(key: string): boolean {
  return AFFILIATED_RE.test(key)
}

/**
 * md→org: a blank line after each leading keyword org would otherwise
 * attach to the element below it, a keyword or the block included.
 * @param uniorgAst The document.
 */
function detachLeadingKeywords(uniorgAst: OrgData): void {
  const children = uniorgAst.children as unknown as {
    type: string
    key?: string
    value?: string
  }[]
  const first = children.findIndex(
    node => node.type !== "comment" && node.type !== "property-drawer"
  )
  for (let i = first; children[i]?.type === "keyword"; i++) {
    if (children[i + 1] && isAffiliatedKey(children[i]?.key ?? "")) {
      children.splice(++i, 0, { type: "text", value: "\n" })
    }
  }
}

/**
 * The Frontmatter Block carrying YAML through org (ADR 0005).
 * @param yaml The YAML source, without its `---` fences.
 * @returns The block's org text.
 */
export function frontmatterBlock(yaml: string): string {
  const body = yaml ? `${escapeBlockLines(yaml)}\n` : ""
  return `${FRONTMATTER_BLOCK_BEGIN}\n${body}#+end_comment\n`
}

/**
 * md→org: takes the top-level entries `take` maps to keywords out of
 * the frontmatter; the rest stays verbatim, comments included.
 * @param yaml The frontmatter's YAML text.
 * @param take Keywords for an entry, or null to leave it in place.
 * @returns The keywords in order, and the remaining YAML text.
 */
export function takeFrontmatterEntries(
  yaml: string,
  take: (
    key: Scalar,
    value: unknown,
    text: (scalar: Scalar) => string
  ) => [string, string][] | null
): { keywords: [string, string][]; yaml: string } {
  const document = parseDocument(yaml)
  const keywords: [string, string][] = []
  let rest = ""
  let from = 0
  let comments: [number, string][] | undefined
  for (const { key, value } of cuttableEntries(document)) {
    const entries = isScalar(key)
      ? take(key, value, scalar => scalarText(scalar, yaml))
      : null
    const span = entrySpan(key, value, yaml)
    if (!entries || !span) {
      continue
    }
    keywords.push(...entries)
    comments ??= yamlComments(yaml)
    rest += yaml.slice(from, span[0]) + commentLines(comments, span)
    from = span[1]
  }
  const left = rest + yaml.slice(from)
  return keywords.length
    ? { keywords, yaml: from === yaml.length ? dropCutNewline(left) : left }
    : { keywords, yaml }
}

// the newline before a cut at the end, unless a keep-chomped (`|+`)
// scalar above it holds it as a line of its own
function dropCutNewline(yaml: string): string {
  const dropped = yaml.replace(/\n$/, "")
  const value = (text: string): string =>
    JSON.stringify(parseDocument(text).toJS())
  return value(dropped) === value(yaml) ? dropped : yaml
}

// entries can be cut out of a block mapping, one per line, unless an
// alias would lose its anchor or the YAML has errors, which make the
// ranges unreliable
function cuttableEntries(document: Document): Pair[] {
  const contents = document.contents
  let aliased = false
  visit(document, {
    Alias() {
      aliased = true
      return visit.BREAK
    }
  })
  return isMap(contents) &&
    !contents.flow &&
    !aliased &&
    !document.errors.length
    ? contents.items
    : []
}

// a plain scalar as written: its parsed value would rewrite `1.10` as
// `1.1`, `01234` as `1234` and an empty value as `null`; a quoted one
// as its string
function scalarText(scalar: Scalar, yaml: string): string {
  const [start, end] = scalar.range ?? [0, 0]
  return scalar.type === "PLAIN" ? yaml.slice(start, end) : String(scalar.value)
}

// an entry's source text, from the start of its key's line (an explicit
// `? `, an anchor or a tag precede the key itself) to the end of its value
function entrySpan(
  key: unknown,
  value: unknown,
  yaml: string
): [number, number] | null {
  const start = isScalar(key) ? key.range?.[0] : undefined
  const end = (value as { range?: number[] } | null)?.range?.[2]
  return start === undefined || end === undefined
    ? null
    : [yaml.lastIndexOf("\n", start - 1) + 1, end]
}

const CONTROL_TOKENS = [CST.DOCUMENT, CST.FLOW_END, CST.SCALAR]

// each comment and its offset
function yamlComments(yaml: string): [number, string][] {
  const comments: [number, string][] = []
  let offset = 0
  for (const token of new Lexer().lex(yaml)) {
    if (token.startsWith("#")) {
      comments.push([offset, token])
    }
    // control tokens mark structure, but hold no source
    offset += CONTROL_TOKENS.includes(token) ? 0 : token.length
  }
  return comments
}

// the comments within a span, each on a line of its own
function commentLines(
  comments: [number, string][],
  [start, end]: [number, number]
): string {
  return comments
    .filter(([offset]) => offset >= start && offset < end)
    .map(([, comment]) => `${comment}\n`)
    .join("")
}

// a keyword name as uniorg reads it in `#+NAME: value`: no whitespace
// outside a dual keyword's brackets (`#+FOO:: bar` as the key `FOO:`)
export const KEYWORD_NAME = String.raw`(?:\[[^\]\r\n]*\]|\S)+`

// what a `#+KEY: value` line can hold, read back as the same key: not a
// block's begin line, and no line break, which would end it and inject
// org structure
const KEYWORD_KEY_RE = new RegExp(String.raw`^(?!begin_)${KEYWORD_NAME}$`, "i")

export function fitsKeywordLine(key: string, value: string): boolean {
  return KEYWORD_KEY_RE.test(key) && !/[\r\n]/.test(value)
}

// what a `:KEY: value` drawer line can hold, read back as the same key
// (`:header-args:python:` included): `:END:` would close the drawer
export function fitsPropertyLine(key: string, value: string): boolean {
  return /^\S+$/.test(key) && !/^end$/i.test(key) && !/[\r\n]/.test(value)
}

/**
 * org→md: whether morg's own entries (`morg_properties`,
 * `morg_keywords`) can join the frontmatter: whether the YAML with one
 * more top-level entry appended still parses as a single block mapping
 * holding none of them yet. Comments alone take them; an indented
 * mapping, a list, a flow mapping or a document ending in `...` do not.
 * @param yaml The frontmatter's YAML text.
 */
export function takesMorgEntries(yaml: string): boolean {
  if (!yaml.trim()) {
    return true
  }
  const document = parseDocument(`${yaml}\nmorg_probe: x`)
  const contents = document.contents
  return (
    !document.errors.length &&
    isMap(contents) &&
    !contents.flow &&
    !contents.has("morg_keywords") &&
    !contents.has("morg_properties")
  )
}

/**
 * md→org: one of morg's own entries, a sequence of one-entry maps
 * (`morg_keywords`, `morg_properties`, ADR 0005), restored only if
 * every item fits its org line.
 * @param yaml The frontmatter's YAML text.
 * @param name The entry's key.
 * @param fits Whether a key and value fit the org line they go back to.
 * @returns The key, value pairs in order, and the remaining YAML text.
 */
export function takeMorgEntry(
  yaml: string,
  name: string,
  fits: (key: string, value: string) => boolean
): { keywords: [string, string][]; yaml: string } {
  return takeFrontmatterEntries(yaml, (key, value, text) =>
    key.value === name && isSeq(value)
      ? morgEntryItems(value.items, text, fits)
      : null
  )
}

// each item a single `KEY: value` pair, or the entry is not morg's to
// restore and stays in the frontmatter as written
function morgEntryItems(
  items: unknown[],
  text: (scalar: Scalar) => string,
  fits: (key: string, value: string) => boolean
): [string, string][] | null {
  const entries: [string, string][] = []
  for (const item of items) {
    const pair = isMap(item) && item.items.length === 1 ? item.items[0] : null
    if (
      !isScalar(pair?.key) ||
      !(pair.value === null || isScalar(pair.value))
    ) {
      return null
    }
    const entry: [string, string] = [
      text(pair.key),
      pair.value ? text(pair.value) : ""
    ]
    if (!fits(...entry)) {
      return null
    }
    entries.push(entry)
  }
  return entries
}

// the file's header as the transform options that carry it
interface FileHeader {
  frontmatter?: string
  fileProperties?: [string, string][]
  takesMorgEntries: boolean
  startsWithModeLine: boolean
}

/**
 * org→md: takes the file's header morg carries as frontmatter: the
 * marked block and, where its YAML can take it, a file-level drawer.
 * @param uniorgAst The parsed document.
 * @param org The text it was parsed from.
 * @param onWarning Reports a marked block morg cannot take.
 * @returns The transform options holding them.
 */
export function takeFileHeader(
  uniorgAst: OrgData,
  org: string,
  onWarning?: (message: string) => void
): FileHeader {
  // uniorg drops leading blank lines: a -*- comment below one is inert
  const modeLine = startsWithModeLine(uniorgAst) && isModeLine(org)
  detachKeywordsOfKeywords(uniorgAst)
  return headerOptions(
    uniorgAst,
    takeFrontmatterBlock(uniorgAst, org, onWarning),
    modeLine
  )
}

// `#+NAME: n` directly above `#+TITLE: t`: uniorg attaches it to the
// keyword below, where nothing reads it; it becomes a keyword of its own
function detachKeywordsOfKeywords(uniorgAst: OrgData): void {
  const children = uniorgAst.children
  for (let i = zerothSection(children).length - 1; i >= 0; i--) {
    const node = children[i]
    if (node?.type === "keyword") {
      children.splice(i, 0, ...affiliatedKeywords(node.affiliated))
      node.affiliated = {}
    }
  }
}

// affiliated keywords as keyword nodes, upper-cased as org reads them
// apart from their element: a short caption too
function affiliatedKeywords(
  affiliated: CommentBlock["affiliated"]
): OrgData["children"] {
  return affiliatedEntries(affiliated, true).map(([key, value]) => ({
    type: "keyword",
    key: key.toUpperCase(),
    value
  })) as OrgData["children"]
}

/**
 * org→md, for a tree `transformMdastToUniorgAst` built rather than one
 * parsed from org text: its file header, the block still raw text.
 * @param uniorgAst The document; its header nodes are removed.
 * @returns The transform options holding the header.
 */
export function takeRenderedFileHeader(uniorgAst: OrgData): FileHeader {
  const modeLine = startsWithModeLine(uniorgAst)
  const header = zerothSection(uniorgAst.children)
  const block = header.find(node => renderedBlockYaml(node) !== undefined)
  const frontmatter = renderedBlockYaml(block)
  // the block, and the separators renderFileHeader put below keywords
  uniorgAst.children = uniorgAst.children.filter(
    (node, i, children) =>
      node !== block &&
      !(
        i < header.length &&
        isSeparator(node) &&
        children[i - 1]?.type === "keyword"
      )
  )
  return headerOptions(uniorgAst, frontmatter, modeLine)
}

// the transform options for a header whose block is taken: the
// file-level drawer joins it where its YAML can take it
function headerOptions(
  uniorgAst: OrgData,
  frontmatter: string | undefined,
  modeLine: boolean
): FileHeader {
  const takes = takesMorgEntries(frontmatter ?? "")
  const fileProperties = takes ? takeFileDrawer(uniorgAst) : undefined
  return {
    ...(frontmatter !== undefined && { frontmatter }),
    ...(fileProperties && { fileProperties }),
    takesMorgEntries: takes,
    startsWithModeLine: modeLine
  }
}

// before the header is taken, which may leave a comment first
function startsWithModeLine(uniorgAst: OrgData): boolean {
  const first = uniorgAst.children[0]
  return !!first && isModeLineComment(first)
}

function zerothSection<T extends { type: string }>(children: T[]): T[] {
  const headline = children.findIndex(node => node.type === "headline")
  return headline === -1 ? children : children.slice(0, headline)
}

function isSeparator(node: { type: string }): boolean {
  return node.type === "text" && (node as { value?: string }).value === "\n"
}

// the YAML of a block `frontmatterBlock` rendered, or undefined
function renderedBlockYaml(node?: { type: string }): string | undefined {
  const text =
    node?.type === "text" ? ((node as { value?: string }).value ?? "") : ""
  const begin = `${FRONTMATTER_BLOCK_BEGIN}\n`
  const end = "#+end_comment\n"
  if (!text.startsWith(begin) || !text.endsWith(end)) {
    return undefined
  }
  return unescapeBlockLines(text.slice(begin.length, -end.length)).replace(
    /\n$/,
    ""
  )
}

/**
 * org→md: removes a file-level property drawer (org-roam's `:ID:`),
 * which org reads as the file's only where nothing but comments
 * precede it.
 * @param uniorgAst The parsed document.
 * @returns Its properties in order, or undefined without one.
 */
function takeFileDrawer(uniorgAst: OrgData): [string, string][] | undefined {
  const children = uniorgAst.children
  const index = children.findIndex(node => node.type !== "comment")
  const drawer = children[index]
  if (drawer?.type !== "property-drawer") {
    return undefined
  }
  children.splice(index, 1)
  return drawer.children.map(property => [property.key, property.value])
}

// Emacs reads file variables from a `-*- … -*-` comment on the first line
const MODE_LINE_RE = /^[^\n]*-\*-.*-\*-/

export function isModeLine(comment: string): boolean {
  return MODE_LINE_RE.test(comment)
}

export function isModeLineComment(node: { type: string }): boolean {
  return (
    node.type === "comment" &&
    isModeLine((node as { value?: string }).value ?? "")
  )
}

/**
 * md→org: marks the comment made from the Markdown body's first node as
 * the file's mode line, if it is a -*- comment: what passes do to the
 * tree before the header is rendered cannot make another one lead.
 * @param node The uniorg node made from the body's first node.
 */
export function markModeLine(node: { type: string } | null): void {
  if (node && isModeLineComment(node)) {
    ;(node as { modeLine?: boolean }).modeLine = true
  }
}

/**
 * md→org: the file's header leads it, past keywords any pass put in
 * front: the marked Emacs mode line on the first line, then the
 * file-level property drawer, which org reads as the file's only where
 * nothing but comments precede it.
 * @param uniorgAst The document.
 */
function leadWithFileHeader(uniorgAst: OrgData): void {
  const children = uniorgAst.children as unknown as {
    type: string
    modeLine?: boolean
  }[]
  const body = children.findIndex(node => node.modeLine)
  const modeLine = children[body]
  if (modeLine) {
    children.splice(body, 1)
    children.unshift(modeLine)
  }
  const index = zerothSection(children).findIndex(
    node => node.type === "property-drawer"
  )
  if (index === -1) {
    return
  }
  const [drawer] = children.splice(index, 1)
  const at = children.findIndex(node => node.type !== "comment")
  children.splice(
    at === -1 ? children.length : at,
    0,
    drawer as { type: string }
  )
}

/**
 * org→md: removes the marked frontmatter block, the first one before
 * the first headline, recognized by its own begin line in the source.
 * Keywords org attached to it stay, as keywords in its place: they
 * come back apart from it, as nothing reads them on a comment block.
 * @param uniorgAst The parsed document.
 * @param org The text it was parsed from.
 * @param onWarning Reports keywords attached to the block, and any
 * other marked block, which stays a comment block: uniorg drops its
 * marker.
 * @returns The frontmatter's YAML text, or undefined without a block.
 */
function takeFrontmatterBlock(
  uniorgAst: OrgData,
  org: string,
  onWarning?: (message: string) => void
): string | undefined {
  const children = uniorgAst.children
  const blocks = zerothSectionCommentBlocks(uniorgAst)
  if (!blocks.length) {
    return undefined
  }
  const [index, ...others] = markedBlockIndices(org, blocks.length)
  if (others.length) {
    onWarning?.(
      "second frontmatter block stays a comment block, without its marker"
    )
  }
  const node = index === undefined ? undefined : blocks[index]
  if (!node) {
    return undefined
  }
  if (Object.keys(node.affiliated).length) {
    onWarning?.("keywords on the frontmatter block come back apart from it")
  }
  children.splice(
    children.indexOf(node),
    1,
    ...affiliatedKeywords(node.affiliated)
  )
  return unescapeBlockLines(node.value).replace(/\n$/, "")
}

function zerothSectionCommentBlocks(uniorgAst: OrgData): CommentBlock[] {
  const blocks: CommentBlock[] = []
  for (const node of uniorgAst.children) {
    if (node.type === "headline" || node.type === "section") {
      break
    }
    if (node.type === "comment-block") {
      blocks.push(node)
    }
  }
  return blocks
}

// uniorg drops the parameter after #+begin_comment; a parse that keeps
// positions finds each block's own begin line (after any keywords org
// attached to it)
const BEGIN_COMMENT_RE = /^[ \t]*#\+begin_comment(.*)$/im

// org reads a line of stars and a space or tab as a headline anywhere,
// which is why blocks comma-escape theirs
const HEADLINE_RE = /^\*+[ \t]/m

// `count`: how many comment blocks the full parse found there
function markedBlockIndices(org: string, count: number): number[] {
  // only the text before the first headline: its blocks are all we need,
  // unless a star line inside a block cut it short
  const headline = HEADLINE_RE.exec(org)?.index ?? org.length
  let zeroth = org.slice(0, headline)
  let blocks = zerothSectionCommentBlocks(positionParser.parse(zeroth))
  if (blocks.length !== count) {
    zeroth = org
    blocks = zerothSectionCommentBlocks(positionParser.parse(org))
  }
  return blocks.flatMap((block, i) => {
    const start = block.position?.start.offset ?? 0
    return BEGIN_COMMENT_RE.exec(zeroth.slice(start))?.[1]?.trim() ===
      "morg_frontmatter"
      ? [i]
      : []
  })
}
