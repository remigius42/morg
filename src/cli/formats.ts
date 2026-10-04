import type { CliArgs } from "./args.js"
import { CliError } from "./error.js"
import { formatFromFileName, splitFileName } from "../fileNames.js"
import type { Format } from "../presets/sides.js"

export function inferFormats(
  cli: CliArgs
): [fromFormat: string | undefined, toFormat: string | undefined] {
  let { fromFormat, toFormat } = cli

  // Infer formats from file extensions first
  if (cli.inputFile && !fromFormat) {
    fromFormat = formatFromFileName(cli.inputFile)
  }
  if (cli.outputFile && !toFormat) {
    toFormat = formatFromFileName(cli.outputFile)
  }

  return inferMissingFormat(fromFormat, toFormat)
}

// Infer missing format based on the other
function inferMissingFormat(
  fromFormat: string | undefined,
  toFormat: string | undefined
): [fromFormat: string | undefined, toFormat: string | undefined] {
  if (fromFormat && !toFormat) {
    toFormat = fromFormat === "markdown" ? "org" : "markdown"
  } else if (toFormat && !fromFormat) {
    fromFormat = toFormat === "markdown" ? "org" : "markdown"
  }
  return [fromFormat, toFormat]
}

// --from and --to read like the file pair they usually accompany, so a file
// name given to one is the likely mistake behind an unsupported format
function fileNameHint(flag: "--from" | "--to", value: string): string {
  if (splitFileName(value).extension === "") {
    return ""
  }
  const fileFlag = flag === "--from" ? "--input" : "--output"
  return `\n${flag} takes a format name; for a file use ${fileFlag} ${value}.`
}

export function validateFormats(
  fromFormat: string | undefined,
  toFormat: string | undefined
): [fromFormat: Format, toFormat: Format] {
  if (!fromFormat || !toFormat) {
    throw new CliError(
      "Error: Could not determine conversion formats.\n" +
        "Please specify --from and --to, or provide input/output files with .md or .org extensions."
    )
  }

  for (const [flag, value] of [
    ["--from", fromFormat],
    ["--to", toFormat]
  ] as const) {
    if (!["markdown", "org"].includes(value)) {
      throw new CliError(
        `Error: Unsupported format '${value}'. Supported formats are ` +
          `'markdown' and 'org'.${fileNameHint(flag, value)}`
      )
    }
  }

  return [fromFormat as Format, toFormat as Format]
}
