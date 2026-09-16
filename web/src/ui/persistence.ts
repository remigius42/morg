/**
 * What the converter remembers between visits. Its own module, and the
 * only DOM-free one of the split: reading a form and writing a store are
 * two jobs, and keeping the store's half free of elements is what lets
 * the paths that only a broken browser reaches — a partitioned iframe, a
 * private window, a hand-edited entry — be tested at all.
 */
const STORAGE_KEY = "morg-web"

/**
 * The remembered form, as it survives a reload. Every field is optional:
 * it may have been written by an older version of the page, or by hand.
 */
export interface PersistedState {
  direction?: string
  preset?: string
  useHtml?: boolean
  interpretHtml?: boolean
  taskCheckboxes?: boolean
  style?: Record<string, string>
  config?: string
}

/** Remembers the form. A store that refuses loses the memory, not the page. */
export function writeState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage may be unavailable (iframe partitioning, private mode)
  }
}

/**
 * The remembered form, or nothing remembered. Anything unreadable counts
 * as nothing: the entry is hand-editable and survives page versions, so
 * a first visit and a corrupt entry have to lead to the same place.
 */
export function readState(): PersistedState {
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}"
    ) as PersistedState
  } catch {
    return {}
  }
}
