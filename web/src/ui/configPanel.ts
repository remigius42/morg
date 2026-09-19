/**
 * The config panel: whether a config is in force, whether that is
 * visible, and how a config that arrives moves the form controls it
 * covers. Its own module because these answer one question, what the
 * pasted TOML is doing to the page, that was previously answered in
 * three places, the panel mark, the reflection, and the snippet picker.
 *
 * Takes the controls it touches rather than the whole `Controls`, so a
 * test needs six elements instead of the converter page.
 */
import { parseConfig, type MorgConfig } from "../../../src/config.js"
import { CONFIG_SNIPPETS } from "./snippets.js"

/** The controls a config has anything to say about. */
export interface ConfigControls {
  config: HTMLTextAreaElement
  configSection: HTMLDetailsElement
  preset: HTMLSelectElement
  useHtml: HTMLInputElement
  interpretHtml: HTMLInputElement
  recordStyle: HTMLInputElement
  taskCheckboxes: HTMLInputElement
  styleSelects: HTMLSelectElement[]
}

/**
 * Makes an active config visible. A config that just arrived is opened,
 * since it changed the output under the user's hands and the panel is the
 * only place that shows why; a config already in force when the page loads
 * is only marked, so a deliberately collapsed panel stays collapsed.
 */
export function showConfig(controls: ConfigControls, expand = true): void {
  const active = Boolean(controls.config.value.trim())
  const summary = controls.configSection.querySelector("summary")
  if (summary) {
    summary.textContent = active
      ? "Config (morg.toml), active"
      : "Config (morg.toml)"
  }
  if (active && expand) {
    controls.configSection.open = true
  }
}

// WYSIWYG precedence: a valid pasted config populates the form
// controls for the fields they cover; the controls then always win
export function reflectConfig(controls: ConfigControls): void {
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
  reflectCheckboxes(controls, parsed)
  for (const select of controls.styleSelects) {
    const value =
      orgToMd?.markdownStyle?.[select.id as keyof typeof orgToMd.markdownStyle]
    if (typeof value === "string") select.value = value
  }
}

function reflectCheckboxes(controls: ConfigControls, parsed: MorgConfig): void {
  const checkboxes: [boolean | undefined, HTMLInputElement][] = [
    [parsed.markdownToOrg?.interpretHtml, controls.interpretHtml],
    [parsed.markdownToOrg?.recordStyle, controls.recordStyle],
    [parsed.orgToMarkdown?.taskCheckboxes, controls.taskCheckboxes]
  ]
  for (const [value, control] of checkboxes) {
    assign(value, checked => (control.checked = checked))
  }
}

function assign<T>(value: T | undefined, apply: (value: T) => void): void {
  if (value !== undefined) apply(value)
}

/**
 * Wires the formatter-snippet picker. `afterInsert` is what the page
 * does about a config having changed (persisting it and converting
 * again), which is the caller's business rather than the panel's.
 */
export function wireConfigSnippets(
  picker: HTMLSelectElement,
  controls: ConfigControls,
  afterInsert: () => void
): void {
  picker.addEventListener("change", () => {
    const snippet =
      CONFIG_SNIPPETS[picker.value as keyof typeof CONFIG_SNIPPETS]
    // so the same snippet can be picked twice in a row, and so the
    // placeholder is what the collapsed picker reads as
    picker.value = ""
    if (!snippet) {
      return
    }
    controls.config.value = snippet.toml
    // a snippet puts a config in force as surely as typing one does; the
    // panel is already open, since the picker is inside it
    showConfig(controls, false)
    reflectConfig(controls)
    afterInsert()
  })
}
