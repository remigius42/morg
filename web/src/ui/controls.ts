/**
 * The converter's controls: the elements the page is driven through, and
 * the state a conversion carries between them. Its own module because
 * every other part of the page needs the type and none of them should
 * need each other to get it — main.ts owning it would make the wiring
 * file a dependency of everything it wires.
 */
import type { ConversionForm } from "../pipeline/convert.js"
import type { Direction } from "../direction.js"
import type { ConversionRunner } from "../pipeline/runner.js"

/** The Markdown style knobs, which are a select each, named by their id. */
const STYLE_KEYS = ["bullet", "emphasis", "strong", "fence", "rule"] as const

/** An element the markup promises; missing one is a broken page, not a case. */
export function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) {
    throw new Error(`Missing element #${id}`)
  }
  return found as T
}

export interface Controls {
  direction: HTMLSelectElement
  preset: HTMLSelectElement
  useHtml: HTMLInputElement
  interpretHtml: HTMLInputElement
  recordStyle: HTMLInputElement
  taskCheckboxes: HTMLInputElement
  config: HTMLTextAreaElement
  input: HTMLTextAreaElement
  output: HTMLTextAreaElement
  error: HTMLParagraphElement
  warnings: HTMLUListElement
  styleSelects: HTMLSelectElement[]
  copyButton: HTMLButtonElement
  downloadButton: HTMLButtonElement
  configSection: HTMLDetailsElement
  /**
   * Notices about the opened files themselves, e.g. a size or the ones a
   * drop could not use. convert() rebuilds the warning list from scratch,
   * so these cannot live in the DOM alone.
   */
  notices: string[]
  /** Name the download follows; undefined until a file has been opened. */
  openedFileName?: string
  /**
   * Direction the input was written for. The demo swap compares against
   * it, and opening a file sets the direction outside the change listener,
   * so the baseline cannot live in that closure.
   */
  previousDirection: Direction
  /** Says a conversion is running; built here, not in the markup. */
  converting: HTMLParagraphElement
  /** Says the clipboard refused, and what to do instead. */
  copyError: HTMLParagraphElement
  /** Pending delay before `converting` is shown, if any. */
  convertingTimer?: ReturnType<typeof setTimeout>
  /** Where conversions run. */
  runner: ConversionRunner
  /**
   * Ticket of the most recently requested conversion. Runs settle out of
   * order — a one-line edit overtakes the 1 MB document it replaced — so
   * a result only paints while it is still the newest one asked for.
   */
  latestRun: number
}

/**
 * A notice built rather than marked up, so every page that wires main.ts
 * gets it — the same reason the drop overlay is built here. All of them
 * sit by the error, since they answer the same question about why the
 * page is not doing what it was asked to.
 *
 * Each says one thing and owns the element it says it in: sharing a slot
 * means whichever writes last erases the other, and a conversion runs on
 * every keystroke.
 */
function notice(id: string, text: string): HTMLParagraphElement {
  const built = document.createElement("p")
  built.id = id
  built.hidden = true
  // polite, not assertive: it interrupts nothing, and a conversion fast
  // enough to be uninteresting is never announced at all
  built.setAttribute("aria-live", "polite")
  built.textContent = text
  element<HTMLParagraphElement>("error").before(built)
  return built
}

export function findControls(runner: ConversionRunner): Controls {
  return {
    direction: element<HTMLSelectElement>("direction"),
    preset: element<HTMLSelectElement>("preset"),
    useHtml: element<HTMLInputElement>("useHtml"),
    interpretHtml: element<HTMLInputElement>("interpretHtml"),
    recordStyle: element<HTMLInputElement>("recordStyle"),
    taskCheckboxes: element<HTMLInputElement>("taskCheckboxes"),
    config: element<HTMLTextAreaElement>("config"),
    input: element<HTMLTextAreaElement>("input"),
    output: element<HTMLTextAreaElement>("output"),
    error: element<HTMLParagraphElement>("error"),
    warnings: element<HTMLUListElement>("warnings"),
    styleSelects: STYLE_KEYS.map(key => element<HTMLSelectElement>(key)),
    copyButton: element<HTMLButtonElement>("copyOutput"),
    downloadButton: element<HTMLButtonElement>("downloadOutput"),
    configSection: element<HTMLDetailsElement>("configSection"),
    notices: [],
    converting: notice("converting", "Converting…"),
    copyError: notice(
      "copyError",
      "Could not copy — select the output and press Ctrl+C."
    ),
    previousDirection: element<HTMLSelectElement>("direction")
      .value as Direction,
    runner,
    latestRun: 0
  }
}

/** What the form currently asks of a conversion. */
export function formState(controls: Controls): ConversionForm {
  return {
    direction: controls.direction.value as Direction,
    preset: controls.preset.value,
    useHtml: controls.useHtml.checked,
    interpretHtml: controls.interpretHtml.checked,
    recordStyle: controls.recordStyle.checked,
    taskCheckboxes: controls.taskCheckboxes.checked,
    markdownStyle: Object.fromEntries(
      controls.styleSelects.map(select => [select.id, select.value])
    )
  }
}
