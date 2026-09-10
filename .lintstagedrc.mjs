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
  "**/*.md": "markdownlint-cli2",
  "**/*.{ts,mts,js,mjs}": [
    async files => {
      const filesToLint = await removeIgnoredFiles(files)
      if (filesToLint.length === 0) {
        return []
      }
      return `eslint --max-warnings=0 ${filesToLint.join(" ")}`
    },
    "vitest run --passWithNoTests"
  ]
}
