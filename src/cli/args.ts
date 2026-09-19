import { CliError } from "./error.js"
import { FLAGS_BY_NAME } from "./flags.js"

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
  recordStyle: boolean | undefined
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
    recordStyle: undefined,
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
      case "string":
        parsed[spec.key] = takeValue(args, i++)
        break
      case "style":
        parsed.markdownStyle[spec.key] = takeValue(args, i++)
        break
    }
  }
}
