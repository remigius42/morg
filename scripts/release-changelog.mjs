// Runs from the `version` lifecycle script, which npm invokes after it
// has written the new version into package.json and before it commits:
// staging the rewrite here puts it in that commit, so the tag points at
// a changelog, package.json and lockfile that already agree.
import { readFileSync, writeFileSync } from "node:fs"
import process from "node:process"
import { openReleaseSection } from "./openReleaseSection.mjs"

const CHANGELOG = "CHANGELOG.md"

const version = process.env.npm_package_version
if (!version) {
  throw new Error("npm_package_version is unset; run this via `npm version`")
}

const date = new Date().toISOString().slice(0, 10)
const changelog = readFileSync(CHANGELOG, "utf8")

writeFileSync(CHANGELOG, openReleaseSection(changelog, version, date))
process.stdout.write(`${CHANGELOG}: opened ${version} - ${date}\n`)
