/**
 * Running conversions and saying that one is running. Its own module
 * because the two mechanisms here are the subtlest code on the page and
 * neither is visible in what it does: a monotonic ticket that drops a
 * result a newer edit has overtaken, and a delay before a conversion is
 * announced at all.
 *
 * The one part of the split that still takes the whole `Controls`. It
 * reads and writes a dozen fields, including the run state itself
 * (`latestRun`, `convertingTimer`, `notices`), so narrowing it would
 * only mean passing `Controls` under another name.
 */
import { formState, type Controls } from "./controls.js"
import { readsMarkdown, type Direction } from "../direction.js"

/**
 * How long typing pauses before the conversion runs. Long enough that a
 * word is typed in one run, short enough that the output still feels
 * live at the end of a line.
 */
export const DEBOUNCE_MS = 200

/**
 * How long a conversion may run before it is announced. Below this the
 * notice would appear and vanish within a frame or two of every pause.
 */
export const CONVERTING_AFTER_MS = 150

export async function convert(controls: Controls): Promise<void> {
  const { input, output, error, warnings, direction, config } = controls
  // the placeholder describes the box, not the result, so it follows the
  // direction immediately rather than waiting for the run to come back
  input.placeholder = readsMarkdown(direction.value as Direction)
    ? "Paste Markdown here…"
    : "Paste Org here…"

  const ticket = ++controls.latestRun
  beginRun(controls)
  let result
  try {
    result = await controls.runner.run(
      input.value,
      formState(controls),
      config.value
    )
  } catch (cause) {
    // the conversion did not fail, it never ran — a dead worker whose
    // stand-in could not be loaded. Nothing else will take the notice
    // down, and a page that stays "Converting…" for good is worse than
    // one that says what went wrong
    if (ticket === controls.latestRun) {
      endRun(controls)
      error.hidden = false
      error.textContent = `Could not convert: ${String(cause)}`
    }
    return
  }
  if (ticket !== controls.latestRun) {
    return // a newer run has been asked for; this output is already stale
  }
  endRun(controls)
  output.value = result.output
  error.hidden = !result.error
  error.textContent = result.error ?? ""
  // a failed conversion leaves the output empty; saving it would write an
  // empty file, under normalize one named all but identically to the source
  controls.copyButton.disabled = Boolean(result.error)
  controls.downloadButton.disabled = Boolean(result.error)
  const messages = [...controls.notices, ...result.warnings]
  warnings.hidden = messages.length === 0
  warnings.replaceChildren(
    ...messages.map(message => {
      const item = document.createElement("li")
      item.textContent = message
      return item
    })
  )
}

/**
 * Marks a conversion as in flight. The output box still holds the last
 * result, which belongs to a document that is no longer in the input, so
 * Copy and Download come off until it has been replaced — saving stale
 * output is the same silent data loss as saving under a stale name.
 *
 * Off the UI thread there is nothing else to notice a conversion by: the
 * freeze used to be the progress indicator. The notice is delayed rather
 * than shown outright, since an ordinary document converts in a few
 * milliseconds and a notice that fast is a blink on every keystroke.
 */
function beginRun(controls: Controls): void {
  controls.copyButton.disabled = true
  controls.downloadButton.disabled = true
  clearTimeout(controls.convertingTimer)
  controls.convertingTimer = setTimeout(() => {
    controls.converting.hidden = false
  }, CONVERTING_AFTER_MS)
}

/** Drops the in-flight marks; the result itself sets what comes after. */
function endRun(controls: Controls): void {
  clearTimeout(controls.convertingTimer)
  controls.converting.hidden = true
}

/**
 * Runs a conversion without waiting for it. Every caller paints through
 * `convert` itself, and a stale run is dropped there rather than thrown.
 */
export function startConvert(controls: Controls): void {
  void convert(controls)
}

/** Delays `run` until `wait` ms have passed without another call. */
export function debounce(run: () => void, wait: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return () => {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
    timer = setTimeout(run, wait)
  }
}
