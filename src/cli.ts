#!/usr/bin/env node

import * as fs from "node:fs"
import * as path from "node:path"
import { convertMarkdownToOrg } from "./markdownToOrg.js"
import { convertOrgToMarkdown } from "./orgToMarkdown.js"
import { logseq } from "./presets/logseq.js"
import { obsidian } from "./presets/obsidian.js"
import type { Preset } from "./presets/types.js"

const PRESETS: Record<string, () => Preset> = {
  logseq: () => logseq(),
  obsidian: () => obsidian()
}

async function main() {
  const args = process.argv.slice(2)
  let fromFormat: string | undefined
  let toFormat: string | undefined
  let inputFile: string | undefined
  let outputFile: string | undefined
  let presetName: string | undefined
  let silent = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case "-s":
      case "--silent":
        silent = true
        break
      case "--from":
        fromFormat = args[++i]
        break
      case "--to":
        toFormat = args[++i]
        break
      case "--input":
        inputFile = args[++i]
        break
      case "--output":
        outputFile = args[++i]
        break
      case "--preset":
        presetName = args[++i]
        break
      default:
        console.error(`Unknown argument: ${arg}`)
        process.exit(1)
    }
  }

  let preset: Preset | undefined
  if (presetName) {
    const factory = PRESETS[presetName]
    if (!factory) {
      console.error(
        `Error: Unknown preset '${presetName}'. Available presets: ${Object.keys(PRESETS).join(", ")}`
      )
      process.exit(1)
    }
    preset = factory()
  }

  // Infer formats from file extensions first
  if (inputFile && !fromFormat) {
    const ext = path.extname(inputFile).toLowerCase()
    if (ext === ".md") {
      fromFormat = "markdown"
    } else if (ext === ".org") {
      fromFormat = "org"
    }
  }

  if (outputFile && !toFormat) {
    const ext = path.extname(outputFile).toLowerCase()
    if (ext === ".md") {
      toFormat = "markdown"
    } else if (ext === ".org") {
      toFormat = "org"
    }
  }

  // Infer missing format based on the other
  if (fromFormat && !toFormat) {
    toFormat = fromFormat === "markdown" ? "org" : "markdown"
  } else if (toFormat && !fromFormat) {
    fromFormat = toFormat === "markdown" ? "org" : "markdown"
  }

  // Validate formats
  if (!fromFormat || !toFormat) {
    console.error("Error: Could not determine conversion formats.")
    console.error(
      "Please specify --from and --to, or provide input/output files with .md or .org extensions."
    )
    process.exit(1)
  }

  if (
    !["markdown", "org"].includes(fromFormat) ||
    !["markdown", "org"].includes(toFormat)
  ) {
    console.error(
      `Error: Unsupported format. Supported formats are 'markdown' and 'org'.`
    )
    process.exit(1)
  }

  if (fromFormat === toFormat) {
    console.error("Error: Source and target formats cannot be the same.")
    process.exit(1)
  }

  let inputContent: string
  if (inputFile) {
    inputContent = fs.readFileSync(inputFile, "utf8")
  } else {
    // Read from stdin
    inputContent = await new Promise<string>(resolve => {
      let data = ""
      process.stdin.on("data", chunk => {
        data += chunk.toString()
      })
      process.stdin.on("end", () => {
        resolve(data)
      })
    })
  }

  // dropped constructs are reported on stderr unless -s / --silent
  const onWarning = silent
    ? undefined
    : (message: string) => console.error(`morg: ${message}`)

  let outputContent: string
  try {
    if (fromFormat === "markdown") {
      outputContent = convertMarkdownToOrg(inputContent, { preset, onWarning })
    } else {
      outputContent = convertOrgToMarkdown(inputContent, { preset, onWarning })
    }
  } catch (error) {
    console.error("Conversion error:", error)
    process.exit(1)
  }

  if (outputFile) {
    fs.writeFileSync(outputFile, outputContent, "utf8")
  } else {
    console.log(outputContent)
  }
}

main().catch((error: unknown) => {
  console.error("An unexpected error occurred:", error)
  process.exit(1)
})
