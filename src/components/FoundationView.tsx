import type { AudienceType } from '../domain/audiences'
import { clientForCampaign } from '../domain/clients'
import { rtbsForCampaign, type Rtb } from '../domain/rtb'
import { brandPresence } from '../domain/presence'
import { foundationGaps } from '../domain/foundationGaps'
import { brandPerformance } from '../domain/performance'
import { KIND_ORDER, channelsByKind } from '../domain/channels'
import type { ChannelId } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { CompanyProfile } from './CompanyProfile'
import { ProofLibrary } from './ProofLibrary'

/**
 * Layer 1 — the Foundation: the brand's standing model of who it talks to and
 * how. Audiences (with their messaging needs), the brand's proof library (RTBs),
 * and descriptors (voice/tone) — all of which exist BEFORE any campaign, outlive
 * them, and that every campaign draws from. Populated by ingestion, confirmed by
 * the human. These objects are built to accumulate learning over time (the "map
 * that remembers"); the learning itself accrues post-MVP as campaigns complete.
 *
 * Audiences are already first-class objects (clientAudiences / AudienceType);
 * this view surfaces them as the standing layer instead of burying them in a
 * drawer. RTBs are elevated here from per-campaign fields into one brand library.
 */
/** The conversion outcomes an audience can be pointed at. */
const OUTCOMES = [
  'Donate',
  'Subscribe',
  'Invest',
  'Listen to the podcast',
  'Attend a screening',
  'Volunteer',
  'Partner',
  'Sign up',
  'Share',
  'Buy',
]

export function FoundationView() {
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const rows = useTrafficStore((s) => s.rows)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const brandGuides = useTrafficStore((s) => s.brandGuides)
  const setIcpOpen = useTrafficStore((s) => s.setIcpOpen)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const openChannelIngest = useTrafficStore((s) => s.openChannelIngest)
  const openSanityIngest = useTrafficStore((s) => s.openSanityIngest)
  const openResendIngest = useTrafficStore((s) => s.openResendIngest)
  const openGoogleAdsIngest = useTrafficStore((s) => s.openGoogleAdsIngest)

  const brandRows = rows.filter((r) => clientForCampaign(r.campaign) === clientFilter)
  const campaignNames = [
    ...new Set([
      ...campaignList.filter((c) => c.client === clientFilter).map((c) => c.name),
      ...brandRows.map((r) => (r.campaign ?? '').trim()).filter(Boolean),
    ]),
  ]

  // The brand's proof library: every RTB across its campaigns, deduped by label.
  const pool: Rtb[] = []
  const seen = new Set<string>()
  for (const name of campaignNames) {
    for (const rtb of rtbsForCampaign(name)) {
      const key = rtb.label.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        pool.push(rtb)
      }
    }
  }
  const rtbById = new Map(pool.map((r) => [r.id, r] as const))

  const audiences: AudienceType[] = clientAudiences[clientFilter] ?? []
  // Fallback so the Foundation isn't empty: the audiences the brand is actually
  // addressing, derived from its live rows (a prompt to formalize them).
  const derived = audiences.length
    ? []
    : [...new Set(brandRows.map((r) => (r.audience ?? '').trim()).filter(Boolean))]

  const confirmed = brandGuides[clientFilter]?.confirmed

  const edit = () => setIcpOpen(true)

  // The outcome we want each audience to take — drives messaging, CTAs, and the
  // objective when a campaign is built from this audience.
  const setOutcome = (id: string, outcome: string) =>
    setClientAudiences(
      clientFilter,
      audiences.map((a) => (a.id === id ? { ...a, outcome } : a)),
    )

  // How the brand actually shows up: channels, format, cadence, CTAs, and where
  // the channel mix leaves the customer journey uncovered.
  const presence = brandPresence(brandRows)

  // Every channel is connectable from here; channels already carrying live content
  // are shown as active below, the rest are offered to connect, grouped by kind.
  const activeChannelIds = new Set(presence.channels.map((c) => c.channel))
  // Open the right connect flow for a channel: email -> Resend, paid Google -> the
  // Ads API, everything else -> the per-channel ingest (gather/crawl + vision).
  const ingest = (id: ChannelId) => {
    if (id === 'email') return openResendIngest(clientFilter)
    if (id === 'google-search' || id === 'google-demand' || id === 'pmax') return openGoogleAdsIngest(clientFilter)
    return openChannelIngest(clientFilter, id)
  }

  // One consolidated read of where the foundation + messaging is thin.
  const gaps = foundationGaps({
    rows: brandRows,
    audiences,
    pool,
    journey: presence.journey,
    voiceConfirmed: !!confirmed,
  })

  // What's working: real engagement rolled up by proof point, audience, format —
  // the learning that feeds the next campaign.
  const perf = brandPerformance(brandRows)
  const fmtEng = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)
  const perfByRtb = new Map(perf.byRtb.map((p) => [p.key, p]))

  return (
    <div className="fnd">
      <header className="fnd-head">
        <div>
          <h1 className="csh-title">Foundation</h1>
          <p className="csh-sub">
            Who {clientFilter} talks to and how — the standing model every campaign is built from.
          </p>
        </div>
      </header>

      {/* Messaging gaps — one consolidated, worst-first read of what's thin. */}
      <section className="fnd-gaps">
        <div className="fnd-gaps-head">
          <h2 className="fnd-panel-title">Messaging gaps</h2>
          <span className="fnd-count">{gaps.length ? `${gaps.length} to fix` : 'clear'}</span>
        </div>
        {gaps.length === 0 ? (
          <p className="fnd-gaps-ok">✓ Channels, CTAs, proof, audiences, and outcomes all connect.</p>
        ) : (
          <ul className="fnd-gaps-list">
            {gaps.map((g) => (
              <li key={g.key} className={`fnd-gap sev-${g.severity}`}>
                <span className="fnd-gap-dot" />
                <span className="fnd-gap-body">
                  <span className="fnd-gap-label">{g.label}</span>
                  <span className="fnd-gap-detail">{g.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Company overview, then proof + CTAs in their own panel. */}
      <CompanyProfile />

      <ProofLibrary
        proof={pool}
        perfByRtb={perfByRtb}
        fmtEng={fmtEng}
        ctas={presence.ctas}
        deadEnds={presence.deadEnds}
      />

      {/* How the brand shows up: channels, cadence, and CTAs on one side; the
          journey coverage they add up to on the other — one panel. */}
      <section className="fnd-panel fnd-presence">
        <div className="fnd-panel-head">
          <h2 className="fnd-panel-title">Channels &amp; journey</h2>
          <span className="fnd-count">
            {presence.channels.length} channel{presence.channels.length === 1 ? '' : 's'} ·{' '}
            {presence.journey.filter((s) => s.covered).length}/4 stages
          </span>
        </div>

        {/* Connect any channel — every channel in the model, grouped by kind. */}
        {KIND_ORDER.map(({ kind, label }) => {
          const chans = channelsByKind(kind).filter((c) => !activeChannelIds.has(c.id))
          if (!chans.length) return null
          return (
            <div key={kind} className="fnd-linkrow">
              <span className="fnd-sub-label">{label} channels</span>
              <div className="fnd-linkchips">
                {chans.map((c) => (
                  <button
                    key={c.id}
                    className="fnd-linkchip"
                    onClick={() => ingest(c.id)}
                    title={`Connect ${c.label}`}
                  >
                    <ChannelIcon channel={c.id} size={12} />
                    {c.label}
                    <span className="fnd-linkchip-plus">+</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}

        <div className="fnd-linkrow">
          <span className="fnd-sub-label">Content source</span>
          <div className="fnd-linkchips">
            <button
              className="fnd-linkchip"
              onClick={() => openSanityIngest(clientFilter)}
              title="Ingest the brand's copy from their Sanity CMS"
            >
              <span className="fnd-cms-glyph">◆</span>
              Sanity CMS
              <span className="fnd-linkchip-plus">
                {clientProfiles[clientFilter]?.sanity?.projectId ? '↻' : '+'}
              </span>
            </button>
          </div>
        </div>
        {presence.total === 0 ? (
          <p className="fnd-empty">No live content yet — channels, cadence, and journey coverage fill in from ingestion.</p>
        ) : (
          <div className="fnd-presence-body">
            <div className="fnd-presence-col">
              <div className="fnd-sub-label">Active channels</div>
              <div className="fnd-chans">
                {presence.channels.map((c) => (
                  <button
                    key={c.channel}
                    className="fnd-chan fnd-chan-btn"
                    onClick={() => ingest(c.channel)}
                    title={`Link & re-ingest ${c.label} (incl. copy in the art)`}
                  >
                    <span className="fnd-chan-dot" style={{ background: c.color }} />
                    {c.label} <span className="fnd-chan-n">{c.count}</span>
                    <span className="fnd-chan-go">→</span>
                  </button>
                ))}
              </div>
              <div className="fnd-stats">
                {presence.topFormat && (
                  <div className="fnd-stat">
                    <span className="fnd-stat-k">Most used</span>
                    {presence.topFormat.label} ({presence.topFormat.count})
                  </div>
                )}
                {presence.cadencePerMonth > 0 && (
                  <div className="fnd-stat">
                    <span className="fnd-stat-k">Cadence</span>~{presence.cadencePerMonth}/mo · busiest {presence.busiestDay}
                  </div>
                )}
              </div>
            </div>

            <div className="fnd-presence-col">
              <div className="fnd-sub-label">Journey coverage</div>
              <div className="fnd-journey">
                {presence.journey.map((s) => (
                  <div key={s.stage} className={`fnd-stage ${s.covered ? 'covered' : 'gap'}`}>
                    <div className="fnd-stage-top">
                      <span className="fnd-stage-label">{s.label}</span>
                      {s.covered ? (
                        <span className="fnd-stage-ok">✓ covered</span>
                      ) : (
                        <span className="fnd-stage-gap">gap</span>
                      )}
                    </div>
                    {s.covered ? (
                      <div className="fnd-stage-ch">{s.channels.join(' · ')}</div>
                    ) : (
                      <div className="fnd-stage-suggest">
                        {s.hint}. Add {s.suggest.join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Audiences — the spine. Each carries its messaging needs + emphasized proof. */}
      <section className="fnd-aud-section">
        <div className="fnd-panel-head">
          <h2 className="fnd-panel-title">Audiences</h2>
          <span className="fnd-count">
            {audiences.length || derived.length} segment{(audiences.length || derived.length) === 1 ? '' : 's'}
          </span>
        </div>

        {audiences.length ? (
          <div className="fnd-aud-grid">
            {audiences.map((a) => {
              const proof = a.rtbEmphasis.map((id) => rtbById.get(id)).filter(Boolean) as Rtb[]
              const needs = [
                ...a.pains.map((p) => ({ k: 'pain', t: p })),
                ...(a.messageAngle ? [{ k: 'angle', t: a.messageAngle }] : []),
                ...(a.objections ? [{ k: 'obj', t: a.objections }] : []),
              ]
              return (
                <article key={a.id} className="fnd-aud" onClick={edit} role="button" tabIndex={0}>
                  <div className="fnd-aud-top">
                    <span className="fnd-aud-name">{a.name || 'Unnamed audience'}</span>
                    {a.role && <span className="fnd-aud-role">{a.role}</span>}
                  </div>
                  <div className="fnd-aud-outcome" onClick={(e) => e.stopPropagation()}>
                    <span className={`fnd-outcome-k${a.outcome ? ' set' : ''}`}>🎯 Outcome</span>
                    <select
                      className="fnd-outcome-sel"
                      value={a.outcome ?? ''}
                      onChange={(e) => setOutcome(a.id, e.target.value)}
                    >
                      <option value="">Set an outcome…</option>
                      {OUTCOMES.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  {needs.length ? (
                    <div className="fnd-needs">
                      <div className="fnd-sub-label">Messaging needs</div>
                      {needs.slice(0, 4).map((n, i) => (
                        <span key={i} className={`fnd-need k-${n.k}`}>{n.t}</span>
                      ))}
                    </div>
                  ) : null}
                  {proof.length ? (
                    <div className="fnd-needs">
                      <div className="fnd-sub-label">Leans on proof</div>
                      {proof.map((p) => (
                        <span key={p.id} className="fnd-need k-proof">{p.label}</span>
                      ))}
                    </div>
                  ) : null}
                  <div className="fnd-learn">⟲ Learning accrues as this audience's campaigns complete</div>
                </article>
              )
            })}
          </div>
        ) : derived.length ? (
          <div className="fnd-derived">
            <p className="fnd-empty">
              {clientFilter} is addressing these audiences in-market — formalize them into the Foundation:
            </p>
            <div className="fnd-derived-chips">
              {derived.map((d) => (
                <span key={d} className="fnd-need k-pain">{d}</span>
              ))}
            </div>
            <button className="csh-link" onClick={edit}>
              Define audiences →
            </button>
          </div>
        ) : (
          <p className="fnd-empty">No audiences yet — ingestion proposes them from the brand's site.</p>
        )}
      </section>
    </div>
  )
}
