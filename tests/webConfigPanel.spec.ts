// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest"
import {
  reflectConfig,
  showConfig,
  wireConfigSnippets,
  type ConfigControls
} from "../web/src/configPanel.js"

let controls: ConfigControls

beforeEach(() => {
  document.body.innerHTML = `
    <details id="configSection"><summary>Config (morg.toml)</summary>
      <select id="configSnippet"><option value=""></option>
        <option value="prettier">prettier</option>
      </select>
      <textarea id="config"></textarea>
    </details>
    <select id="preset">
      <option value=""></option><option value="obsidian">obsidian</option>
    </select>
    <input id="useHtml" type="checkbox" />
    <input id="interpretHtml" type="checkbox" />
    <input id="taskCheckboxes" type="checkbox" />
    <select id="bullet"><option value="-">-</option><option value="*">*</option></select>
  `
  controls = {
    config: element<HTMLTextAreaElement>("config"),
    configSection: element<HTMLDetailsElement>("configSection"),
    preset: element<HTMLSelectElement>("preset"),
    useHtml: element<HTMLInputElement>("useHtml"),
    interpretHtml: element<HTMLInputElement>("interpretHtml"),
    taskCheckboxes: element<HTMLInputElement>("taskCheckboxes"),
    styleSelects: [element<HTMLSelectElement>("bullet")]
  }
})

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) {
    throw new Error(`Missing element #${id}`)
  }
  return found as T
}

function summary(): string {
  return controls.configSection.querySelector("summary")?.textContent ?? ""
}

describe("marking an active config", () => {
  it("says so in the summary, and opens the panel", () => {
    controls.config.value = 'preset = "obsidian"'
    showConfig(controls)
    expect(summary()).toMatch(/active/)
    expect(controls.configSection.open).toBe(true)
  })

  it("marks without opening when told not to expand", () => {
    // a config already in force on load was collapsed on purpose;
    // reopening it every visit overrides that
    controls.config.value = 'preset = "obsidian"'
    showConfig(controls, false)
    expect(summary()).toMatch(/active/)
    expect(controls.configSection.open).toBe(false)
  })

  it("takes the mark off once the config is emptied", () => {
    controls.config.value = 'preset = "obsidian"'
    showConfig(controls)
    controls.config.value = "   "
    showConfig(controls)
    expect(summary()).not.toMatch(/active/)
  })
})

// WYSIWYG precedence: a valid pasted config populates the form controls
// for the fields they cover; the controls then always win
describe("reflecting a config into the form", () => {
  it("moves every field the config covers onto its control", () => {
    controls.config.value = `
      preset = "obsidian"
      [orgToMarkdown]
      useHtml = true
      taskCheckboxes = true
      [orgToMarkdown.markdownStyle]
      bullet = "*"
      [markdownToOrg]
      interpretHtml = true
    `
    reflectConfig(controls)
    expect(controls.preset.value).toBe("obsidian")
    expect(controls.useHtml.checked).toBe(true)
    expect(controls.taskCheckboxes.checked).toBe(true)
    expect(controls.interpretHtml.checked).toBe(true)
    expect(controls.styleSelects[0]?.value).toBe("*")
  })

  it("reflects a false as readily as a true", () => {
    // a checkbox is only cleared by an explicit false, and treating the
    // value as falsy leaves the control claiming the opposite
    controls.useHtml.checked = true
    controls.config.value = "[orgToMarkdown]\nuseHtml = false\n"
    reflectConfig(controls)
    expect(controls.useHtml.checked).toBe(false)
  })

  it("leaves the form alone where the config says nothing", () => {
    controls.preset.value = "obsidian"
    controls.config.value = "[orgToMarkdown]\nuseHtml = true\n"
    reflectConfig(controls)
    expect(controls.preset.value).toBe("obsidian")
  })

  it("leaves the form alone when the config will not parse", () => {
    // convert() is what reports the error; half-applying a broken config
    // would move controls the user never asked to move
    controls.preset.value = "obsidian"
    controls.config.value = "tyop = ["
    reflectConfig(controls)
    expect(controls.preset.value).toBe("obsidian")
  })
})

describe("the snippet picker", () => {
  function pick(value: string): void {
    const select = element<HTMLSelectElement>("configSnippet")
    select.value = value
    select.dispatchEvent(new Event("change", { bubbles: true }))
  }

  it("inserts the snippet, marks the panel and reflects it", () => {
    let inserted = 0
    wireConfigSnippets(element("configSnippet"), controls, () => inserted++)
    pick("prettier")
    expect(controls.config.value).toMatch(/\[orgToMarkdown/)
    expect(summary()).toMatch(/active/)
    expect(inserted).toBe(1)
  })

  it("returns the picker to its placeholder, so the same one can be picked twice", () => {
    wireConfigSnippets(element("configSnippet"), controls, () => undefined)
    pick("prettier")
    expect(element<HTMLSelectElement>("configSnippet").value).toBe("")
  })

  it("does nothing when the placeholder itself is chosen", () => {
    let inserted = 0
    wireConfigSnippets(element("configSnippet"), controls, () => inserted++)
    pick("")
    expect(controls.config.value).toBe("")
    expect(inserted).toBe(0)
  })
})
