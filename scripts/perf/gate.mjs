// The performance gate: per conversion, HEAD may take at most TOLERANCE
// times the last tag's (normalized) time, and no more uniorg parses. A
// `head` entry in the timings raises a limit on purpose, with a reason;
// at the next release it becomes that tag's record.

const TOLERANCE = 1.25

// `v0.10.0` after `v0.9.0`
function compareVersions(a, b) {
  const [x, y] = [a, b].map(tag => tag.replace(/^v/, "").split(".").map(Number))
  const index = x.findIndex((part, i) => part !== y[i])
  return index === -1 ? 0 : x[index] - y[index]
}

/**
 * Lists how the measured results exceed their reference.
 * @param {Record<string, {normalizedTime: number, uniorgParses: number}>} measured
 *   HEAD's results per conversion.
 * @param {{
 *   tags: Record<string, Record<string, {normalizedTime: number, uniorgParses: number}>>,
 *   head?: {reason: string} & Record<string, {normalizedTime?: number, uniorgParses?: number}>
 * }} timings The recorded timings.
 * @returns {string[]} One message per exceeded limit, empty when HEAD passes.
 */
export function checkPerf(measured, timings) {
  const tag = Object.keys(timings.tags).sort(compareVersions).at(-1)
  // [value, where it comes from] of a conversion's metric
  const reference = (conversion, metric) => {
    const allowed = timings.head?.[conversion]?.[metric]
    return allowed === undefined
      ? [timings.tags[tag]?.[conversion]?.[metric], tag]
      : [allowed, `HEAD: ${timings.head.reason}`]
  }
  return Object.entries(measured).flatMap(([conversion, metrics]) => {
    const [time, timeSource] = reference(conversion, "normalizedTime")
    const [parses, parsesSource] = reference(conversion, "uniorgParses")
    return [
      time !== undefined && metrics.normalizedTime > TOLERANCE * time
        ? `${conversion}: normalizedTime ${metrics.normalizedTime.toFixed(2)} exceeds ${TOLERANCE} × ${time.toFixed(2)} (${timeSource})`
        : [],
      parses !== undefined && metrics.uniorgParses > parses
        ? `${conversion}: ${metrics.uniorgParses} uniorg parses exceed ${parses} (${parsesSource})`
        : []
    ].flat()
  })
}
