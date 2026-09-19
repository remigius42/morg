import { reportHeight } from "./embedHeight.js"
import { applyTheme, watchThemeChanges } from "./theme.js"
import { renderVersion } from "./version.js"
import {
  reflectConfig,
  showConfig,
  wireConfigSnippets
} from "./ui/configPanel.js"
import { element, findControls, type Controls } from "./ui/controls.js"
import { demoFor } from "./ui/demos.js"
import { convert, debounce, DEBOUNCE_MS, startConvert } from "./ui/runLoop.js"
import { wireDropZone } from "./ui/dropZone.js"
import type { Direction } from "./direction.js"
import { copyOutput, downloadOutput } from "./ui/outputActions.js"
import { readState, writeState } from "./ui/persistence.js"
import { createRunner, type ConversionRunner } from "./pipeline/runner.js"
import {
  directionForFile,
  directionSuitsFile,
  isConfigFile,
  looksBinary,
  sizeWarning,
  type TextFile
} from "./ui/files.js"

function persist(controls: Controls): void {
  writeState({
    direction: controls.direction.value,
    preset: controls.preset.value,
    useHtml: controls.useHtml.checked,
    interpretHtml: controls.interpretHtml.checked,
    recordStyle: controls.recordStyle.checked,
    taskCheckboxes: controls.taskCheckboxes.checked,
    style: Object.fromEntries(
      controls.styleSelects.map(select => [select.id, select.value])
    ),
    config: controls.config.value
  })
}

function assign<T>(value: T | undefined, apply: (value: T) => void): void {
  if (value !== undefined) apply(value)
}

function restore(controls: Controls): void {
  const state = readState()
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
  assign(state.recordStyle, value => (controls.recordStyle.checked = value))
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

/**
 * Loads opened files. A `.toml` is a config wherever it was dropped,
 * since morg never converts one, so each file goes where its kind belongs.
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
    return [`Ignored ${doc.name}: it does not look like a text file.`]
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
 * Loads files, reporting a failed read rather than leaving the drop
 * looking like it did nothing: dropping a folder rejects here, and so
 * does a file moved or revoked between picking and reading.
 */
function open(controls: Controls, files: readonly TextFile[]): void {
  openFiles(controls, files).catch((cause: unknown) => {
    controls.error.hidden = false
    controls.error.textContent = `Could not read the file: ${String(cause)}`
  })
}

function wireFileControls(controls: Controls): void {
  wireDropZone(files => open(controls, files))
  controls.copyButton.addEventListener("click", () => {
    void copyOutput(controls.output, controls.copyError)
  })
  controls.downloadButton.addEventListener("click", () =>
    downloadOutput(
      controls.output,
      controls.openedFileName,
      controls.direction.value as Direction
    )
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
}

function wireListeners(controls: Controls): void {
  const { direction, config, input } = controls
  // only the two textareas, which fire per keystroke; a select or a
  // checkbox fires once per interaction, and delaying a click reads as lag.
  // One shared timer, since typing in both boxes is still one intent to
  // see the result.
  const convertSoon = debounce(() => startConvert(controls), DEBOUNCE_MS)
  config.addEventListener("input", () => {
    // typed by hand, so the panel is already open; only the mark matters.
    // The mark and the form reflection stay immediate: they describe the
    // config text itself, so lagging them behind the typing looks broken
    showConfig(controls, false)
    reflectConfig(controls)
    persist(controls)
    convertSoon()
  })
  wireConfigSnippets(element("configSnippet"), controls, () => {
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
    // reads; kept, it would name the output after the wrong format,
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
    controls.recordStyle,
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

  // last, so the first height it reports is of the form as restored
  // rather than as the markup shipped it
  reportHeight()
}

if (document.getElementById("converter")) {
  init()
}
