/**
 * Marks the section being read in a docs page's outline
 * (scripts/docsPages.mjs), as VitePress does, so a reader who scrolled
 * sees where in the page they are.
 */

/**
 * Which section is being read, by its heading's distance from the
 * viewport's top: the last one scrolled up past `offset`, or none above
 * the first. At the bottom of a scrolled page it is the last section,
 * which may be too short to bring its heading up that far.
 * @returns the section's index, -1 for none
 */
export function currentSection(
  tops: number[],
  offset: number,
  atBottom: boolean
): number {
  if (atBottom) return tops.length - 1
  // the headings come in page order, so those past the offset lead
  return tops.filter(top => top <= offset).length - 1
}

/** Keeps the outline's current link marked as the page scrolls. */
export function followOutline(outline: HTMLElement): void {
  const links = [...outline.querySelectorAll<HTMLAnchorElement>("a")]
  const headings = links.map(link =>
    document.getElementById(decodeURIComponent(link.hash.slice(1)))
  )
  const update = () => {
    const root = document.documentElement
    const current = currentSection(
      headings.map(heading => heading?.getBoundingClientRect().top ?? Infinity),
      // a heading in the top third is the one the text below it is read under
      innerHeight / 3,
      scrollY > 0 && scrollY + innerHeight >= root.scrollHeight - 1
    )
    links.forEach((link, index) => {
      if (index === current) link.setAttribute("aria-current", "location")
      else link.removeAttribute("aria-current")
    })
  }
  addEventListener("scroll", update, { passive: true })
  addEventListener("resize", update)
  update()
}
