import "@picocss/pico/css/pico.min.css"
import "./theme.css"
import { parseConfig } from "../../src/config.js"
import { applyTheme, watchThemeChanges } from "./theme.js"
import {
  runConversion,
  type ConversionForm,
  type Direction
} from "./convert.js"

const STORAGE_KEY = "morg-web"
const STYLE_KEYS = ["bullet", "emphasis", "strong", "fence", "rule"] as const

const ORG_DEMO = `# Paste your Org here — or convert this demo

* morg demo
** TODO Try the [[https://github.com/remigius42/morg][converter]]
SCHEDULED: <2026-09-11 Fri>

Some *bold*, /italic/ and =code= text.
`

const MD_DEMO = `<!-- Paste your Markdown here — or convert this demo -->

# morg demo

## Try the [converter](https://github.com/remigius42/morg)

Some **bold**, *italic* and \`code\` text.

- a list item
`

function readsMarkdown(direction: Direction): boolean {
  return direction === "md-to-org" || direction === "normalize-md"
}

function demoFor(direction: Direction): string {
  return readsMarkdown(direction) ? MD_DEMO : ORG_DEMO
}

interface PersistedState {
  direction?: string
  preset?: string
  useHtml?: boolean
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

/** Wires the Embed Page form to `runConversion`. Idempotent per form. */
export function init(): void {
  const form = element<HTMLFormElement>("converter")
  if (form.dataset.initialized) {
    return
  }
  form.dataset.initialized = "true"

  const direction = element<HTMLSelectElement>("direction")
  const preset = element<HTMLSelectElement>("preset")
  const useHtml = element<HTMLInputElement>("useHtml")
  const taskCheckboxes = element<HTMLInputElement>("taskCheckboxes")
  const config = element<HTMLTextAreaElement>("config")
  const input = element<HTMLTextAreaElement>("input")
  const output = element<HTMLTextAreaElement>("output")
  const error = element<HTMLParagraphElement>("error")
  const warnings = element<HTMLUListElement>("warnings")
  const options = element<HTMLDetailsElement>("options")
  const styleSelects = STYLE_KEYS.map(key => element<HTMLSelectElement>(key))

  // ?theme= lets host pages override; same-origin embeds follow the
  // chrome pages' toggle via storage events
  applyTheme()
  watchThemeChanges()

  function formState(): ConversionForm {
    return {
      direction: direction.value as Direction,
      preset: preset.value,
      useHtml: useHtml.checked,
      taskCheckboxes: taskCheckboxes.checked,
      markdownStyle: Object.fromEntries(
        styleSelects.map(select => [select.id, select.value])
      )
    }
  }

  function convert(): void {
    const result = runConversion(input.value, formState(), config.value)
    output.value = result.output
    error.hidden = !result.error
    error.textContent = result.error ?? ""
    warnings.hidden = result.warnings.length === 0
    warnings.replaceChildren(
      ...result.warnings.map(message => {
        const item = document.createElement("li")
        item.textContent = message
        return item
      })
    )
    // all current option widgets are Markdown-output knobs; md → org
    // is the only mode without one
    options.hidden = direction.value === "md-to-org"
    input.placeholder = readsMarkdown(direction.value as Direction)
      ? "Paste Markdown here…"
      : "Paste Org here…"
  }

  function persist(): void {
    const state: PersistedState = {
      direction: direction.value,
      preset: preset.value,
      useHtml: useHtml.checked,
      taskCheckboxes: taskCheckboxes.checked,
      style: Object.fromEntries(
        styleSelects.map(select => [select.id, select.value])
      ),
      config: config.value
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // storage may be unavailable (iframe partitioning, private mode)
    }
  }

  function restore(): void {
    let state: PersistedState
    try {
      state = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? "{}"
      ) as PersistedState
    } catch {
      return
    }
    if (state.direction) direction.value = state.direction
    if (state.preset !== undefined) preset.value = state.preset
    if (state.useHtml !== undefined) useHtml.checked = state.useHtml
    if (state.taskCheckboxes !== undefined)
      taskCheckboxes.checked = state.taskCheckboxes
    for (const select of styleSelects) {
      const value = state.style?.[select.id]
      if (value) select.value = value
    }
    if (state.config) config.value = state.config
  }

  // WYSIWYG precedence: a valid pasted config populates the form
  // controls for the fields they cover; the controls then always win
  function reflectConfig(): void {
    let parsed
    try {
      parsed = parseConfig(config.value)
    } catch {
      return // convert() reports the error
    }
    if (parsed.preset !== undefined) preset.value = parsed.preset
    const orgToMd = parsed.orgToMarkdown
    if (typeof orgToMd?.useHtml === "boolean") useHtml.checked = orgToMd.useHtml
    if (orgToMd?.taskCheckboxes !== undefined)
      taskCheckboxes.checked = orgToMd.taskCheckboxes
    for (const select of styleSelects) {
      const value =
        orgToMd?.markdownStyle?.[
          select.id as keyof typeof orgToMd.markdownStyle
        ]
      if (value) select.value = value
    }
  }

  config.addEventListener("input", () => {
    reflectConfig()
    persist()
    convert()
  })
  let previousDirection = direction.value as Direction
  direction.addEventListener("change", () => {
    // an untouched demo follows the direction's input format
    if (input.value === demoFor(previousDirection)) {
      input.value = demoFor(direction.value as Direction)
    }
    previousDirection = direction.value as Direction
  })
  for (const control of [
    direction,
    preset,
    useHtml,
    taskCheckboxes,
    ...styleSelects
  ]) {
    control.addEventListener("change", () => {
      persist()
      convert()
    })
  }
  input.addEventListener("input", convert)

  restore()
  previousDirection = direction.value as Direction
  if (config.value) {
    reflectConfig()
  }
  if (!input.value) {
    input.value = demoFor(previousDirection)
  }
  convert()
}

if (document.getElementById("converter")) {
  init()
}
