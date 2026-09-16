// `git describe --tags` output, injected at build time (see
// web/vite.config.ts). Shown in the page chrome so a support question
// can be answered without guessing which commit is deployed: the Web UI
// ships from every push to `main`, so it is usually ahead of the tag.
declare const __MORG_VERSION__: string | undefined

export const MORG_VERSION =
  typeof __MORG_VERSION__ === "string" ? __MORG_VERSION__ : "unknown"

const REPOSITORY = "https://github.com/remigius42/morg"
// `main`, not the tag: a tag's CHANGELOG.md is missing everything under
// Unreleased, which is exactly what a deploy ahead of the tag contains.
const CHANGELOG_URL = `${REPOSITORY}/blob/main/CHANGELOG.md`

/** One run of the version string, linked or plain. */
export interface VersionPart {
  text: string
  href?: string
  /** Accessible name; the link text alone reads as noise. */
  label?: string
}

const DESCRIBED = /^(.*)-(\d+)-(g[0-9a-f]{7,40})$/
const BARE_SHA = /^[0-9a-f]{7,40}$/
const TAG = /^v\d/

/**
 * Splits `git describe --tags --always --dirty` output into its linkable
 * runs: `v0.3.0-3-g0a1b2c3-dirty` becomes the tag, the plain `-3-`, the
 * commit and the plain `-dirty`. Anything unrecognized stays one plain
 * part, so a fallback string is displayed rather than wrongly linked.
 * @param version The version string to split.
 * @returns The parts, in display order; concatenating them restores the input.
 */
export function versionParts(version: string): VersionPart[] {
  const dirty = version.endsWith("-dirty")
  const described = dirty ? version.slice(0, -"-dirty".length) : version
  const tail: VersionPart[] = dirty ? [{ text: "-dirty" }] : []

  const ahead = DESCRIBED.exec(described)
  if (ahead) {
    // the defaults are unreachable: every group of DESCRIBED is required
    const [, tag = "", commits = "", sha = ""] = ahead
    return [
      ...linkedTag(tag),
      { text: `-${commits}-` },
      {
        text: sha,
        href: `${REPOSITORY}/commit/${sha.slice(1)}`,
        label: `commit ${sha.slice(1)}`
      },
      ...tail
    ]
  }

  if (BARE_SHA.test(described)) {
    return [
      {
        text: described,
        href: `${REPOSITORY}/commit/${described}`,
        label: `commit ${described}`
      },
      ...tail
    ]
  }

  return [...linkedTag(described), ...tail]
}

function linkedTag(tag: string): VersionPart[] {
  return TAG.test(tag)
    ? [{ text: tag, href: CHANGELOG_URL, label: `morg ${tag} changelog` }]
    : [{ text: tag }]
}

/** Fills the `#version` placeholder, if the page has one. */
export function renderVersion(): void {
  const element = document.getElementById("version")
  if (!element) {
    return
  }
  element.replaceChildren(
    ...versionParts(MORG_VERSION).map(part => {
      if (!part.href) {
        return document.createTextNode(part.text)
      }
      const link = document.createElement("a")
      link.href = part.href
      link.textContent = part.text
      link.setAttribute("aria-label", `${part.label} (opens in a new tab)`)
      // the embed page runs in an iframe, where a same-frame navigation
      // would replace the converter inside its host
      link.target = "_blank"
      link.rel = "noopener noreferrer"
      return link
    })
  )
  element.title = `morg version ${MORG_VERSION}`
}
