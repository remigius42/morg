// the single source of truth for the CLI surface: the parser dispatches on
// these entries and the help text is rendered from them, so a flag cannot
// exist undocumented or be documented without existing

type StringOption =
  | "fromFormat"
  | "toFormat"
  | "inputFile"
  | "outputFile"
  | "presetName"
  | "configPath"

type BooleanOption =
  "silent" | "taskCheckboxes" | "interpretHtml" | "recordStyle"

type InfoOption = "help" | "version"

export type FlagSpec =
  | ({ names: string[]; arg: string; description: string } & (
      { kind: "string"; key: StringOption } | { kind: "style"; key: string }
    ))
  | ({ names: string[]; arg?: undefined; description: string } & (
      | { kind: "boolean"; key: BooleanOption }
      | { kind: "info"; key: InfoOption }
    ))

// declaration order is the order the help text lists them in
export const FLAGS: FlagSpec[] = [
  {
    names: ["--from"],
    arg: "<format>",
    description: "Source format: markdown or org",
    kind: "string",
    key: "fromFormat"
  },
  {
    names: ["--to"],
    arg: "<format>",
    description: "Target format: markdown or org",
    kind: "string",
    key: "toFormat"
  },
  {
    names: ["--input"],
    arg: "<file>",
    description: "Read from a file instead of stdin",
    kind: "string",
    key: "inputFile"
  },
  {
    names: ["--output"],
    arg: "<file>",
    description: "Write to a file instead of stdout",
    kind: "string",
    key: "outputFile"
  },
  {
    names: ["--preset"],
    arg: "<name>",
    description: "Apply an editor preset, for example logseq",
    kind: "string",
    key: "presetName"
  },
  {
    names: ["--config"],
    arg: "<file>",
    description: "Read settings from a TOML file",
    kind: "string",
    key: "configPath"
  },
  {
    names: ["-s", "--silent"],
    description: "Suppress warnings about dropped constructs",
    kind: "boolean",
    key: "silent"
  },
  {
    names: ["--task-checkboxes"],
    description: "Render Org TODO keywords as Markdown checkboxes",
    kind: "boolean",
    key: "taskCheckboxes"
  },
  {
    names: ["--interpret-html"],
    description: "Convert inline HTML instead of passing it through",
    kind: "boolean",
    key: "interpretHtml"
  },
  {
    names: ["--record-style"],
    description: "Record the detected Markdown style as front matter",
    kind: "boolean",
    key: "recordStyle"
  },
  {
    names: ["-h", "--help"],
    description: "Show this help",
    kind: "info",
    key: "help"
  },
  {
    names: ["--version"],
    description: "Show the version",
    kind: "info",
    key: "version"
  },
  {
    names: ["--bullet"],
    arg: "<char>",
    description: "List bullet character",
    kind: "style",
    key: "bullet"
  },
  {
    names: ["--emphasis"],
    arg: "<char>",
    description: "Emphasis marker",
    kind: "style",
    key: "emphasis"
  },
  {
    names: ["--strong"],
    arg: "<char>",
    description: "Strong emphasis marker",
    kind: "style",
    key: "strong"
  },
  {
    names: ["--fence"],
    arg: "<char>",
    description: "Code fence character",
    kind: "style",
    key: "fence"
  },
  {
    names: ["--rule"],
    arg: "<char>",
    description: "Thematic break character",
    kind: "style",
    key: "rule"
  },
  {
    names: ["--rule-repetition"],
    arg: "<n>",
    description: "Thematic break character count",
    kind: "style",
    key: "ruleRepetition"
  }
]

export const FLAGS_BY_NAME = new Map(
  FLAGS.flatMap(spec => spec.names.map(name => [name, spec] as const))
)
