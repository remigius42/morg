import { parse as parseToml } from "smol-toml"
import {
  HTML_CONSTRUCTS,
  type HtmlConstruct,
  type MarkdownStyleOptions,
  type PerConstruct,
  type Spelling,
  type Toggle
} from "./options.js"

type SpellingTable = Partial<Record<HtmlConstruct, Spelling>>

/**
 * The `[markdown]` section (ADR 0007): a construct's Spelling there sets
 * both sides, `input` and `output` override one each.
 */
export interface MarkdownConfig extends SpellingTable {
  input?: { interpretHtml?: Partial<Record<HtmlConstruct, boolean>> }
  output?: SpellingTable & {
    taskCheckboxes?: boolean
    preserveOrgisms?: Toggle
    style?: MarkdownStyleOptions
  }
}

/** The `[org]` section (ADR 0007): what writing org carries. */
interface OrgConfig {
  output?: { preserveMdisms?: Toggle; recordMarkdownStyle?: boolean }
}

/**
 * Shape of `morg.toml`. Options are named by format and side (ADR
 * 0007); `preset`, `inputPreset`, `outputPreset` and `silent` mirror
 * their CLI flags; `orgismKeys` is shared by both directions.
 * Precedence: CLI > config > defaults, per side for the presets.
 */
export interface MorgConfig {
  preset?: string
  inputPreset?: string
  outputPreset?: string
  silent?: boolean
  orgismKeys?: Record<string, string>
  markdown?: MarkdownConfig
  org?: OrgConfig
}

const KNOWN_KEYS = new Set([
  "preset",
  "inputPreset",
  "outputPreset",
  "silent",
  "orgismKeys",
  "markdown",
  "org"
])

// the sections named by direction before ADR 0007
const REPLACED_KEYS = new Set(["markdownToOrg", "orgToMarkdown"])

type Check = (value: unknown, path: string) => void

const spelling: Check = (value, path) => {
  if (value !== "markdown" && value !== "html") {
    throw new Error(`${path} must be "markdown" or "html"`)
  }
}

const flag: Check = (value, path) => {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be true or false`)
  }
}

// a toggle's or style's own keys are the library's to judge
const anything: Check = () => undefined

function table(shape: Record<string, Check>): Check {
  return (value, path) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`${path} must be a table`)
    }
    for (const [key, entry] of Object.entries(value)) {
      const check = shape[key]
      if (!check) {
        throw new Error(`Unknown config key: ${path}.${key}`)
      }
      check(entry, `${path}.${key}`)
    }
  }
}

const constructs = (check: Check): Record<string, Check> =>
  Object.fromEntries(HTML_CONSTRUCTS.map(construct => [construct, check]))

const SECTIONS: Record<string, Check> = {
  markdown: table({
    ...constructs(spelling),
    input: table({ interpretHtml: table(constructs(flag)) }),
    output: table({
      ...constructs(spelling),
      taskCheckboxes: flag,
      preserveOrgisms: anything,
      style: anything
    })
  }),
  org: table({
    output: table({ preserveMdisms: anything, recordMarkdownStyle: flag })
  })
}

/**
 * Parses a `morg.toml` source string. Unknown keys are rejected so
 * typos fail loudly instead of being silently ignored.
 * @param source The TOML source text.
 * @returns The parsed configuration.
 */
export function parseConfig(source: string): MorgConfig {
  const parsed = parseToml(source)
  const replaced = Object.keys(parsed).find(key => REPLACED_KEYS.has(key))
  if (replaced) {
    throw new Error(
      `'${replaced}' was replaced by [markdown] and [org] sections (ADR 0007)`
    )
  }
  const unknown = Object.keys(parsed).filter(key => !KNOWN_KEYS.has(key))
  if (unknown.length) {
    throw new Error(`Unknown config key(s): ${unknown.join(", ")}`)
  }
  for (const [key, check] of Object.entries(SECTIONS)) {
    if (parsed[key] !== undefined) {
      check(parsed[key], key)
    }
  }
  return parsed
}

// the constructs a table names, of a section that holds other keys too
function pickConstructs<T>(
  section: PerConstruct<T> | undefined
): PerConstruct<T> {
  return Object.fromEntries(
    HTML_CONSTRUCTS.filter(construct => section?.[construct] !== undefined).map(
      construct => [construct, section?.[construct]]
    )
  )
}

/**
 * What a config asks of each construct's HTML spelling, per side:
 * `[markdown]` sets both, a side section overrides it (ADR 0007).
 * @param markdown The config's `[markdown]` section.
 * @returns The constructs it names, per side.
 */
export function configuredHtml(markdown: MarkdownConfig | undefined): {
  interpretHtml: PerConstruct<boolean>
  spelling: PerConstruct<Spelling>
} {
  const shared = pickConstructs<Spelling>(markdown)
  return {
    interpretHtml: {
      ...Object.fromEntries(
        Object.entries(shared).map(([construct, spelling]) => [
          construct,
          spelling === "html"
        ])
      ),
      ...markdown?.input?.interpretHtml
    },
    spelling: { ...shared, ...pickConstructs<Spelling>(markdown?.output) }
  }
}
