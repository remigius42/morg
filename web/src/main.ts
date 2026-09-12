import { parseConfig } from "../../src/config.js"
import { applyTheme, watchThemeChanges } from "./theme.js"
import { CONFIG_SNIPPETS } from "./snippets.js"
import {
  runConversion,
  type ConversionForm,
  type Direction
} from "./convert.js"

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
    styleSelects: STYLE_KEYS.map(key => element<HTMLSelectElement>(key))
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
  warnings.hidden = result.warnings.length === 0
  warnings.replaceChildren(
    ...result.warnings.map(message => {
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
  input.addEventListener("input", () => convert(controls))
}

/** Wires the Embed Page form to `runConversion`. Idempotent per form. */
export function init(): void {
  const form = element<HTMLFormElement>("converter")
  if (form.dataset.initialized) {
    return
  }
  form.dataset.initialized = "true"

  const controls = findControls()

  // ?theme= lets host pages override; same-origin embeds follow the
  // chrome pages' toggle via storage events
  applyTheme()
  watchThemeChanges()

  // restore before wiring so the direction listener's baseline for the
  // untouched-demo swap matches the restored direction
  restore(controls)
  wireListeners(controls)

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
