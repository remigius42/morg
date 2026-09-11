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

interface CliArgs {
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

function parseArgs(args: string[]): CliArgs {
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
        console.error(`Unknown argument: ${arg}`)
        process.exit(1)
    }
  }
}

// morg.toml: precedence is CLI > config > defaults
function loadConfig(configPath: string | undefined): MorgConfig {
  const resolvedConfigPath =
    configPath ?? (fs.existsSync("morg.toml") ? "morg.toml" : undefined)
  if (!resolvedConfigPath) {
    return {}
  }
  try {
    return parseConfig(fs.readFileSync(resolvedConfigPath, "utf8"))
  } catch (error) {
    console.error(`Error reading ${resolvedConfigPath}:`, error)
    process.exit(1)
  }
}

function resolvePreset(presetName: string | undefined): Preset | undefined {
  if (!presetName) {
    return undefined
  }
  const factory = PRESETS[presetName]
  if (!factory) {
    console.error(
      `Error: Unknown preset '${presetName}'. Available presets: ${Object.keys(PRESETS).join(", ")}`
    )
    process.exit(1)
  }
  return factory()
}

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

function inferFormats(
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
    fromFormat = fromFormat ?? toFormat
    toFormat = fromFormat
  } else if (fromFormat && !toFormat) {
    toFormat = fromFormat === "markdown" ? "org" : "markdown"
  } else if (toFormat && !fromFormat) {
    fromFormat = toFormat === "markdown" ? "org" : "markdown"
  }
  return [fromFormat, toFormat]
}

function validateFormats(
  fromFormat: string | undefined,
  toFormat: string | undefined,
  normalize: boolean
): asserts fromFormat is string {
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
}

async function readInput(inputFile: string | undefined): Promise<string> {
  if (inputFile) {
    return fs.readFileSync(inputFile, "utf8")
  }
  // Read from stdin
  return new Promise<string>(resolve => {
    let data = ""
    process.stdin.on("data", chunk => {
      data += chunk.toString()
    })
    process.stdin.on("end", () => {
      resolve(data)
    })
  })
}

function buildConversionOptions(
  cli: CliArgs,
  config: MorgConfig,
  preset: Preset | undefined
) {
  const silent = cli.silent || config.silent === true
  const taskCheckboxes =
    cli.taskCheckboxes || config.orgToMarkdown?.taskCheckboxes === true
  const interpretHtml =
    cli.interpretHtml || config.markdownToOrg?.interpretHtml === true

  // dropped constructs are reported on stderr unless -s / --silent
  const onWarning = silent
    ? undefined
    : (message: string) => console.error(`morg: ${message}`)

  // config values first, CLI flags layered on top
  const style: MarkdownStyleOptions = {
    ...config.orgToMarkdown?.markdownStyle,
    ...cli.markdownStyle,
    ...(cli.markdownStyle.ruleRepetition !== undefined && {
      ruleRepetition: Number(cli.markdownStyle.ruleRepetition)
    })
  }
  const shared = {
    preset,
    onWarning,
    ...(config.orgismKeys && { orgismKeys: config.orgismKeys })
  }
  const mdToOrgOptions = { ...config.markdownToOrg, ...shared, interpretHtml }
  const orgToMdOptions = {
    ...config.orgToMarkdown,
    ...shared,
    taskCheckboxes,
    markdownStyle: style
  }
  return { mdToOrgOptions, orgToMdOptions }
}

function convert(
  inputContent: string,
  fromFormat: string,
  normalize: boolean,
  cli: CliArgs,
  config: MorgConfig,
  preset: Preset | undefined
): string {
  try {
    const { mdToOrgOptions, orgToMdOptions } = buildConversionOptions(
      cli,
      config,
      preset
    )
    if (normalize) {
      return fromFormat === "markdown"
        ? normalizeMarkdown(inputContent, {
            ...mdToOrgOptions,
            ...orgToMdOptions
          })
        : normalizeOrg(inputContent, { ...mdToOrgOptions, ...orgToMdOptions })
    }
    if (fromFormat === "markdown") {
      return convertMarkdownToOrg(inputContent, mdToOrgOptions)
    }
    return convertOrgToMarkdown(inputContent, orgToMdOptions)
  } catch (error) {
    console.error("Conversion error:", error)
    process.exit(1)
  }
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
  console.error("An unexpected error occurred:", error)
  process.exit(1)
})
