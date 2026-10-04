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
export type TranslateOptions = PresetOptions & {
  onWarning?: (message: string) => void
  orgismKeys?: Record<string, string>
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
  const vanilla =
    input?.translateMarkdown?.(markdown, { ...context, side: "input" }) ??
    markdown
  return (
    output?.translateMarkdown?.(vanilla, { ...context, side: "output" }) ??
    vanilla
  )
}

// what a dialect's translation learns of the options
function hookContext(
  { onWarning, orgismKeys }: TranslateOptions,
  relink: ((text: string) => string) | undefined
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
  return read && write ? (text: string): string => write(read(text)) : undefined
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
