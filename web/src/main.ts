import { parseConfig } from "../../src/config.js"
import { applyTheme, watchThemeChanges } from "./theme.js"
import { renderVersion } from "./version.js"
import { CONFIG_SNIPPETS } from "./snippets.js"
import {
  readsMarkdown,
  runConversion,
  type ConversionForm,
  type Direction
} from "./convert.js"
import {
  directionForFile,
  isConfigFile,
  outputFileName,
  sizeWarning,
  type TextFile
} from "./files.js"

const STORAGE_KEY = "morg-web"
const STYLE_KEYS = ["bullet", "emphasis", "strong", "fence", "rule"] as const

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
  /**
   * Notices about the opened file itself, e.g. its size. convert()
   * rebuilds the warning list from scratch, so these cannot live in the
   * DOM alone.
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
}

function findControls(): Controls {
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
    notices: [],
    previousDirection: element<HTMLSelectElement>("direction")
      .value as Direction
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

function convert(controls: Controls): void {
  const { input, output, error, warnings, direction, config } = controls
  const result = runConversion(input.value, formState(controls), config.value)
  output.value = result.output
  error.hidden = !result.error
  error.textContent = result.error ?? ""
  const messages = [...controls.notices, ...result.warnings]
  warnings.hidden = messages.length === 0
  warnings.replaceChildren(
    ...messages.map(message => {
      const item = document.createElement("li")
      item.textContent = message
      return item
    })
  )
  input.placeholder = readsMarkdown(direction.value as Direction)
    ? "Paste Markdown here…"
    : "Paste Org here…"
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
 * Loads an opened file. A `.toml` is a config wherever it was dropped —
 * morg never converts one — and the collapsed panel has to open, or the
 * file would take effect invisibly.
 */
async function openFile(controls: Controls, file: TextFile): Promise<void> {
  const contents = await file.text()
  const notice = sizeWarning(file)
  controls.notices = notice ? [notice] : []
  if (isConfigFile(file.name)) {
    controls.config.value = contents
    element<HTMLDetailsElement>("configSection").open = true
    reflectConfig(controls)
  } else {
    controls.openedFileName = file.name
    controls.input.value = contents
    const direction = directionForFile(
      file.name,
      controls.direction.value as Direction
    )
    controls.direction.value = direction
    controls.previousDirection = direction
  }
  persist(controls)
  convert(controls)
}

/**
 * Copies the output. The Clipboard API is unavailable in a cross-origin
 * iframe without `allow="clipboard-write"`, so a selection copy stands in.
 */
async function copyOutput(output: HTMLTextAreaElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(output.value)
  } catch {
    output.select()
    document.execCommand("copy")
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
  link.click()
  URL.revokeObjectURL(url)
}

function wireFileControls(controls: Controls): void {
  element<HTMLButtonElement>("copyOutput").addEventListener("click", () => {
    void copyOutput(controls.output)
  })
  element<HTMLButtonElement>("downloadOutput").addEventListener("click", () =>
    downloadOutput(controls)
  )

  const picker = element<HTMLInputElement>("fileInput")
  element<HTMLButtonElement>("openFile").addEventListener("click", () =>
    picker.click()
  )
  picker.addEventListener("change", () => {
    const file = picker.files?.[0]
    if (file) {
      void openFile(controls, file)
    }
    // so choosing the same file twice in a row still fires a change
    picker.value = ""
  })

  // the browser navigates to a dropped file unless the default is
  // prevented, which would replace the converter and discard the input;
  // dragover needs it too, or no drop event fires at all
  for (const type of ["dragover", "drop"]) {
    document.addEventListener(type, event => event.preventDefault())
  }

  element<HTMLFormElement>("converter").addEventListener("drop", event => {
    const file = event.dataTransfer?.files[0]
    if (file) {
      void openFile(controls, file)
    }
  })
}

function wireListeners(controls: Controls): void {
  const { direction, config, input } = controls
  config.addEventListener("input", () => {
    reflectConfig(controls)
    persist(controls)
    convert(controls)
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
    convert(controls)
  })
  direction.addEventListener("change", () => {
    // an untouched demo follows the direction's input format
    if (input.value === demoFor(controls.previousDirection)) {
      input.value = demoFor(direction.value as Direction)
    }
    controls.previousDirection = direction.value as Direction
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
      convert(controls)
    })
  }
  input.addEventListener("input", () => {
    // the notices described the opened file, not what is in the box now
    controls.notices = []
    convert(controls)
  })
}

/** Wires the Embed Page form to `runConversion`. Idempotent per form. */
export function init(): void {
  const form = element<HTMLFormElement>("converter")
  if (form.dataset.initialized) {
    return
  }
  form.dataset.initialized = "true"

  const controls = findControls()

  renderVersion()

  // ?theme= lets host pages override; same-origin embeds follow the
  // chrome pages' toggle via storage events
  applyTheme()
  watchThemeChanges()

  // restore before wiring so the direction listener's baseline for the
  // untouched-demo swap matches the restored direction
  restore(controls)
  wireListeners(controls)
  wireFileControls(controls)

  if (controls.config.value) {
    reflectConfig(controls)
  }
  if (!controls.input.value) {
    controls.input.value = demoFor(controls.direction.value as Direction)
  }
  convert(controls)
}

if (document.getElementById("converter")) {
  init()
}
