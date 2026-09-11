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
        parsed.configPath = args[++i]
        break
      case "--bullet":
      case "--emphasis":
      case "--strong":
      case "--fence":
      case "--rule":
        parsed.markdownStyle[arg.slice(2)] = args[++i] ?? ""
        break
      case "--rule-repetition":
        parsed.markdownStyle.ruleRepetition = args[++i] ?? ""
        break
      case "--from":
        parsed.fromFormat = args[++i]
        break
      case "--to":
        parsed.toFormat = args[++i]
        break
      case "--input":
        parsed.inputFile = args[++i]
        break
      case "--output":
        parsed.outputFile = args[++i]
        break
      case "--preset":
        parsed.presetName = args[++i]
        break
      default:
        throw new CliError(`Unknown argument: ${arg}`)
    }
  }
}
