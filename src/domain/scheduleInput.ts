/**
 * READING A DATE SOMEBODY ELSE WROTE.
 *
 * The connector is handed ISO strings by a model that is guessing at the shape, so this is the one
 * place that decides what an incoming date MEANS — and it is deliberately strict, because every way
 * of being lenient here is a way of being wrong quietly.
 *
 * THE TRAP IS THE NAKED TIME. `Date.parse('2026-09-03')` is UTC midnight by spec, while
 * `new Date('2026-09-03T09:00')` is 9am LOCAL — the same function, two different zones, decided by
 * whether a time is present. Left alone, a date-only input lands an asset on the previous evening
 * for anyone west of Greenwich, and nothing downstream can tell that from a deliberate choice.
 *
 * So: a string that CARRIES an offset (Z or ±HH:MM) is an absolute moment and is taken at its word.
 * A string that does not is a local wall-clock time, resolved in the zone of whatever is running
 * this — which is the browser tab executing the command, not the Desktop client that sent it. That
 * is a real limitation rather than a design: there is no workspace timezone in this app to resolve
 * against, so callers are told which zone was used instead of being left to assume their own.
 *
 * Everything else throws. An unreadable date must not fall back to "now" — an asset silently
 * scheduled for the moment it was created looks exactly like one somebody scheduled on purpose.
 */

/** A day JS would roll over rather than reject: Feb 31 becomes Mar 3, month 13 becomes next January. */
function realDay(y: number, m: number, d: number): boolean {
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

const WITH_OFFSET = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/
const NAKED_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

const unreadable = (field: string, raw: string): Error =>
  new Error(
    `${field} is not a date I can read: ${JSON.stringify(raw)}. Pass ISO 8601 — ` +
      `"2026-09-03T09:00:00Z" (absolute), "2026-09-03T09:00" or "2026-09-03" (local to the tab running Breadcrumbs), ` +
      `or null to clear it.`,
  )

/**
 * Normalize an incoming date to a stored ISO string.
 *
 * Returns `null` for an explicit `null` — the caller's way of saying "no date", which is a write,
 * not an omission. Throws on anything unreadable. `undefined` never reaches here: not passing a
 * field and clearing it are different acts, and the caller distinguishes them before calling.
 */
export function normalizeScheduleInput(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw unreadable(field, String(value))
  const raw = value.trim()
  if (!raw) throw unreadable(field, value)

  if (WITH_OFFSET.test(raw)) {
    const t = Date.parse(raw)
    if (!Number.isFinite(t)) throw unreadable(field, value)
    return new Date(t).toISOString()
  }

  const naked = NAKED_TIME.exec(raw)
  if (naked) {
    const [y, m, d, hh, mm] = naked.slice(1, 6).map(Number)
    // An ABSENT seconds group is `undefined`, and Number(undefined) is NaN — not a value `?? 0`
    // catches. Left alone it survives the range checks (every comparison against NaN is false) and
    // only surfaces as "Invalid time value" from toISOString, one layer further on.
    const ss = naked[6] === undefined ? 0 : Number(naked[6])
    if (!realDay(y, m, d) || hh > 23 || mm > 59 || ss > 59) throw unreadable(field, value)
    return new Date(y, m - 1, d, hh, mm, ss, 0).toISOString()
  }

  const dayOnly = DATE_ONLY.exec(raw)
  if (dayOnly) {
    const [, y, m, d] = dayOnly.map(Number)
    if (!realDay(y, m, d)) throw unreadable(field, value)
    // Local midnight, NOT Date.parse's UTC midnight — the whole reason this function exists.
    return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString()
  }

  throw unreadable(field, value)
}

/** The zone a naked time was resolved in, so a reply can say so rather than let a caller assume. */
export const executorTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone
