import { ESLint } from "eslint"

const removeIgnoredFiles = async files => {
  const eslint = new ESLint()
  const isIgnored = await Promise.all(
    files.map(file => eslint.isPathIgnored(file))
  )
  return files.filter((_, i) => !isIgnored[i])
}

export default {
  "**/*": [
    "prettier --no-error-on-unmatched-pattern --ignore-unknown --list-different",
    "cspell --dot --no-must-find-files --no-progress"
  ],
  // explicit file arguments bypass the ignores in .markdownlint-cli2.yaml,
  // so filter the conversion fixtures here as well
  "**/*.md": files => {
    const filtered = files.filter(file => !file.includes("tests/fixtures/"))
    return filtered.length ? `markdownlint-cli2 ${filtered.join(" ")}` : []
  },
  "**/*.{ts,mts,js,mjs}": [
    async files => {
      const filesToLint = await removeIgnoredFiles(files)
      if (filesToLint.length === 0) {
        return []
      }
      return `eslint --max-warnings=0 ${filesToLint.join(" ")}`
    },
    "vitest run --passWithNoTests",
    // function form: project-wide typecheck regardless of staged files
    // (eslint's typed rules don't fully type-check; see d536b60)
    () => "tsc --noEmit -p tsconfig.json"
  ]
}
