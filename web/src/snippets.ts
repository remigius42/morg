/**
 * morg.toml snippets aligning morg's canonical Markdown with other
 * formatters. Documented in docs/CONFIGURATION.md (pinned by test).
 */
export const CONFIG_SNIPPETS = {
  prettier: {
    label: "prettier",
    toml: `# prettier compatibility: morg's canonical form already matches
# prettier's defaults except the emphasis marker
[orgToMarkdown.markdownStyle]
emphasis = "_"
`
  },
  mdformat: {
    label: "mdformat",
    toml: `# mdformat compatibility: defaults align except thematic breaks,
# which mdformat writes as 70 underscores
[orgToMarkdown.markdownStyle]
rule = "_"
ruleRepetition = 70
`
  }
} as const
