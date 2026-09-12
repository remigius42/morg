import { CliError } from "./error.js"

export interface CliArgs {
  normalize: boolean
  fromFormat: string | undefined
  toFormat: string | undefined
  inputFile: string | undefined
  outputFile: string | undefined
  presetName: string | undefined
  // unset (undefined) so the config file can still decide -- see
  // buildConversionOptions; only an explicit flag overrides it
  silent: boolean | undefined
  taskCheckboxes: boolean | undefined
  interpretHtml: boolean | undefined
  configPath: string | undefined
  markdownStyle: Record<string, string>
}

export function parseArgs(args: string[]): CliArgs {
  // `morg normalize` canonicalizes in place of converting: same format
  // in and out, one full round trip (see ADR 0001)
  const normalize = args[0] === "normalize"
  if (normalize) {
    args.shift()
  }
  const parsed: CliArgs = {
    normalize,
    fromFormat: undefined,
    toFormat: undefined,
    inputFile: undefined,
    outputFile: undefined,
    presetName: undefined,
    silent: undefined,
    taskCheckboxes: undefined,
    interpretHtml: undefined,
    configPath: undefined,
    markdownStyle: {}
  }
  parseFlags(parsed, args)
  return parsed
}

const VALUE_FLAGS = new Set([
  "--config",
  "--bullet",
  "--emphasis",
  "--strong",
  "--fence",
  "--rule",
  "--rule-repetition",
  "--from",
  "--to",
  "--input",
  "--output",
  "--preset"
])

type BooleanOption = "silent" | "taskCheckboxes" | "interpretHtml"

const BOOLEAN_FLAGS = new Map<string, BooleanOption>([
  ["-s", "silent"],
  ["--silent", "silent"],
  ["--task-checkboxes", "taskCheckboxes"],
  ["--interpret-html", "interpretHtml"]
])

// a following flag means the value was forgotten; a lone `-` is a legitimate
// bullet or rule character, so only recognized flag tokens disqualify
function takeValue(args: string[], index: number): string {
  const flag = args[index]
  const value = args[index + 1]
  if (
    value === undefined ||
    VALUE_FLAGS.has(value) ||
    BOOLEAN_FLAGS.has(value)
  ) {
    throw new CliError(`${flag} requires a value`)
  }
  return value
}

function parseFlags(parsed: CliArgs, args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ""
    // boolean flags take an optional `true`/`false`; bare means true
    const option = BOOLEAN_FLAGS.get(arg)
    if (option) {
      const value = args[i + 1]
      if (value === "true" || value === "false") {
        i++
      }
      parsed[option] = value !== "false"
      continue
    }
    switch (arg) {
      case "--config":
        parsed.configPath = takeValue(args, i++)
        break
      case "--bullet":
      case "--emphasis":
      case "--strong":
      case "--fence":
      case "--rule":
        parsed.markdownStyle[arg.slice(2)] = takeValue(args, i++)
        break
      case "--rule-repetition":
        parsed.markdownStyle.ruleRepetition = takeValue(args, i++)
        break
      case "--from":
        parsed.fromFormat = takeValue(args, i++)
        break
      case "--to":
        parsed.toFormat = takeValue(args, i++)
        break
      case "--input":
        parsed.inputFile = takeValue(args, i++)
        break
      case "--output":
        parsed.outputFile = takeValue(args, i++)
        break
      case "--preset":
        parsed.presetName = takeValue(args, i++)
        break
      default:
        throw new CliError(`Unknown argument: ${arg}`)
    }
  }
}
