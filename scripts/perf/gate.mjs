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

// the reference of each conversion's metric: `[value, where it comes
// from]`, value undefined where none is recorded
function referenceOf(timings) {
  const tag = latestTag(timings)
  return (conversion, metric) => {
    const allowed = timings.head?.[conversion]?.[metric]
    return allowed === undefined
      ? [timings.tags[tag]?.[conversion]?.[metric], tag]
      : [allowed, `HEAD: ${timings.head.reason}`]
  }
}

function latestTag(timings) {
  return Object.keys(timings.tags).sort(compareVersions).at(-1)
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
  const reference = referenceOf(timings)
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

/**
 * The measured results next to their limits, for `console.table`.
 * @param {Record<string, {normalizedTime: number, uniorgParses: number}>} measured
 *   HEAD's results per conversion.
 * @param {Parameters<typeof checkPerf>[1]} timings The recorded timings.
 * @returns {Record<string, Record<string, number | undefined>>} One row
 *   per conversion; a limit is undefined where no reference is recorded.
 */
export function perfTable(measured, timings) {
  const reference = referenceOf(timings)
  return Object.fromEntries(
    Object.entries(measured).map(([conversion, metrics]) => {
      const [time] = reference(conversion, "normalizedTime")
      const [parses] = reference(conversion, "uniorgParses")
      return [
        conversion,
        {
          normalizedTime: metrics.normalizedTime,
          // the largest time, to the recorded two decimals, that passes
          "max normalizedTime":
            time === undefined
              ? undefined
              : Math.floor(TOLERANCE * time * 100 + 1e-9) / 100,
          uniorgParses: metrics.uniorgParses,
          "max uniorgParses": parses
        }
      ]
    })
  )
}

/**
 * How the limits in `perfTable` come about.
 * @param {Parameters<typeof checkPerf>[1]} timings The recorded timings.
 * @returns {string} The formula and the references' source.
 */
export function perfFormula(timings) {
  const tag = latestTag(timings)
  const source = timings.head
    ? `HEAD budget where set (${timings.head.reason}), else ${tag}`
    : tag
  return `max normalizedTime = ${TOLERANCE} × reference, max uniorgParses = reference; reference: ${source}`
}
