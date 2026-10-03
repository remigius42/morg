import { convertMarkdownToOrg } from "./markdownToOrg.js"
import { convertOrgToMarkdown } from "./orgToMarkdown.js"
import type { MarkdownToOrgOptions, OrgToMarkdownOptions } from "./options.js"
import type { Preset } from "./presets/types.js"

/**
 * The full option set of both directions: normalization uses the same
 * configuration as conversion, because Convergence is per-config (ADR
 * 0002), so a file must be normalized with the exact config (preset,
 * style, key names, toggles) it will be converted with.
 */
export type NormalizeOptions = MarkdownToOrgOptions & OrgToMarkdownOptions

/**
 * Normalizes a Markdown string to morg's canonical form: one full round
 * trip (`md → org → md`), whose output is a fixed point (see ADR 0001).
 * This canonicalizes, it does not just re-style: org-isms and md-isms
 * are rewritten the same way a conversion would rewrite them.
 * @param markdown The Markdown string to normalize.
 * @param options Warning callback and dialect preset.
 * @returns The canonical-form Markdown string.
 */
export function normalizeMarkdown(
  markdown: string,
  options: NormalizeOptions = {}
): string {
  const single = onePreset(options)
  return convertOrgToMarkdown(convertMarkdownToOrg(markdown, single), single)
}

/**
 * Normalizes an Org string to morg's canonical form: one full round trip
 * (`org → md → org`), whose output is a fixed point (see ADR 0001).
 * @param org The Org string to normalize.
 * @param options Warning callback and dialect preset.
 * @returns The canonical-form Org string.
 */
export function normalizeOrg(
  org: string,
  options: NormalizeOptions = {}
): string {
  const single = onePreset(options)
  return convertMarkdownToOrg(convertOrgToMarkdown(org, single), single)
}

// normalizing canonicalizes within one dialect (ADR 0006), so both
// sides name the same preset, which then sets both ways of the trip
function onePreset(options: NormalizeOptions): NormalizeOptions {
  const { preset, inputPreset, outputPreset, ...rest } = options
  const input = inputPreset ?? preset
  const output = outputPreset ?? preset
  if (input?.name !== output?.name) {
    const name = (key: string, side: Preset | undefined) =>
      `${key} '${side?.name ?? "vanilla"}'`
    throw new Error(
      `normalize takes one preset; got ${name("inputPreset", input)} and ${name("outputPreset", output)}`
    )
  }
  return input ? { ...rest, preset: input } : rest
}
