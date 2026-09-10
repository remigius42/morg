#!/usr/bin/env node

import * as fs from "node:fs"
import * as path from "node:path"
import { convertMarkdownToOrg } from "./markdownToOrg.js"
import { convertOrgToMarkdown } from "./orgToMarkdown.js"
import { normalizeMarkdown, normalizeOrg } from "./normalize.js"
import { parseConfig, type MorgConfig } from "./config.js"
import type { MarkdownStyleOptions } from "./options.js"
import { logseq } from "./presets/logseq.js"
import { obsidian } from "./presets/obsidian.js"
import type { Preset } from "./presets/types.js"

const PRESETS: Record<string, () => Preset> = {
  logseq: () => logseq(),
  obsidian: () => obsidian()
}

async function main() {
  const args = process.argv.slice(2)
  // `morg normalize` canonicalizes in place of converting: same format
  // in and out, one full round trip (see ADR 0001)
  const normalize = args[0] === "normalize"
  if (normalize) {
    args.shift()
  }
  let fromFormat: string | undefined
  let toFormat: string | undefined
  let inputFile: string | undefined
  let outputFile: string | undefined
  let presetName: string | undefined
  let silent = false
  let taskCheckboxes = false
  let configPath: string | undefined
  const markdownStyle: Record<string, string> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case "-s":
      case "--silent":
        silent = true
        break
      case "--task-checkboxes":
        taskCheckboxes = true
        break
      case "--config":
        configPath = args[++i]
        break
      case "--bullet":
      case "--emphasis":
      case "--strong":
      case "--fence":
      case "--rule":
        markdownStyle[arg.slice(2)] = args[++i] ?? ""
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

  // morg.toml: precedence is CLI > config > defaults
  let config: MorgConfig = {}
  const resolvedConfigPath =
    configPath ?? (fs.existsSync("morg.toml") ? "morg.toml" : undefined)
  if (resolvedConfigPath) {
    try {
      config = parseConfig(fs.readFileSync(resolvedConfigPath, "utf8"))
    } catch (error) {
      console.error(`Error reading ${resolvedConfigPath}:`, error)
      process.exit(1)
    }
  }
  presetName = presetName ?? config.preset
  silent = silent || config.silent === true
  taskCheckboxes =
    taskCheckboxes || config.orgToMarkdown?.taskCheckboxes === true

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
  if (normalize) {
    fromFormat = fromFormat ?? toFormat
    toFormat = fromFormat
  } else if (fromFormat && !toFormat) {
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

  if (!normalize && fromFormat === toFormat) {
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
    // config values first, CLI flags layered on top
    const style: MarkdownStyleOptions = {
      ...config.orgToMarkdown?.markdownStyle,
      ...(markdownStyle as MarkdownStyleOptions)
    }
    const shared = {
      preset,
      onWarning,
      ...(config.orgismKeys && { orgismKeys: config.orgismKeys })
    }
    const mdToOrgOptions = { ...config.markdownToOrg, ...shared }
    const orgToMdOptions = {
      ...config.orgToMarkdown,
      ...shared,
      taskCheckboxes,
      markdownStyle: style
    }
    if (normalize) {
      outputContent =
        fromFormat === "markdown"
          ? normalizeMarkdown(inputContent, {
              ...mdToOrgOptions,
              ...orgToMdOptions
            })
          : normalizeOrg(inputContent, { ...mdToOrgOptions, ...orgToMdOptions })
    } else if (fromFormat === "markdown") {
      outputContent = convertMarkdownToOrg(inputContent, mdToOrgOptions)
    } else {
      outputContent = convertOrgToMarkdown(inputContent, orgToMdOptions)
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
