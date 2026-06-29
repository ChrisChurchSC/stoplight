import { mockAttio } from '../adapters/attio/mockAttio'
import { applyBreakStatus, breakScopeKey, resolveBreaks } from '../domain/breaks'
import { money } from '../domain/budget'
import { clientForCampaign } from '../domain/clients'
import {
  STATUS_LABEL,
  breaksForCampaign,
  campaignAttention,
  campaignMomentum,
  campaignStats,
  deriveCampaignStatus,
  type CampaignAttention,
  type CampaignMomentum,
  type CampaignStats,
  type CampaignStatus,
} from '../domain/lifecycle'
import type { TrafficRow } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { CampaignThumb } from './CampaignThumb'

/**
 * Level 1 of the brand: the brand's campaigns, grouped by where each is in its
 * life (active, in review, planning, completed). The header carries a one-line
 * count of every state; only states that actually have campaigns render a group,
 * so empty states add no clutter. Clicking a card drops into Level 2 (the
 * campaign canvas). See domain/lifecycle.ts for how state + triage flags derive.
 */

interface Card {
  name: string
  status: CampaignStatus
  rows: TrafficRow[]
  stats: CampaignStats
  revenue: number
  roas: number | null
  attention: CampaignAttention
  momentum: CampaignMomentum
  topProof: string | null
}

/** Highest-revenue asset in the campaign — the "what worked" line for Completed. */
function topProofFor(assetNames: Set<string>): string | null {
  let best: { name: string; rev: number } | null = null
  for (const n of assetNames) {
    const rev = mockAttio.attributionForAsset(n).wonRevenue
    if (rev > 0 && (!best || rev > best.rev)) best = { name: n, rev }
  }
  return best?.name ?? null
}

export function CampaignStatesHome() {
  const rows = useTrafficStore((s) => s.rows)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const claudeBreaks = useTrafficStore((s) => s.claudeBreaks)
  const claudeBreaksScope = useTrafficStore((s) => s.claudeBreaksScope)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)
  const setView = useTrafficStore((s) => s.setView)
  const setCampaignStatus = useTrafficStore((s) => s.setCampaignStatus)
  const setIcpOpen = useTrafficStore((s) => s.setIcpOpen)
  const openCampaignWizard = useTrafficStore((s) => s.openCampaignWizard)

  const brandRows = rows.filter((r) => clientForCampaign(r.campaign) === clientFilter)
  const forBrand = campaignList.filter((c) => c.client === clientFilter)
  const meta = new Map(forBrand.map((c) => [c.name, c] as const))
  const names = [
    ...new Set([
      ...brandRows.map((r) => (r.campaign ?? '').trim()).filter(Boolean),
      ...forBrand.map((c) => c.name),
    ]),
  ]

  // Resolve breaks once across the brand (heuristic unless Claude last ran this
  // exact scope), then attribute each to its campaign.
  const allBreaks = applyBreakStatus(
    resolveBreaks(brandRows, claudeBreaks, claudeBreaksScope, breakScopeKey(clientFilter, 'all')),
    breakStatus,
  )

  const cards: Card[] = names.map((name) => {
    const cRows = brandRows.filter((r) => (r.campaign ?? '').trim() === name)
    const assetNames = new Set(cRows.map((r) => r.assetName))
    let revenue = 0
    for (const n of assetNames) revenue += mockAttio.attributionForAsset(n).wonRevenue
    const spend = cRows.reduce((a, r) => a + (r.spend?.toDate ?? 0), 0)
    const roas = spend > 0 ? revenue / spend : null
    const breaks = breaksForCampaign(name, assetNames, allBreaks)
    return {
      name,
      status: deriveCampaignStatus(meta.get(name), cRows),
      rows: cRows,
      stats: campaignStats(cRows),
      revenue,
      roas,
      attention: campaignAttention({ rows: cRows, breaks, roas, spend }),
      momentum: campaignMomentum(cRows),
      topProof: topProofFor(assetNames),
    }
  })

  const inState = (s: CampaignStatus) => cards.filter((c) => c.status === s)
  const active = inState('active').sort((a, b) => b.attention.count - a.attention.count || b.revenue - a.revenue)
  const planning = inState('planning').sort((a, b) => b.momentum.step - a.momentum.step)
  const inReview = inState('in-review')
  const completed = inState('completed').sort((a, b) => b.revenue - a.revenue)

  const open = (name: string) => {
    setCampaignFilter(name)
    setView('canvas')
  }
  const needsAttention = active.filter((c) => c.attention.count > 0).length

  // Only states that actually hold campaigns render a group, in life-cycle order.
  const groups: { status: CampaignStatus; cards: Card[]; render: (c: Card) => React.ReactNode }[] = [
    {
      status: 'active',
      cards: active,
      render: (c) => <ActiveCard key={c.name} card={c} onOpen={open} />,
    },
    {
      status: 'in-review',
      cards: inReview,
      render: (c) => (
        <ReviewCard
          key={c.name}
          card={c}
          onOpen={open}
          onGate={() => {
            open(c.name)
            setIcpOpen(true)
          }}
        />
      ),
    },
    {
      status: 'planning',
      cards: planning,
      render: (c) => (
        <PlanningCard key={c.name} card={c} onOpen={open} onReview={() => setCampaignStatus(c.name, 'in-review')} />
      ),
    },
    {
      status: 'completed',
      cards: completed,
      render: (c) => (
        <CompletedCard key={c.name} card={c} onOpen={open} onReopen={() => setCampaignStatus(c.name, 'active')} />
      ),
    },
  ]

  return (
    <div className="csh">
      <header className="csh-head">
        <div>
          <h1 className="csh-title">{clientFilter}</h1>
          <p className="csh-sub">
            {needsAttention > 0 ? `${needsAttention} need${needsAttention === 1 ? 's' : ''} you · ` : ''}
            {active.length} active · {inReview.length} in review · {planning.length} planning
            {completed.length > 0 ? ` · ${completed.length} completed` : ''}
          </p>
        </div>
        <button className="csh-new" onClick={() => openCampaignWizard(clientFilter)}>
          ＋ New campaign
        </button>
      </header>

      {cards.length === 0 ? (
        <div className="csh-empty-all">
          <p>No campaigns yet.</p>
          <button className="csh-link" onClick={() => openCampaignWizard(clientFilter)}>
            ＋ New campaign
          </button>
        </div>
      ) : (
        <div className="csh-groups">
          {groups.map((g) =>
            g.cards.length === 0 ? null : (
              <section key={g.status} className={`csh-group s-${g.status}`}>
                <div className="csh-group-head">
                  {STATUS_LABEL[g.status]}
                  <span className="csh-count">{g.cards.length}</span>
                </div>
                <div className="csh-group-cards">{g.cards.map(g.render)}</div>
              </section>
            ),
          )}
        </div>
      )}
    </div>
  )
}

/** Shared card shell: title row + a click target that opens Level 2. */
function CardShell(props: { card: Card; onOpen: (n: string) => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const { card, onOpen, children, footer } = props
  const s = card.stats
  return (
    <article className={`camp-card s-${card.status}`} onClick={() => onOpen(card.name)} role="button" tabIndex={0}>
      <div className="camp-card-thumb">
        <CampaignThumb rows={card.rows} />
      </div>
      <div className="camp-card-top">
        <span className="camp-card-name">{card.name}</span>
        <span className={`pill s-${card.status}`}>{STATUS_LABEL[card.status]}</span>
      </div>
      <div className="camp-card-stats">
        {[
          card.revenue > 0 ? money(card.revenue) : null,
          `${s.assets} asset${s.assets === 1 ? '' : 's'}`,
          `${s.posted} posted`,
          s.scheduled > 0 ? `${s.scheduled} scheduled` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>
      {children}
      {footer && <div className="camp-card-foot">{footer}</div>}
    </article>
  )
}

/** Stop a footer action from also opening the card. */
const act = (fn: () => void) => (e: React.MouseEvent) => {
  e.stopPropagation()
  fn()
}

function ActiveCard({ card, onOpen }: { card: Card; onOpen: (n: string) => void }) {
  return (
    <CardShell card={card} onOpen={onOpen}>
      {card.attention.count > 0 ? (
        <div className="camp-flags">
          {card.attention.flags.map((f) => (
            <span key={f.kind} className={`flag k-${f.kind} sev-${f.severity}`}>{f.label}</span>
          ))}
        </div>
      ) : (
        <div className="camp-ok">Healthy, no flags</div>
      )}
    </CardShell>
  )
}

function PlanningCard({ card, onOpen, onReview }: { card: Card; onOpen: (n: string) => void; onReview: () => void }) {
  const m = card.momentum
  return (
    <CardShell
      card={card}
      onOpen={onOpen}
      footer={<button className="camp-act" onClick={act(onReview)} disabled={card.stats.rows === 0}>Send to review →</button>}
    >
      <div className="camp-momentum">
        {m.steps.map((st) => (
          <span key={st.label} className={`beat${st.done ? ' done' : ''}`}>{st.label}</span>
        ))}
      </div>
    </CardShell>
  )
}

function ReviewCard({ card, onOpen, onGate }: { card: Card; onOpen: (n: string) => void; onGate: () => void }) {
  return (
    <CardShell card={card} onOpen={onOpen} footer={<button className="camp-act primary" onClick={act(onGate)}>Open the gate →</button>}>
      <div className="camp-review">{card.stats.approved} ready · {card.stats.draft} still drafting</div>
    </CardShell>
  )
}

function CompletedCard({ card, onOpen, onReopen }: { card: Card; onOpen: (n: string) => void; onReopen: () => void }) {
  return (
    <CardShell card={card} onOpen={onOpen} footer={<button className="camp-act" onClick={act(onReopen)}>Reopen</button>}>
      <div className="camp-proof">
        {card.topProof ? <>What worked: <strong>{card.topProof}</strong></> : 'No attributed revenue yet'}
      </div>
    </CardShell>
  )
}
