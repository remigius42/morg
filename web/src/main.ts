import { reportHeight } from "./embedHeight.js"
import { applyTheme, watchThemeChanges } from "./theme.js"
import { renderVersion } from "./version.js"
import {
  reflectConfig,
  showConfig,
  wireConfigSnippets
} from "./ui/configPanel.js"
import { element, findControls, type Controls } from "./ui/controls.js"
import { demoFor, isDemo } from "./ui/demos.js"
import { convert, debounce, DEBOUNCE_MS, startConvert } from "./ui/runLoop.js"
import { wireDropZone } from "./ui/dropZone.js"
import { DIRECTIONS, normalizes } from "./direction.js"
import { copyOutput, downloadOutput } from "./ui/outputActions.js"
import { readState, writeState, type PersistedState } from "./ui/persistence.js"
import {
  directionOf,
  enforceOutput,
  presetsOf,
  setDirection,
  swapSides
} from "./ui/dialects.js"
import { createRunner, type ConversionRunner } from "./pipeline/runner.js"
import {
  directionForFile,
  directionSuitsFile,
  isConfigFile,
  looksBinary,
  sizeWarning,
  type TextFile
} from "./ui/files.js"

// an untouched demo follows the direction's input format and the
// input preset's dialect, however the preset was set
function swapDemo(controls: Controls): void {
  if (isDemo(controls.input.value)) {
    controls.input.value = demoFor(
      directionOf(controls),
      presetsOf(controls).inputPreset
    )
  }
}

// a config may set the presets
function applyConfig(controls: Controls): void {
  reflectConfig(controls)
  enforceOutput(controls)
  swapDemo(controls)
}

function persist(controls: Controls): void {
  writeState({
    inputDialect: controls.inputDialect.value,
    outputDialect: controls.outputDialect.value,
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

// a direction the sides changed to: the untouched demo follows, and an
// opened name no longer read in it goes, or it would name the output
// after the wrong format, and where that matches, after the source file
function sidesChanged(controls: Controls): void {
  swapDemo(controls)
  if (
    controls.openedFileName &&
    !directionSuitsFile(controls.openedFileName, directionOf(controls))
  ) {
    controls.openedFileName = undefined
  }
}

// the sides as remembered: by dialect, or as a direction and presets,
// as the page remembered them before the selects named the dialects
function restoreDialects(controls: Controls, state: PersistedState): void {
  const options = (select: HTMLSelectElement) =>
    [...select.options].map(option => option.value)
  if (
    state.inputDialect &&
    state.outputDialect &&
    options(controls.inputDialect).includes(state.inputDialect) &&
    options(controls.outputDialect).includes(state.outputDialect)
  ) {
    controls.inputDialect.value = state.inputDialect
    controls.outputDialect.value = state.outputDialect
    enforceOutput(controls)
    return
  }
  // Org → Markdown, the first, where the page remembers none
  const direction = DIRECTIONS.find(known => known === state.direction)
  setDirection(controls, direction ?? "org-to-md", {
    inputPreset: state.inputPreset ?? state.preset ?? "vanilla",
    outputPreset: state.outputPreset ?? state.preset ?? "vanilla"
  })
}

function restore(controls: Controls): void {
  const state = readState()
  // a stale or hand-edited value would leave the select blank, so keep
  // the default unless the option actually exists
  restoreDialects(controls, state)
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
    applyConfig(controls)
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
  setDirection(controls, directionForFile(doc.name, directionOf(controls)))
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
      directionOf(controls),
      translatedTo(controls)
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
  const { config, input } = controls
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
    applyConfig(controls)
    persist(controls)
    convertSoon()
  })
  wireConfigSnippets(element("configSnippet"), controls, () => {
    swapDemo(controls)
    persist(controls)
    startConvert(controls)
  })
  // registered ahead of the listeners that convert
  controls.inputDialect.addEventListener("change", () => {
    enforceOutput(controls, true)
    sidesChanged(controls)
  })
  controls.outputDialect.addEventListener("change", () => {
    enforceOutput(controls)
    sidesChanged(controls)
  })
  controls.swapSides.addEventListener("click", () => {
    swapSides(controls)
    sidesChanged(controls)
    persist(controls)
    startConvert(controls)
  })
  for (const control of [
    controls.inputDialect,
    controls.outputDialect,
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
  wireListeners(controls)
  wireFileControls(controls)

  // a restored config is already in force, but the user collapsed the
  // panel on purpose; mark it rather than reopening it on every load
  showConfig(controls, false)
  if (controls.config.value) {
    reflectConfig(controls)
    enforceOutput(controls)
  }
  if (!controls.input.value) {
    controls.input.value = demoFor(
      directionOf(controls),
      presetsOf(controls).inputPreset
    )
  }
  startConvert(controls)

  // last, so the first height it reports is of the form as restored
  // rather than as the markup shipped it
  reportHeight()
}

if (document.getElementById("converter")) {
  init()
}

// the output's dialect where one format is translated between two
function translatedTo(controls: Controls): string | undefined {
  const { inputPreset, outputPreset } = presetsOf(controls)
  const direction = directionOf(controls)
  return normalizes(direction) && inputPreset !== outputPreset
    ? outputPreset
    : undefined
}
