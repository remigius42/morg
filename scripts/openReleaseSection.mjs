// Opens a released section in a Keep a Changelog document: the entries
// standing under `## [Unreleased]` get a `## [x.y.z] - YYYY-MM-DD`
// heading, and the link definitions at the bottom gain a compare link
// for the new version while `[unreleased]` moves on to it.
//
// Strict on purpose: every throw here is a release that would otherwise
// ship empty, duplicated or misdated notes, and the tag is cut moments
// later. Refusing costs one command; a wrong tag costs a patch release.

const UNRELEASED = "## [Unreleased]\n"
const REPOSITORY = "https://github.com/remigius42/morg"

/**
 * Rewrites a changelog so the pending entries belong to `version`.
 * @param changelog The current CHANGELOG.md contents.
 * @param version The version being released, without a leading `v`.
 * @param date The release date as `YYYY-MM-DD`.
 * @returns The rewritten changelog.
 */
export function openReleaseSection(changelog, version, date) {
  if (changelog.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md already has a section for ${version}`)
  }
  if (!changelog.includes(UNRELEASED)) {
    throw new Error('CHANGELOG.md has no "## [Unreleased]" heading')
  }

  const pending = changelog.split(UNRELEASED)[1]
  const nextHeading = pending.indexOf("\n## [")
  const entries = nextHeading === -1 ? pending : pending.slice(0, nextHeading)
  if (!entries.trim()) {
    throw new Error('CHANGELOG.md has no entries under "## [Unreleased]"')
  }

  const previous = /^\[(\d+\.\d+\.\d+)\]:/m.exec(changelog)?.[1]
  if (!previous) {
    throw new Error("CHANGELOG.md has no previous version link definition")
  }

  return changelog
    .replace(UNRELEASED, `${UNRELEASED}\n## [${version}] - ${date}\n`)
    .replace(
      /^\[unreleased\]: .*$/m,
      `[unreleased]: ${REPOSITORY}/compare/v${version}...HEAD\n` +
        `[${version}]: ${REPOSITORY}/compare/v${previous}...v${version}`
    )
}
