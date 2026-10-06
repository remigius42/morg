import type { Heading, Root } from "mdast"
import type { Headline, Keyword, OrgData, Text } from "uniorg"
import { toString as orgastToString } from "orgast-util-to-string"
import { visit } from "unist-util-visit"

// A link to a place in the same file: org links a headline
// (`[[*Some Heading]]`), a `<<target>>` or a `#+NAME:` (a fuzzy
// `[[name]]`, which finds a headline of that name too), Markdown an
// anchor (`#some-heading`). A headline's anchor is the slug GitHub gives
// its heading, so the link works where Markdown renders; a target's or
// name's is its name.

// GitHub's slug (github-slugger): lower case, punctuation dropped, each
// space a hyphen, a repeated slug numbered
function slugger(): (text: string) => string {
  const seen = new Map<string, number>()
  return text => {
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
      .replaceAll(" ", "-")
    let slug = base
    let count = seen.get(base) ?? 0
    while (seen.has(slug)) {
      slug = `${base}-${++count}`
    }
    seen.set(base, count)
    seen.set(slug, 0)
    return slug
  }
}

/** Whether org can hold `path` in a link: a bracket would end it. */
export const isLinkable = (path: string): boolean => /^[^[\]]+$/.test(path)

// a `<<target>>`, text on both sides
const TARGET_RE = /<<([^<>\n]+)>>/g

// a `#+NAME:` line, which org→md writes as it is
const NAME_RE = /^[ \t]*#\+name:[ \t]*(\S.*)$/gim

// a headline's `:CUSTOM_ID:`, as org→md writes its property
const CUSTOM_ID_RE = /^custom_id::[ \t]*(\S+)/gim

export const normalized = (text: string): string =>
  text.trim().replace(/\s+/g, " ")

/** An internal link's anchor in Markdown and its text. */
export interface Anchor {
  anchor: string
  text: string
}

/**
 * org→md: the anchors of a document's internal links.
 * @param tree The parsed org document.
 * @returns The anchor of a fuzzy link's path (`*Heading`, `name`), or
 * null where the document holds nothing of that name.
 */
export function orgAnchors(tree: OrgData): (path: string) => Anchor | null {
  const names = new Set<string>()
  // uniorg reads a target as text; a name is an element's affiliated
  // keyword, or a keyword of its own above a table (tableKeywords)
  visit(tree, (node: { type: string; affiliated?: unknown }) => {
    if (node.type === "text") {
      for (const [, name] of (node as Text).value.matchAll(TARGET_RE)) {
        names.add(normalized(name as string))
      }
    }
    const { key, value } = node as Partial<Keyword>
    const name =
      node.type === "keyword" && key?.toUpperCase() === "NAME"
        ? value
        : (node.affiliated as { NAME?: unknown } | undefined)?.NAME
    if (typeof name === "string") {
      names.add(normalized(name))
    }
  })
  // a headline by its title, as org finds it, or its text, markup
  // aside, as md→org names it, to its heading's anchor and text
  const headings = new Map<string, Anchor>()
  const slug = slugger()
  visit(tree, "headline", (node: Headline) => {
    const plain = orgastToString(node).trim()
    const heading = { anchor: slug(plain), text: normalized(plain) }
    for (const title of [normalized(node.rawValue), heading.text]) {
      if (!headings.has(title)) {
        headings.set(title, heading)
      }
    }
  })
  return path => {
    const heading = path.startsWith("*")
    const name = normalized(heading ? path.slice(1) : path)
    if (!heading && names.has(name)) {
      return { anchor: name, text: name }
    }
    return headings.get(name) ?? null
  }
}

/** What a Markdown anchor names, and its link's text. */
export type MarkdownAnchor = ({ path: string } | { heading: Heading }) & {
  text: string
}

/**
 * md→org: the org links of a document's anchors.
 * @param root The parsed Markdown.
 * @returns The anchor's target: a name, the fuzzy link's path, or a
 * heading, whose org title the caller renders, markup and all, as org
 * finds a headline by it; with the text that is no description of its
 * own. Null where the document holds nothing of that anchor.
 */
export function markdownAnchors(
  root: Root
): (anchor: string) => MarkdownAnchor | null {
  const names = new Set<string>()
  const customIds = new Set<string>()
  const headings = new Map<string, Heading>()
  const slug = slugger()
  visit(root, node => {
    if (node.type === "text") {
      for (const [, id] of node.value.matchAll(CUSTOM_ID_RE)) {
        customIds.add(id as string)
      }
      for (const [, name] of node.value.matchAll(TARGET_RE)) {
        names.add(normalized(name as string))
      }
      for (const [, name] of node.value.matchAll(NAME_RE)) {
        names.add(normalized(name as string))
      }
    }
    // org drops a title's trailing blanks, which GitHub's slug keeps:
    // slugged without them, as org→md slugs the headline
    if (node.type === "heading") {
      headings.set(slug(orgastToString(node).trim()), node)
    }
  })
  return anchor => {
    // a headline's custom ID is what a `#` link names in org too
    if (customIds.has(anchor)) {
      return null
    }
    if (names.has(anchor) && isLinkable(anchor)) {
      return { path: anchor, text: anchor }
    }
    const heading = headings.get(anchor)
    return heading
      ? { heading, text: normalized(orgastToString(heading)) }
      : null
  }
}
