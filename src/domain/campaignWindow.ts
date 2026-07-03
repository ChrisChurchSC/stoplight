const MONTHS3: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

/**
 * A campaign's flight window as start/end ms, preferring the window it encodes in its
 * own name (authoritative even before assets are dated), e.g. "(Sept 14-20, 2026)" or
 * "(Sept 28-Oct 4, 2026)". Falls back to the min/max scheduled asset date, else null.
 * Used for pacing (upcoming / live / ended) in the cockpit.
 */
export function campaignFlight(
  name: string,
  rows: { scheduledAt?: string }[],
): { start: number; end: number } | null {
  const yearM = name.match(/(20\d{2})/)
  const year = yearM ? +yearM[1] : new Date().getFullYear()

  // Cross-month: (Sept 28-Oct 4, 2026)
  const cross = name.match(/\(\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[-–]\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})/)
  if (cross) {
    const m1 = MONTHS3[cross[1].slice(0, 3).toLowerCase()]
    const m2 = MONTHS3[cross[3].slice(0, 3).toLowerCase()]
    if (m1 != null && m2 != null) {
      // End month earlier than start month means it rolls into the next year.
      const endYear = m2 < m1 ? year + 1 : year
      return { start: +new Date(year, m1, +cross[2]), end: +new Date(endYear, m2, +cross[4]) }
    }
  }
  // Same-month: (Sept 14-20, 2026)
  const same = name.match(/\(\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[-–]\s*(\d{1,2})/)
  if (same) {
    const mi = MONTHS3[same[1].slice(0, 3).toLowerCase()]
    if (mi != null) return { start: +new Date(year, mi, +same[2]), end: +new Date(year, mi, +same[3]) }
  }
  // Fallback: the assets' scheduled span.
  const times = rows.map((r) => (r.scheduledAt ? +new Date(r.scheduledAt) : NaN)).filter((t) => !Number.isNaN(t))
  if (!times.length) return null
  return { start: Math.min(...times), end: Math.max(...times) }
}
