import {
  computeAudienceCoverage,
  computeChannelConnection,
  computeLibrarySignals,
  computeMessageCoverage,
  computeMessagingPatterns,
  reconciliationStat,
  signalRecommendations,
  type RecKind,
} from '../domain/contentSignals'
import type { TrafficRow } from '../domain/types'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { BrandPicker } from './BrandPicker'

/**
 * Priorities — the calm front door. Instead of a dozen dense reads, the top five changes to
 * make right now, ranked by impact, each a plain-language action with the detail one click
 * away. Fed by the same recommendation engine as Signals (coverage / connection / audience /
 * what converts) plus the single biggest answer-engine opportunity. Hard cap at five.
 *
 * The compute + list are exported so the Overview can lead with the same five.
 */

const isLibraryItem = (r: TrafficRow): boolean =>
  r.status === 'posted' || !!r.postedAt || (!!r.sourceUrl && r.source !== 'generated')

export type PKind = RecKind
export interface Priority {
  kind: PKind
  text: string
  goto: 'data'
}
const KIND_LABEL: Record<PKind, string> = { fix: 'Fix', amplify: 'Amplify', test: 'Test', setup: 'Set up' }
// Impact order: leaks first, then amplify / test / setup.
const KIND_RANK: Record<PKind, number> = { fix: 0, amplify: 2, test: 3, setup: 4 }

interface BrandSys {
  rtbs?: { label: string }[]
  ctas?: { label: string }[]
  audiences?: { id?: string; name?: string; label?: string; aliases?: string[] }[]
}

/** The top five priorities for a brand, ranked by impact. Pure so both the Priorities page
 *  and the Overview can render the same list. `allRows` = the brand's canvas rows. */
export function computePriorities(_brand: string, allRows: TrafficRow[], sys: BrandSys | undefined): Priority[] {
  const rows = allRows.filter(isLibraryItem)
  if (!rows.length) return []
  const s = computeLibrarySignals(rows)
  const mp = computeMessagingPatterns(rows)
  const cov = computeMessageCoverage(rows, sys?.rtbs ?? [], sys?.ctas ?? [])
  const recon = reconciliationStat(allRows)
  const conn = computeChannelConnection(rows)
  const aud = computeAudienceCoverage(allRows, sys?.audiences ?? [])
  const recs = signalRecommendations({
    coverage: cov,
    connection: conn,
    audience: aud,
    reconcile: recon,
    signals: s,
    patterns: mp,
    takeaways: s.takeaways,
  })
  const list: Priority[] = recs.map((r) => ({ kind: r.kind, text: r.text, goto: 'data' as const }))
  return [...list].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]).slice(0, 5)
}

/** The ranked top-5 list. `onGoto` navigates to the relevant read. */
export function PriorityList({ priorities, onGoto }: { priorities: Priority[]; onGoto: (goto: 'data') => void }) {
  return (
    <ol className="prio-list">
      {priorities.map((p, i) => (
        <li className={`prio-item ${p.kind}`} key={i}>
          <span className="prio-n">{i + 1}</span>
          <span className={`prio-tag ${p.kind}`}>{KIND_LABEL[p.kind]}</span>
          <span className="prio-text">{p.text}</span>
          <button className="prio-go" onClick={() => onGoto(p.goto)}>
            Fix →
          </button>
        </li>
      ))}
    </ol>
  )
}

export function PrioritiesView({ scopeClient }: { scopeClient?: string }) {
  const { canvases } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const brandSystems = useTrafficStore((s) => s.brandSystems)
  const setLibraryMode = useTrafficStore((s) => s.setLibraryMode)

  const brand = scopeClient ?? (clientFilter !== 'all' ? clientFilter : null)
  const allRows = brand ? canvases.filter((c) => c.client === brand).flatMap((c) => c.rows) : []
  const priorities = brand ? computePriorities(brand, allRows, brandSystems[brand]) : []

  if (!brand) {
    return (
      <div className="mtx">
        <BrandPicker verb="see its priorities" />
      </div>
    )
  }

  return (
    <div className="mtx prio">
      <header className="mtx-head">
        <h2>{brand} · Priorities</h2>
        <span className="mtx-sub">The five changes to make now, ranked by impact. The detail is one click away.</span>
      </header>

      {priorities.length === 0 ? (
        <div className="mtx-empty">
          Nothing high-impact to flag right now. Ingest more content, or check back after the next campaign ships.
        </div>
      ) : (
        <PriorityList priorities={priorities} onGoto={setLibraryMode} />
      )}

      <div className="mtx-foot">
        Ranked by what moves the needle: fix the leaks first, then capture the biggest unanswered search, then amplify
        what already converts. Everything here is drawn from the full reads under Library, condensed to what matters.
      </div>
    </div>
  )
}
