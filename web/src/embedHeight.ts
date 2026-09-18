/**
 * Tells a host page how tall the Embed Page is, so it can size the
 * iframe to the content. A host that has to guess gets one of two bad
 * outcomes: a scrollbar inside the frame — a nested scroll, right next
 * to the textareas' own — or a band of dead space under it. Neither is
 * a guess a host can fix on its own, because the height depends on
 * what this page does: expanding Options or Config roughly doubles it.
 */

/** The `type` a host filters incoming messages on. */
const HEIGHT_MESSAGE = "morg:height"

type HeightMessage = {
  type: typeof HEIGHT_MESSAGE
  height: number
}

/**
 * The content's own height — neither of the two obvious readings is
 * that. `scrollHeight` reports the viewport height whenever the
 * content is shorter than it, and in a frame already sized to the
 * content the two are the same number, so a page reporting it could
 * grow but never shrink back. The rect's `bottom` is measured from the
 * viewport's top, so it drops by whatever the document happens to be
 * scrolled by — which is how a frame too short to hold its content
 * would ask to be made shorter still.
 */
function contentHeight(): number {
  return Math.ceil(document.body.getBoundingClientRect().height)
}

/**
 * Posts the height to the host, now and on every later change.
 *
 * The target origin is `"*"`: the page cannot know its host, and being
 * embedded by other sites is what it is for. The message says how tall
 * this page's own chrome is and nothing else — never the document
 * being converted, which does not leave the browser.
 */
export function reportHeight(): void {
  // unframed, `parent` is the window itself, and the message would come
  // straight back to a page that has no listener for it
  if (window.parent === window) return

  let reported: number | undefined
  const post = (): void => {
    const height = contentHeight()
    if (height === reported) return
    reported = height
    const message: HeightMessage = { type: HEIGHT_MESSAGE, height }
    window.parent.postMessage(message, "*")
  }

  // fires once on observe, which is the initial report
  new ResizeObserver(post).observe(document.body)
}

/**
 * The host half: sizes `frame` to whatever the Embed Page inside it
 * reports, which is what the converter page does with its own embed.
 *
 * The guard is `event.source`, not the origin — the embed is served
 * from this very origin, so an origin check would let any other page
 * of the site through while this one names the frame being sized.
 */
export function followFrameHeight(frame: HTMLIFrameElement): void {
  addEventListener("message", event => {
    if (event.source !== frame.contentWindow) return
    const message = event.data as Partial<HeightMessage> | null | undefined
    if (message?.type !== HEIGHT_MESSAGE) return
    if (typeof message.height !== "number") return
    frame.style.height = `${message.height}px`
  })
}
