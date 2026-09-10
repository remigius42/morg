import { convertMarkdownToOrg } from "./markdownToOrg.js"
import { convertOrgToMarkdown } from "./orgToMarkdown.js"
import type { MarkdownStyleOptions } from "./options.js"
import type { Preset } from "./presets/types.js"

/**
 * Options shared by both normalize directions. Normalization uses the
 * same configuration as conversion — Convergence is per-config (see ADR
 * 0002), so a file must be normalized with the preset it will be
 * converted with.
 */
export interface NormalizeOptions {
  /** Markdown output style; canonical form is per-config (ADR 0001). */
  markdownStyle?: MarkdownStyleOptions
  /** Called for each construct dropped without an equivalent. */
  onWarning?: (message: string) => void
  /** Dialect preset, applied on both legs of the round trip. */
  preset?: Preset
}

/**
 * Normalizes a Markdown string to morg's canonical form: one full round
 * trip (`md → org → md`), whose output is a fixed point (see ADR 0001).
 * This canonicalizes, it does not just re-style — org-isms and md-isms
 * are rewritten the same way a conversion would rewrite them.
 * @param markdown The Markdown string to normalize.
 * @param options Warning callback and dialect preset.
 * @returns The canonical-form Markdown string.
 */
export function normalizeMarkdown(
  markdown: string,
  options: NormalizeOptions = {}
): string {
  return convertOrgToMarkdown(convertMarkdownToOrg(markdown, options), options)
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
  return convertMarkdownToOrg(convertOrgToMarkdown(org, options), options)
}
