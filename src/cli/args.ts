import { CliError } from "./error.js"
import { FLAGS_BY_NAME } from "./flags.js"

export interface CliArgs {
  help: boolean
  version: boolean
  fromFormat: string | undefined
  toFormat: string | undefined
  inputFile: string | undefined
  outputFile: string | undefined
  presetName: string | undefined
  inputPresetName: string | undefined
  outputPresetName: string | undefined
  // unset (undefined) so the config file can still decide -- see
  // buildConversionOptions; only an explicit flag overrides it
  silent: boolean | undefined
  taskCheckboxes: boolean | undefined
  html: boolean | undefined
  recordMarkdownStyle: boolean | undefined
  configPath: string | undefined
  markdownStyle: Record<string, string>
}

export function parseArgs(args: string[]): CliArgs {
  // gone in 0.10.0: one format on both sides normalizes (ADR 0006)
  if (args[0] === "normalize") {
    throw new CliError(
      "'morg normalize' is gone: the same format and preset on both sides normalizes (--from org --to org)"
    )
  }
  const parsed: CliArgs = {
    help: false,
    version: false,
    fromFormat: undefined,
    toFormat: undefined,
    inputFile: undefined,
    outputFile: undefined,
    presetName: undefined,
    inputPresetName: undefined,
    outputPresetName: undefined,
    silent: undefined,
    taskCheckboxes: undefined,
    html: undefined,
    recordMarkdownStyle: undefined,
    configPath: undefined,
    markdownStyle: {}
  }
  parseFlags(parsed, args)
  return parsed
}

// a following flag means the value was forgotten; a lone `-` is a legitimate
// bullet or rule character, so only recognized flag tokens disqualify
function takeValue(args: string[], index: number): string {
  const flag = args[index]
  const value = args[index + 1]
  if (value === undefined || FLAGS_BY_NAME.has(value)) {
    throw new CliError(`${flag} requires a value`)
  }
  return value
}

function parseFlags(parsed: CliArgs, args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ""
    const spec = FLAGS_BY_NAME.get(arg)
    if (!spec) {
      throw new CliError(`Unknown argument: ${arg}`)
    }
    switch (spec.kind) {
      case "boolean": {
        // boolean flags take an optional `true`/`false`; bare means true
        const value = args[i + 1]
        if (value === "true" || value === "false") {
          i++
        }
        parsed[spec.key] = value !== "false"
        break
      }
      case "info":
        parsed[spec.key] = true
        break
      case "string":
        parsed[spec.key] = takeValue(args, i++)
        break
      case "style":
        parsed.markdownStyle[spec.key] = takeValue(args, i++)
        break
    }
  }
}
