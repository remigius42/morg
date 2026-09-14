import { parseConfig } from "../../src/config.js"
import { applyTheme, watchThemeChanges } from "./theme.js"
import { renderVersion } from "./version.js"
import { CONFIG_SNIPPETS } from "./snippets.js"
import type { ConversionForm } from "./convert.js"
import { readsMarkdown, type Direction } from "./direction.js"
import { createRunner, type ConversionRunner } from "./runner.js"
import {
  directionForFile,
  directionSuitsFile,
  isConfigFile,
  looksBinary,
  outputFileName,
  sizeWarning,
  type TextFile
} from "./files.js"

const STORAGE_KEY = "morg-web"
const STYLE_KEYS = ["bullet", "emphasis", "strong", "fence", "rule"] as const

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

// the two demos are the same document in both dialects; convergence and
// zero warnings are pinned by test (tests/webUi.spec.ts)
export const ORG_DEMO = `# Paste your Org here — or convert this demo

* morg demo
** TODO Try the [[https://github.com/remigius42/morg][converter]]
SCHEDULED: <2026-09-11 Fri>

Some *bold*, /italic/ and ~code~ text[fn:1].

| Format   | Extension |
|----------+-----------|
| Org      | .org      |
| Markdown | .md       |

#+begin_src js
console.log("fenced code survives")
#+end_src

- term :: a definition list entry

[fn:1] Footnotes survive the round trip.
`

export const MD_DEMO = `<!-- Paste your Markdown here — or convert this demo -->

# morg demo

## Try the [converter](https://github.com/remigius42/morg)

todo:: TODO

scheduled:: <2026-09-11 Fri>

Some **bold**, *italic* and \`code\` text[^1].

| Format   | Extension |
| -------- | --------- |
| Org      | .org      |
| Markdown | .md       |

\`\`\`js
console.log("fenced code survives")
\`\`\`

- term :: a definition list entry

[^1]: Footnotes survive the round trip.
`

function demoFor(direction: Direction): string {
  return readsMarkdown(direction) ? MD_DEMO : ORG_DEMO
}

interface PersistedState {
  direction?: string
  preset?: string
  useHtml?: boolean
  interpretHtml?: boolean
  taskCheckboxes?: boolean
  style?: Record<string, string>
  config?: string
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) {
    throw new Error(`Missing element #${id}`)
  }
  return found as T
}

interface Controls {
  direction: HTMLSelectElement
  preset: HTMLSelectElement
  useHtml: HTMLInputElement
  interpretHtml: HTMLInputElement
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

function findControls(runner: ConversionRunner): Controls {
  return {
    direction: element<HTMLSelectElement>("direction"),
    preset: element<HTMLSelectElement>("preset"),
    useHtml: element<HTMLInputElement>("useHtml"),
    interpretHtml: element<HTMLInputElement>("interpretHtml"),
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

function assign<T>(value: T | undefined, apply: (value: T) => void): void {
  if (value !== undefined) apply(value)
}

function formState(controls: Controls): ConversionForm {
  return {
    direction: controls.direction.value as Direction,
    preset: controls.preset.value,
    useHtml: controls.useHtml.checked,
    interpretHtml: controls.interpretHtml.checked,
    taskCheckboxes: controls.taskCheckboxes.checked,
    markdownStyle: Object.fromEntries(
      controls.styleSelects.map(select => [select.id, select.value])
    )
  }
}

async function convert(controls: Controls): Promise<void> {
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
function startConvert(controls: Controls): void {
  void convert(controls)
}

/** Delays `run` until `wait` ms have passed without another call. */
function debounce(run: () => void, wait: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return () => {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
    timer = setTimeout(run, wait)
  }
}

function persist(controls: Controls): void {
  const state: PersistedState = {
    direction: controls.direction.value,
    preset: controls.preset.value,
    useHtml: controls.useHtml.checked,
    interpretHtml: controls.interpretHtml.checked,
    taskCheckboxes: controls.taskCheckboxes.checked,
    style: Object.fromEntries(
      controls.styleSelects.map(select => [select.id, select.value])
    ),
    config: controls.config.value
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage may be unavailable (iframe partitioning, private mode)
  }
}

function restore(controls: Controls): void {
  let state: PersistedState
  try {
    state = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}"
    ) as PersistedState
  } catch {
    return
  }
  // a stale or hand-edited value would leave the select blank, so keep
  // the default unless the option actually exists
  if (state.direction) {
    const options = [...controls.direction.options].map(option => option.value)
    if (options.includes(state.direction)) {
      controls.direction.value = state.direction
    }
  }
  assign(state.preset, value => (controls.preset.value = value))
  assign(state.useHtml, value => (controls.useHtml.checked = value))
  assign(state.interpretHtml, value => (controls.interpretHtml.checked = value))
  assign(
    state.taskCheckboxes,
    value => (controls.taskCheckboxes.checked = value)
  )
  for (const select of controls.styleSelects) {
    const value = state.style?.[select.id]
    if (value) select.value = value
  }
  if (state.config) controls.config.value = state.config
}

// WYSIWYG precedence: a valid pasted config populates the form
// controls for the fields they cover; the controls then always win
function reflectConfig(controls: Controls): void {
  let parsed
  try {
    parsed = parseConfig(controls.config.value)
  } catch {
    return // convert() reports the error
  }
  assign(parsed.preset, value => (controls.preset.value = value))
  const orgToMd = parsed.orgToMarkdown
  if (typeof orgToMd?.useHtml === "boolean")
    controls.useHtml.checked = orgToMd.useHtml
  assign(
    parsed.markdownToOrg?.interpretHtml,
    value => (controls.interpretHtml.checked = value)
  )
  assign(
    orgToMd?.taskCheckboxes,
    value => (controls.taskCheckboxes.checked = value)
  )
  for (const select of controls.styleSelects) {
    const value =
      orgToMd?.markdownStyle?.[select.id as keyof typeof orgToMd.markdownStyle]
    if (typeof value === "string") select.value = value
  }
}

/**
 * Makes an active config visible. A config that just arrived is opened,
 * since it changed the output under the user's hands and the panel is the
 * only place that shows why; a config already in force when the page loads
 * is only marked, so a deliberately collapsed panel stays collapsed.
 */
function showConfig(controls: Controls, expand = true): void {
  const active = Boolean(controls.config.value.trim())
  const summary = controls.configSection.querySelector("summary")
  if (summary) {
    summary.textContent = active
      ? "Config (morg.toml) — active"
      : "Config (morg.toml)"
  }
  if (active && expand) {
    controls.configSection.open = true
  }
}

/**
 * Loads opened files. A `.toml` is a config wherever it was dropped —
 * morg never converts one — so each file goes where its kind belongs.
 * Only one of each can be in force at a time; the rest are named in the
 * warning list rather than dropped on the floor.
 */
async function openFiles(
  controls: Controls,
  files: readonly TextFile[]
): Promise<void> {
  const [configs, documents] = partition(files, file => isConfigFile(file.name))
  const [config] = configs
  const [doc] = documents
  const ignored = [...configs.slice(1), ...documents.slice(1)]
  const notices: string[] = []

  if (config) {
    // no size warning: it is about how long a conversion takes, and a
    // config is read rather than converted
    controls.config.value = await config.text()
    showConfig(controls)
    reflectConfig(controls)
  }
  if (doc) {
    notices.push(...(await openDocument(controls, doc)))
  }
  if (ignored.length) {
    notices.push(`Ignored ${ignored.map(file => file.name).join(", ")}.`)
  }
  controls.notices = notices
  persist(controls)
  await convert(controls)
}

/**
 * Puts an opened document in the input, or says why it stayed out.
 * Whether a file is a document at all is only answerable once it has
 * been read: a drop is not filtered by extension, so anything at all
 * can arrive, and a png decoded as UTF-8 is not a document.
 */
async function openDocument(
  controls: Controls,
  doc: TextFile
): Promise<string[]> {
  const text = await doc.text()
  if (looksBinary(text)) {
    return [`Ignored ${doc.name} — it does not look like a text file.`]
  }
  controls.openedFileName = doc.name
  controls.input.value = text
  const direction = directionForFile(
    doc.name,
    controls.direction.value as Direction
  )
  controls.direction.value = direction
  controls.previousDirection = direction
  return [sizeWarning(doc)].filter(notice => notice !== undefined)
}

function partition<T>(
  items: readonly T[],
  matches: (item: T) => boolean
): [matched: T[], rest: T[]] {
  const matched: T[] = []
  const rest: T[] = []
  for (const item of items) {
    ;(matches(item) ? matched : rest).push(item)
  }
  return [matched, rest]
}

/**
 * Copies the output. The Clipboard API is unavailable in a cross-origin
 * iframe without `allow="clipboard-write"`, so a selection copy stands in.
 */
async function copyOutput(controls: Controls): Promise<void> {
  const { output } = controls
  controls.copyError.hidden = true
  try {
    await navigator.clipboard.writeText(output.value)
    return
  } catch {
    // fall through to the selection copy
  }
  // not the conversion error: there it reads as a failed conversion, and
  // the next keystroke takes the instruction away before it can be read
  controls.copyError.hidden = selectionCopy(output)
}

/**
 * Copies via the output's own selection. iOS Safari refuses to select a
 * readonly textarea, so the attribute comes off for the duration.
 */
function selectionCopy(output: HTMLTextAreaElement): boolean {
  const wasReadOnly = output.readOnly
  // copying takes the focus, and in an iframe without clipboard-write
  // that is every copy; someone mid-sentence would be typing into
  // nothing until they clicked back
  const wasFocused = document.activeElement
  output.readOnly = false
  try {
    output.focus()
    output.setSelectionRange(0, output.value.length)
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    output.readOnly = wasReadOnly
    output.setSelectionRange(0, 0)
    if (wasFocused instanceof HTMLElement) {
      wasFocused.focus()
    }
  }
}

/** Saves the output locally; the blob never leaves the browser. */
function downloadOutput(controls: Controls): void {
  const blob = new Blob([controls.output.value], {
    type: "text/plain;charset=utf-8"
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = outputFileName(
    controls.openedFileName,
    controls.direction.value as Direction
  )
  // Firefox only acts on a click if the anchor is in the document, and
  // revoking in the same task can invalidate the blob before the download
  // task has read it
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Announces the page-wide drop target while files are over it, and says
 * what the converter accepts. Built here rather than in the markup so
 * every page that wires main.ts gets it.
 */
function wireDropOverlay(): void {
  const overlay = document.createElement("div")
  overlay.id = "dropOverlay"
  overlay.className = "drop-overlay"
  overlay.hidden = true
  overlay.textContent = "Drop a document or a morg.toml"
  document.body.append(overlay)

  // dragleave fires on every element boundary the pointer crosses, so a
  // plain show/hide pair flickers; only the outermost leave counts
  let depth = 0
  document.addEventListener("dragenter", event => {
    if (!carriesFiles(event)) {
      return
    }
    depth += 1
    overlay.hidden = false
  })
  document.addEventListener("dragleave", event => {
    if (!carriesFiles(event)) {
      return
    }
    depth = Math.max(0, depth - 1)
    overlay.hidden = depth === 0
  })
  document.addEventListener("drop", () => {
    depth = 0
    overlay.hidden = true
  })
}

/** Whether a drag carries files rather than, say, a text selection. */
function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false
}

/**
 * Loads files, reporting a failed read rather than leaving the drop
 * looking like it did nothing — dropping a folder rejects here, and so
 * does a file moved or revoked between picking and reading.
 */
function open(controls: Controls, files: readonly TextFile[]): void {
  openFiles(controls, files).catch((cause: unknown) => {
    controls.error.hidden = false
    controls.error.textContent = `Could not read the file: ${String(cause)}`
  })
}

function wireFileControls(controls: Controls): void {
  wireDropOverlay()
  controls.copyButton.addEventListener("click", () => {
    void copyOutput(controls)
  })
  controls.downloadButton.addEventListener("click", () =>
    downloadOutput(controls)
  )

  const picker = element<HTMLInputElement>("fileInput")
  element<HTMLButtonElement>("openFile").addEventListener("click", () =>
    picker.click()
  )
  picker.addEventListener("change", () => {
    open(controls, [...(picker.files ?? [])])
    // so choosing the same file twice in a row still fires a change
    picker.value = ""
  })

  // the browser navigates to a dropped file unless the default is
  // prevented, which would replace the converter and discard the input;
  // dragover needs it too, or no drop event fires at all. Only file drags
  // qualify — cancelling a text drag would break dropping a selection
  // into the textareas, which is native behavior worth keeping.
  for (const type of ["dragover", "drop"]) {
    document.addEventListener(type, event => {
      if (carriesFiles(event as DragEvent)) {
        event.preventDefault()
      }
    })
  }

  // the whole page is the drop target: the form does not cover the
  // viewport, and a drop landing in the margin looked like a broken feature
  document.addEventListener("drop", event => {
    const files = event.dataTransfer?.files
    if (files?.length) {
      open(controls, [...files])
    }
  })
}

function wireListeners(controls: Controls): void {
  const { direction, config, input } = controls
  // only the two textareas, which fire per keystroke — a select or a
  // checkbox fires once per interaction, and delaying a click reads as lag.
  // One shared timer, since typing in both boxes is still one intent to
  // see the result.
  const convertSoon = debounce(() => startConvert(controls), DEBOUNCE_MS)
  config.addEventListener("input", () => {
    // typed by hand, so the panel is already open — only the mark matters.
    // The mark and the form reflection stay immediate: they describe the
    // config text itself, so lagging them behind the typing looks broken
    showConfig(controls, false)
    reflectConfig(controls)
    persist(controls)
    convertSoon()
  })
  const configSnippet = element<HTMLSelectElement>("configSnippet")
  configSnippet.addEventListener("change", () => {
    const snippet =
      CONFIG_SNIPPETS[configSnippet.value as keyof typeof CONFIG_SNIPPETS]
    configSnippet.value = ""
    if (!snippet) {
      return
    }
    config.value = snippet.toml
    reflectConfig(controls)
    persist(controls)
    startConvert(controls)
  })
  direction.addEventListener("change", () => {
    // an untouched demo follows the direction's input format
    if (input.value === demoFor(controls.previousDirection)) {
      input.value = demoFor(direction.value as Direction)
    }
    controls.previousDirection = direction.value as Direction
    // the opened name described a document this direction no longer
    // reads; kept, it would name the output after the wrong format —
    // and where the output format matches, after the source file itself
    if (
      controls.openedFileName &&
      !directionSuitsFile(controls.openedFileName, controls.previousDirection)
    ) {
      controls.openedFileName = undefined
    }
  })
  for (const control of [
    direction,
    controls.preset,
    controls.useHtml,
    controls.interpretHtml,
    controls.taskCheckboxes,
    ...controls.styleSelects
  ]) {
    control.addEventListener("change", () => {
      persist(controls)
      startConvert(controls)
    })
  }
  input.addEventListener("input", () => {
    // the notices and the download name both described the opened file,
    // not what is in the box now. An edit and a paste of an entirely
    // different document are indistinguishable here, so the name cannot
    // be kept on the chance that this is still the same document.
    controls.notices = []
    controls.openedFileName = undefined
    convertSoon()
  })
}

/** Wires the Embed Page form to a `ConversionRunner`. Idempotent per form. */
export function init(runner?: ConversionRunner): void {
  const form = element<HTMLFormElement>("converter")
  if (form.dataset.initialized) {
    return
  }
  form.dataset.initialized = "true"

  // built past the guard, not in a default argument: an argument is
  // evaluated before the guard can turn the call away, and the worker it
  // starts would run unreachable for the life of the page
  const controls = findControls(runner ?? createRunner())

  renderVersion()

  // ?theme= lets host pages override; same-origin embeds follow the
  // chrome pages' toggle via storage events
  applyTheme()
  watchThemeChanges()

  restore(controls)
  // findControls read the baseline off the markup's default; the restore
  // may have just moved the select somewhere else, and the demo swap
  // compares the input against whichever direction it was written for
  controls.previousDirection = controls.direction.value as Direction
  wireListeners(controls)
  wireFileControls(controls)

  // a restored config is already in force, but the user collapsed the
  // panel on purpose; mark it rather than reopening it on every load
  showConfig(controls, false)
  if (controls.config.value) {
    reflectConfig(controls)
  }
  if (!controls.input.value) {
    controls.input.value = demoFor(controls.direction.value as Direction)
  }
  startConvert(controls)
}

if (document.getElementById("converter")) {
  init()
}
