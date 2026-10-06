/**
 * Lists the packages whose license is not on the allow list, by exact
 * identifier: license-checker's own `--onlyAllow` matches by substring,
 * so it lets `AGPL-3.0-or-later` through on `GPL-3.0-or-later`. Every
 * identifier in an SPDX expression must be allowed, an `OR` choice's
 * too: stricter than SPDX, but a choice then fails for a human to make.
 * @param {Record<string, { licenses?: string | string[] }>} report
 *   license-checker's `init` result, keyed `name@version`.
 * @param {string[]} allowed The SPDX identifiers that may ship.
 * @returns {string[]} `name@version: license`, one per offending package.
 */
export function disallowedLicenses(report, allowed) {
  return Object.entries(report)
    .filter(([, info]) =>
      identifiers(info.licenses).some(id => !allowed.includes(id))
    )
    .map(([key, info]) => `${key}: ${String(info.licenses)}`)
}

/** The license identifiers in an SPDX expression, operators dropped. */
function identifiers(licenses) {
  // String(): a package without a license field yields "undefined", and
  // fails like any other unlisted identifier
  return [licenses]
    .flat()
    .flatMap(expression => String(expression).split(/[\s()]+/))
    .filter(token => token && token !== "AND" && token !== "OR")
}
