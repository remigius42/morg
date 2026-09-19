// the single source of truth for the CLI surface: the parser dispatches on
// these entries, so a flag is wired up by adding one entry rather than by
// touching a set, a map and a switch case in step

type StringOption =
  | "fromFormat"
  | "toFormat"
  | "inputFile"
  | "outputFile"
  | "presetName"
  | "configPath"

type BooleanOption =
  "silent" | "taskCheckboxes" | "interpretHtml" | "recordStyle"

type FlagSpec =
  | { names: string[]; arg: string; kind: "string"; key: StringOption }
  | { names: string[]; arg: string; kind: "style"; key: string }
  | { names: string[]; arg?: undefined; kind: "boolean"; key: BooleanOption }

const FLAGS: FlagSpec[] = [
  {
    names: ["--from"],
    arg: "<format>",
    kind: "string",
    key: "fromFormat"
  },
  {
    names: ["--to"],
    arg: "<format>",
    kind: "string",
    key: "toFormat"
  },
  {
    names: ["--input"],
    arg: "<file>",
    kind: "string",
    key: "inputFile"
  },
  {
    names: ["--output"],
    arg: "<file>",
    kind: "string",
    key: "outputFile"
  },
  {
    names: ["--preset"],
    arg: "<name>",
    kind: "string",
    key: "presetName"
  },
  {
    names: ["--config"],
    arg: "<file>",
    kind: "string",
    key: "configPath"
  },
  {
    names: ["-s", "--silent"],
    kind: "boolean",
    key: "silent"
  },
  {
    names: ["--task-checkboxes"],
    kind: "boolean",
    key: "taskCheckboxes"
  },
  {
    names: ["--interpret-html"],
    kind: "boolean",
    key: "interpretHtml"
  },
  {
    names: ["--record-style"],
    kind: "boolean",
    key: "recordStyle"
  },
  {
    names: ["--bullet"],
    arg: "<char>",
    kind: "style",
    key: "bullet"
  },
  {
    names: ["--emphasis"],
    arg: "<char>",
    kind: "style",
    key: "emphasis"
  },
  {
    names: ["--strong"],
    arg: "<char>",
    kind: "style",
    key: "strong"
  },
  {
    names: ["--fence"],
    arg: "<char>",
    kind: "style",
    key: "fence"
  },
  {
    names: ["--rule"],
    arg: "<char>",
    kind: "style",
    key: "rule"
  },
  {
    names: ["--rule-repetition"],
    arg: "<n>",
    kind: "style",
    key: "ruleRepetition"
  }
]

export const FLAGS_BY_NAME = new Map(
  FLAGS.flatMap(spec => spec.names.map(name => [name, spec] as const))
)
