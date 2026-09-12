import * as path from "node:path"
import type { CliArgs } from "./args.js"
import { CliError } from "./error.js"

function formatFromExtension(file: string): string | undefined {
  const ext = path.extname(file).toLowerCase()
  if (ext === ".md") {
    return "markdown"
  }
  if (ext === ".org") {
    return "org"
  }
  return undefined
}

export function inferFormats(
  cli: CliArgs
): [fromFormat: string | undefined, toFormat: string | undefined] {
  let { fromFormat, toFormat } = cli

  // Infer formats from file extensions first
  if (cli.inputFile && !fromFormat) {
    fromFormat = formatFromExtension(cli.inputFile)
  }
  if (cli.outputFile && !toFormat) {
    toFormat = formatFromExtension(cli.outputFile)
  }

  return inferMissingFormat(cli.normalize, fromFormat, toFormat)
}

// Infer missing format based on the other
function inferMissingFormat(
  normalize: boolean,
  fromFormat: string | undefined,
  toFormat: string | undefined
): [fromFormat: string | undefined, toFormat: string | undefined] {
  if (normalize) {
    // mirror whichever side is known; a conflict between the two is left
    // intact for validateFormats to reject rather than silently overwritten
    fromFormat = fromFormat ?? toFormat
    toFormat = toFormat ?? fromFormat
  } else if (fromFormat && !toFormat) {
    toFormat = fromFormat === "markdown" ? "org" : "markdown"
  } else if (toFormat && !fromFormat) {
    fromFormat = toFormat === "markdown" ? "org" : "markdown"
  }
  return [fromFormat, toFormat]
}

export function validateFormats(
  fromFormat: string | undefined,
  toFormat: string | undefined,
  normalize: boolean
): asserts fromFormat is string {
  if (!fromFormat || !toFormat) {
    throw new CliError(
      "Error: Could not determine conversion formats.\n" +
        "Please specify --from and --to, or provide input/output files with .md or .org extensions."
    )
  }

  if (
    !["markdown", "org"].includes(fromFormat) ||
    !["markdown", "org"].includes(toFormat)
  ) {
    throw new CliError(
      `Error: Unsupported format. Supported formats are 'markdown' and 'org'.`
    )
  }

  if (!normalize && fromFormat === toFormat) {
    throw new CliError("Error: Source and target formats cannot be the same.")
  }

  if (normalize && fromFormat !== toFormat) {
    throw new CliError(
      "Error: normalize reads and writes the same format; " +
        `got '${fromFormat}' and '${toFormat}'.`
    )
  }
}
