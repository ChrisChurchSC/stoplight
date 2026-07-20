/**
 * A Campaign Flight — one scheduled RUN of a campaign over a window. A campaign (the durable
 * strategy) can have several flights over time (a launch flight, a sustain flight, a seasonal
 * re-run), each holding its own assets. This is the tier between Campaign and Asset:
 *
 *   Umbrella campaign  ->  Campaign  ->  Flight  ->  Asset (TrafficRow.flightId)
 *
 * Persisted per-app in localStorage `stoplight.flights.v1`. `campaign` matches the campaign NAME
 * (TrafficRow.campaign / Campaign.name), the same string key the rest of the app groups by.
 */
export interface Flight {
  id: string
  /** The campaign this flight belongs to (campaign name). */
  campaign: string
  /** Human label, e.g. "Flight 1", "Launch", "Q3 Sustain". */
  name: string
  /** Flight start (ISO date). */
  startAt: string
  /** Flight length in weeks. */
  durationWeeks: number
}

let flightSeq = 0
export function freshFlightId(): string {
  flightSeq += 1
  return `flt_${Date.now().toString(36)}_${flightSeq}`
}

export function newFlight(patch: Partial<Flight> & { campaign: string }): Flight {
  return {
    id: patch.id ?? freshFlightId(),
    campaign: patch.campaign,
    name: patch.name ?? 'Flight 1',
    startAt: patch.startAt ?? new Date().toISOString(),
    durationWeeks: patch.durationWeeks && patch.durationWeeks > 0 ? patch.durationWeeks : 4,
  }
}

/**
 * The flight an asset belongs to: its explicit `flightId` when set, else the campaign's first flight.
 * The fallback is what lets us skip stamping every asset during migration, while a campaign has one
 * flight, all its (unstamped) assets resolve to it. flightId only matters once a campaign is split.
 */
export function flightForRow(row: { campaign?: string; flightId?: string }, flights: Flight[]): Flight | undefined {
  if (row.flightId) {
    const byId = flights.find((f) => f.id === row.flightId)
    if (byId) return byId
  }
  const c = (row.campaign ?? '').trim()
  return c ? flights.find((f) => f.campaign === c) : undefined
}
