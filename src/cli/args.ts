import { CliError } from "./error.js"

export interface CliArgs {
  normalize: boolean
  fromFormat: string | undefined
  toFormat: string | undefined
  inputFile: string | undefined
  outputFile: string | undefined
  presetName: string | undefined
  silent: boolean
  taskCheckboxes: boolean
  interpretHtml: boolean
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
    silent: false,
    taskCheckboxes: false,
    interpretHtml: false,
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

const BOOLEAN_FLAGS = new Set([
  "-s",
  "--silent",
  "--task-checkboxes",
  "--interpret-html"
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
    const arg = args[i]
    switch (arg) {
      case "-s":
      case "--silent":
        parsed.silent = true
        break
      case "--task-checkboxes":
        parsed.taskCheckboxes = true
        break
      case "--interpret-html":
        parsed.interpretHtml = true
        break
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
