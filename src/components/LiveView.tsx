import { clientForCampaign } from '../domain/clients'
import { messagingAllText } from '../domain/messaging'
import type { TrafficRow } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { CanvasView } from './CanvasView'
import { SheetGrid } from './SheetGrid'
import { CalendarView } from './CalendarView'
import { ViewToggle } from './ViewToggle'

/**
 * Layer 2 — Live: everything in-market right now (posted or scheduled), whether
 * or not it belongs to a campaign. The brand's true current footprint, reviewed
 * with the same workspace the campaigns get: Connection (the connected map),
 * Grid (the workbench), and Calendar (the timing). Scoped brand-wide and
 * live-only via `liveScope`, so the views see the whole live presence at once. A
 * gap bar above the views surfaces what leaks (no CTA) or drifts (off-brand vs.
 * the brand's confirmed guide).
 */
const isLive = (r: TrafficRow) => r.status === 'posted' || r.status === 'scheduled'

export function LiveView() {
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const rows = useTrafficStore((s) => s.rows)
  const view = useTrafficStore((s) => s.view)
  const brandGuides = useTrafficStore((s) => s.brandGuides)

  const guide = brandGuides[clientFilter]
  const bansEmDash = !!(guide?.confirmed && guide.guide.donts?.some((d) => /em.?dash/i.test(d)))

  const live = rows.filter((r) => clientForCampaign(r.campaign) === clientFilter && isLive(r))
  let noCta = 0
  let offBrand = 0
  for (const r of live) {
    const m = (r.messaging ?? {}) as Record<string, string | undefined>
    if (!(m.cta || m.link)) noCta++
    if (bansEmDash && messagingAllText(r).includes('—')) offBrand++
  }

  const Stage =
    view === 'calendar' ? (
      <CalendarView liveScope />
    ) : view === 'grid' ? (
      <SheetGrid liveScope />
    ) : (
      <CanvasView liveScope />
    )

  return (
    <div className="live-ws">
      <div className="live-gaps-bar">
        <span className="live-gaps-label">{live.length} live in-market</span>
        {noCta > 0 && <span className="live-gap-stat k-no-cta">{noCta} no CTA</span>}
        {offBrand > 0 && <span className="live-gap-stat k-off-brand">{offBrand} off-brand</span>}
        {noCta === 0 && offBrand === 0 && live.length > 0 && <span className="gap-ok">✓ no gaps</span>}
        <span className="live-gaps-spacer" />
        <span className="live-gaps-hint">campaign or not — the whole footprint</span>
      </div>
      {Stage}
      <ViewToggle />
    </div>
  )
}
