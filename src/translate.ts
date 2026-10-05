import { restyleMarkdown } from "./core/restyle.js"
import type { MarkdownStyleOptions } from "./options.js"
import { respellMarkdown, type RespellOptions } from "./respell.js"
import type { Preset } from "./presets/types.js"
import {
  resolveSides,
  type Format,
  type PresetOptions,
  type Sides
} from "./presets/sides.js"

/**
 * The presets of a translation, its warning callback and the org-ism
 * key names Vanilla Markdown writes planning under.
 */
export type TranslateOptions = PresetOptions &
  RespellOptions & {
    onWarning?: (message: string) => void
    orgismKeys?: Record<string, string>
    /** The Markdown markers to write; others stay as written. */
    style?: MarkdownStyleOptions
  }

/**
 * Translates an Org string from the Input Preset's dialect into the
 * Output Preset's, changing only what the two dialects write
 * differently (ADR 0006): a block's content is kept as written.
 * @param org The Org string to translate.
 * @param options The preset of each side, which must differ.
 * @returns The Org string in the output's dialect.
 * @throws If both sides name the same preset (that is `normalizeOrg`),
 * or a side preset has no org dialect.
 */
export function translateOrg(
  org: string,
  options: TranslateOptions = {}
): string {
  const { input, output } = twoSides(options, "org", "normalizeOrg")
  // Vanilla has no dialect to translate, so the other side does it
  const side = input?.translateOrg ? "input" : "output"
  const translate = (side === "input" ? input : output)?.translateOrg
  return translate
    ? translate(org, {
        side,
        ...(options.onWarning && { onWarning: options.onWarning })
      })
    : org
}

/**
 * Translates a Markdown string from the Input Preset's dialect into the
 * Output Preset's, changing only what the two dialects write
 * differently (ADR 0006): a block's content is kept as written.
 * @param markdown The Markdown string to translate.
 * @param options The preset of each side, which must differ.
 * @returns The Markdown string in the output's dialect.
 * @throws If both sides name the same preset (that is
 * `normalizeMarkdown`).
 */
export function translateMarkdown(
  markdown: string,
  options: TranslateOptions = {}
): string {
  const { input, output } = twoSides(options, "markdown", "normalizeMarkdown")
  const context = hookContext(options, pageLinks({ input, output }))
  // into Vanilla from the input's dialect, then from it into the
  // output's; a dialect does what its side needs
  // the Markdown options respell Vanilla, which carries the input's
  // syntax, else the output's
  const vanilla = respellMarkdown(
    input?.translateMarkdown?.(markdown, { ...context, side: "input" }) ??
      markdown,
    options,
    input ?? output
  )
  const translated =
    output?.translateMarkdown?.(vanilla, { ...context, side: "output" }) ??
    vanilla
  const style = outputStyle(options, output)
  return style ? restyleMarkdown(translated, style) : translated
}

// the style to write, but for a bullet the output's outline needs
function outputStyle(
  { style: markdownStyle, onWarning }: TranslateOptions,
  output: Preset | undefined
): MarkdownStyleOptions | undefined {
  const needed = output?.markdown?.bullet
  if (!markdownStyle?.bullet || !needed || markdownStyle.bullet === needed) {
    return markdownStyle
  }
  onWarning?.(
    `${output.name} Markdown writes its blocks with '${needed}'; bullet '${markdownStyle.bullet}' not applied`
  )
  const style = { ...markdownStyle }
  delete style.bullet
  return style
}

// what a dialect's translation learns of the options
function hookContext(
  { onWarning, orgismKeys }: TranslateOptions,
  relink: ((text: string, inTable: boolean) => string) | undefined
) {
  return {
    ...(onWarning && { onWarning }),
    ...(orgismKeys && { orgismKeys }),
    ...(relink && { relink })
  }
}

// page links between two dialects; a Vanilla side carries the other's
function pageLinks({ input, output }: Sides) {
  const read = input?.markdown?.links?.read
  const write = output?.markdown?.links?.write
  return read && write
    ? (text: string, inTable: boolean): string => write(read(text), inTable)
    : undefined
}

// a translation is between two dialects; one on both sides normalizes
function twoSides(
  options: PresetOptions,
  format: Format,
  normalize: string
): Sides {
  const sides = resolveSides(options, format, format)
  const name = sides.input?.name ?? "vanilla"
  if (name === (sides.output?.name ?? "vanilla")) {
    throw new Error(
      `translation takes two presets; for '${name}' on both sides, use ${normalize}`
    )
  }
  return sides
}
