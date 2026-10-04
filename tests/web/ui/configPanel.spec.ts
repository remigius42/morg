// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest"
import {
  reflectConfig,
  showConfig,
  wireConfigSnippets,
  type ConfigControls
} from "../../../web/src/ui/configPanel.js"
import { HTML_CONSTRUCTS, type HtmlConstruct } from "../../../src/options.js"

const perConstruct = <T>(value: (construct: HtmlConstruct) => T) =>
  Object.fromEntries(
    HTML_CONSTRUCTS.map(construct => [construct, value(construct)])
  ) as Record<HtmlConstruct, T>

let controls: ConfigControls

beforeEach(() => {
  document.body.innerHTML = `
    <details id="configSection"><summary>Config (morg.toml)</summary>
      <select id="configSnippet"><option value=""></option>
        <option value="prettier">prettier</option>
      </select>
      <textarea id="config"></textarea>
    </details>
    <select id="inputDialect">
      <option value="org">Org</option><option value="org:logseq">Org (Logseq)</option>
      <option value="markdown">Markdown</option><option value="markdown:logseq">Markdown (Logseq)</option>
      <option value="markdown:obsidian">Markdown (Obsidian)</option>
    </select>
    <select id="outputDialect">
      <option value="org">Org</option><option value="org:logseq">Org (Logseq)</option>
      <option value="markdown">Markdown</option><option value="markdown:logseq">Markdown (Logseq)</option>
      <option value="markdown:obsidian">Markdown (Obsidian)</option>
    </select>
    ${HTML_CONSTRUCTS.map(
      construct => `<input id="interpretHtml-${construct}" type="checkbox" />
        <select id="spelling-${construct}">
          <option value="markdown">Markdown</option><option value="html">HTML</option>
        </select>`
    ).join("\n")}
    <input id="recordMarkdownStyle" type="checkbox" />
    <input id="taskCheckboxes" type="checkbox" />
    <select id="bullet"><option value="-">-</option><option value="*">*</option></select>
  `
  controls = {
    config: element<HTMLTextAreaElement>("config"),
    configSection: element<HTMLDetailsElement>("configSection"),
    inputDialect: element<HTMLSelectElement>("inputDialect"),
    outputDialect: element<HTMLSelectElement>("outputDialect"),
    interpretHtml: perConstruct(construct =>
      element<HTMLInputElement>(`interpretHtml-${construct}`)
    ),
    spelling: perConstruct(construct =>
      element<HTMLSelectElement>(`spelling-${construct}`)
    ),
    recordMarkdownStyle: element<HTMLInputElement>("recordMarkdownStyle"),
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
      [markdown]
      definitionList = "html"
      [markdown.input.interpretHtml]
      definitionList = false
      [markdown.output]
      underline = "html"
      taskCheckboxes = true
      [markdown.output.style]
      bullet = "*"
      [org.output]
      recordMarkdownStyle = true
    `
    controls.inputDialect.value = "markdown"
    controls.outputDialect.value = "org"
    reflectConfig(controls)
    // a preset keeps the side's format; Obsidian writes no org
    expect(controls.inputDialect.value).toBe("markdown:obsidian")
    expect(controls.outputDialect.value).toBe("org")
    // per construct and side, as the conversion resolves it
    expect(controls.spelling.definitionList.value).toBe("html")
    expect(controls.interpretHtml.definitionList.checked).toBe(false)
    expect(controls.spelling.underline.value).toBe("html")
    expect(controls.interpretHtml.underline.checked).toBe(false)
    expect(controls.taskCheckboxes.checked).toBe(true)
    expect(controls.recordMarkdownStyle.checked).toBe(true)
    expect(controls.styleSelects[0]?.value).toBe("*")
  })

  it("moves a side preset onto its side, over preset", () => {
    controls.inputDialect.value = "org"
    controls.outputDialect.value = "markdown:obsidian"
    controls.config.value =
      'preset = "obsidian"\ninputPreset = "logseq"\noutputPreset = "vanilla"'
    reflectConfig(controls)
    expect(controls.inputDialect.value).toBe("org:logseq")
    expect(controls.outputDialect.value).toBe("markdown")
  })

  it("reflects a false as readily as a true", () => {
    // a checkbox is only cleared by an explicit false, and treating the
    // value as falsy leaves the control claiming the opposite
    controls.taskCheckboxes.checked = true
    controls.interpretHtml.underline.checked = true
    controls.spelling.underline.value = "html"
    controls.config.value =
      '[markdown]\nunderline = "markdown"\n[markdown.output]\ntaskCheckboxes = false\n'
    reflectConfig(controls)
    expect(controls.taskCheckboxes.checked).toBe(false)
    expect(controls.interpretHtml.underline.checked).toBe(false)
    expect(controls.spelling.underline.value).toBe("markdown")
  })

  it("leaves the form alone where the config says nothing", () => {
    controls.inputDialect.value = "markdown:obsidian"
    controls.config.value = '[markdown]\nunderline = "html"\n'
    reflectConfig(controls)
    expect(controls.inputDialect.value).toBe("markdown:obsidian")
  })

  it("leaves the form alone when the config will not parse", () => {
    // convert() is what reports the error; half-applying a broken config
    // would move controls the user never asked to move
    controls.inputDialect.value = "markdown:obsidian"
    controls.config.value = "tyop = ["
    reflectConfig(controls)
    expect(controls.inputDialect.value).toBe("markdown:obsidian")
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
    expect(controls.config.value).toMatch(/\[markdown\.output\.style\]/)
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
