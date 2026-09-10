import { parse as parseToml } from "smol-toml"
import type { MarkdownToOrgOptions, OrgToMarkdownOptions } from "./options.js"

/**
 * Shape of `morg.toml`. Sections mirror the library options objects;
 * `preset` and `silent` mirror their CLI flags; `orgismKeys` is shared
 * by both directions. Precedence: CLI > config > defaults.
 */
export interface MorgConfig {
  preset?: string
  silent?: boolean
  orgismKeys?: Record<string, string>
  markdownToOrg?: Omit<MarkdownToOrgOptions, "preset" | "onWarning">
  orgToMarkdown?: Omit<
    OrgToMarkdownOptions,
    "preset" | "onWarning" | "orgismKeys"
  >
}

const KNOWN_KEYS = new Set([
  "preset",
  "silent",
  "orgismKeys",
  "markdownToOrg",
  "orgToMarkdown"
])

/**
 * Parses a `morg.toml` source string. Unknown top-level keys are
 * rejected so typos fail loudly instead of being silently ignored.
 * @param source The TOML source text.
 * @returns The parsed configuration.
 */
export function parseConfig(source: string): MorgConfig {
  const parsed = parseToml(source)
  const unknown = Object.keys(parsed).filter(key => !KNOWN_KEYS.has(key))
  if (unknown.length) {
    throw new Error(`Unknown config key(s): ${unknown.join(", ")}`)
  }
  return parsed
}
