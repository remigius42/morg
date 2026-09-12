#!/usr/bin/env node

import * as fs from "node:fs"
import { parseArgs } from "./cli/args.js"
import { loadConfig } from "./cli/configFile.js"
import { resolvePreset } from "./cli/presets.js"
import { inferFormats, validateFormats } from "./cli/formats.js"
import { convert } from "./cli/conversion.js"
import { CliError } from "./cli/error.js"

async function readInput(inputFile: string | undefined): Promise<string> {
  if (inputFile) {
    return fs.readFileSync(inputFile, "utf8")
  }
  // Read from stdin
  return new Promise<string>(resolve => {
    const chunks: Buffer[] = []
    process.stdin.on("data", chunk => {
      chunks.push(chunk)
    })
    process.stdin.on("end", () => {
      // decode once: a multi-byte character may straddle two chunks
      resolve(Buffer.concat(chunks).toString("utf8"))
    })
  })
}

async function main() {
  const cli = parseArgs(process.argv.slice(2))
  const config = loadConfig(cli.configPath)
  const preset = resolvePreset(cli.presetName ?? config.preset)

  const [fromFormat, toFormat] = inferFormats(cli)
  validateFormats(fromFormat, toFormat, cli.normalize)

  const inputContent = await readInput(cli.inputFile)
  const outputContent = convert(
    inputContent,
    fromFormat,
    cli.normalize,
    cli,
    config,
    preset
  )

  if (cli.outputFile) {
    fs.writeFileSync(cli.outputFile, outputContent, "utf8")
  } else {
    console.log(outputContent)
  }
}

main().catch((error: unknown) => {
  if (error instanceof CliError) {
    // helpers throw instead of exiting; this is the only exit point
    if (error.cause !== undefined) {
      console.error(error.message, error.cause)
    } else {
      console.error(error.message)
    }
  } else {
    console.error("An unexpected error occurred:", error)
  }
  process.exit(1)
})
