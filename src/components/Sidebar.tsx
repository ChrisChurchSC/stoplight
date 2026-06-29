import { useState } from 'react'
import { CHANNEL_LIST, KIND_ORDER, channelsByKind } from '../domain/channels'
import { assetCta } from '../domain/messaging'
import { assetRtbIds, rtbsForCampaign } from '../domain/rtb'
import { channelTracking } from '../domain/tracking'
import { TIME_RANGES } from '../domain/timeRange'
import { rowsToCsv, downloadCsv } from '../lib/csv'
import { CTA_NONE, passesCardFilter, rowInScope, type CardFilter } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

/**
 * Campaign-page sidebar: the channel filter (with per-channel tracking + counts)
 * plus sheet export. The brand-context card (voice, readiness, ICP, audiences)
 * that used to sit on top lives in the Foundation now, so it's no longer
 * duplicated here.
 */
export function Sidebar() {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const setFilter = useTrafficStore((s) => s.setFilter)
  const proofFilter = useTrafficStore((s) => s.proofFilter)
  const setProofFilter = useTrafficStore((s) => s.setProofFilter)
  const ctaFilter = useTrafficStore((s) => s.ctaFilter)
  const setCtaFilter = useTrafficStore((s) => s.setCtaFilter)
  const audienceFilter = useTrafficStore((s) => s.audienceFilter)
  const setAudienceFilter = useTrafficStore((s) => s.setAudienceFilter)
  const cardFilter = useTrafficStore((s) => s.cardFilter)
  const setCardFilter = useTrafficStore((s) => s.setCardFilter)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const timeRange = useTrafficStore((s) => s.timeRange)
  const setTimeRange = useTrafficStore((s) => s.setTimeRange)
  const query = useTrafficStore((s) => s.query)
  const setQuery = useTrafficStore((s) => s.setQuery)
  const clearSheet = useTrafficStore((s) => s.clearSheet)
  const openTracking = useTrafficStore((s) => s.openTracking)
  const setPage = useTrafficStore((s) => s.setPage)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const perfMode = useTrafficStore((s) => s.perfMode)
  const togglePerfMode = useTrafficStore((s) => s.togglePerfMode)
  const view = useTrafficStore((s) => s.view)
  const setView = useTrafficStore((s) => s.setView)
  // The overlay paints on the Connection canvas, so turning it on snaps there.
  const onPerformance = () => {
    if (!perfMode && view !== 'flow' && view !== 'canvas') setView('flow')
    togglePerfMode()
  }
  // The HyperFocus wordmark doubles as Home (back to the clients overview), now
  // that the global rail is gone.
  const goHome = () => {
    setPage('clients')
    setClientFilter('all')
  }

  // Collapsible sidebar sections (channel kinds + Proof points + CTAs). Default
  // expanded; keyed by section id.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  const sectionHead = (id: string, label: string) => (
    <button
      className={`nav-section nav-section-toggle${collapsed.has(id) ? ' collapsed' : ''}`}
      onClick={() => toggle(id)}
    >
      <span className="nav-section-chev" aria-hidden>
        {collapsed.has(id) ? '▸' : '▾'}
      </span>
      {label}
    </button>
  )

  // Counts reflect the current client / campaign (and search) scope — NOT the
  // channel / proof / CTA filters themselves — so each count matches what
  // selecting it actually shows. The audience filter DOES flow through, so picking
  // an audience re-counts every channel / proof / CTA for just that persona.
  const scopedAllAud = rows.filter((r) =>
    rowInScope(r, { filter: 'all', query, clientFilter, campaignFilter }),
  )
  const scopedRows = scopedAllAud.filter((r) =>
    rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter, audienceFilter }),
  )
  const countFor = (id: string) => scopedRows.filter((r) => r.channel === id).length

  // Status / governance card filters — narrow the whole workspace by an asset's
  // own state (flagged / draft / unvetted proof / live). Counts are independent of
  // the active card filter (like the channel counts), so each reads what it shows.
  const cardFilters: { key: CardFilter; label: string; ico: string; n: number; title: string }[] = (
    [
      { key: 'flagged', label: 'Flagged', ico: '⚠', title: 'A frame change moved these off their proof — re-check' },
      { key: 'draft', label: 'Drafts', ico: '✎', title: 'Working set — not yet approved' },
      { key: 'unvetted', label: 'Unvetted proof', ico: '◌', title: 'Carry a proof point that is an unapproved library draft' },
      { key: 'live', label: 'Live', ico: '●', title: 'In market — posted or scheduled' },
    ] as const
  )
    .map((f) => ({ ...f, n: scopedRows.filter((r) => passesCardFilter(r, f.key)).length }))
    // Show a filter once it has matches — and keep the active one visible even at 0
    // so resolving the last match never strands you on an empty view with no way out.
    .filter((f) => f.n > 0 || f.key === cardFilter)

  // Audiences present in scope (campaign-wide, so each shows its full size), as a
  // filter — pick one and the whole workspace narrows to that persona.
  const audCounts = new Map<string, number>()
  for (const r of scopedAllAud) {
    const a = (r.audience ?? '').trim()
    if (a) audCounts.set(a, (audCounts.get(a) ?? 0) + 1)
  }
  const audiences = [...audCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

  // Proof points authored for the campaign(s) in scope, with a usage count each.
  const proofs = rtbsForCampaign(campaignFilter === 'all' ? undefined : campaignFilter)
  const proofCount = (id: string) => scopedRows.filter((r) => assetRtbIds(r).includes(id)).length

  // Distinct CTAs present across the in-scope assets, with a count each — plus a
  // "No CTA" bucket for assets that carry none.
  const ctaCounts = new Map<string, number>()
  let noCtaCount = 0
  for (const r of scopedRows) {
    const c = assetCta(r)
    if (c) ctaCounts.set(c, (ctaCounts.get(c) ?? 0) + 1)
    else noCtaCount++
  }
  // Only surface CTAs that form a pattern (used by 2+ assets) — a one-off CTA
  // isn't a pattern worth a filter row. The "No CTA" gap bucket is exempt.
  const ctas = [...ctaCounts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([c]) => c)
    .sort()

  // Aggregate tracking readiness across every channel, for the "All channels" row.
  const allTracking = CHANNEL_LIST.map((c) => channelTracking(c.id))
  const trReady = allTracking.reduce((n, t) => n + t.ready, 0)
  const trTotal = allTracking.reduce((n, t) => n + t.total, 0)
  const trChannelsNeeding = allTracking.filter((t) => t.ready < t.total).length
  const allTrCls = trReady === trTotal ? 'ok' : trReady === 0 ? 'none' : 'partial'
  const allTrTitle = `Infrastructure ${trReady}/${trTotal} set up across all channels${
    trChannelsNeeding ? ` — ${trChannelsNeeding} channel${trChannelsNeeding === 1 ? '' : 's'} need setup` : ''
  }`

  return (
    <aside className="sidebar">
      <button className="sidebar-logo" onClick={goHome} title="Home — back to all clients">
        HyperFocus
      </button>
      {/* Time-range horizon — lives in the channel bar, applies to every view. */}
      <div className="range-toggle sidebar-range" role="group" aria-label="Time range">
        {TIME_RANGES.map((r) => (
          <button
            key={r.key}
            className={`range-btn${timeRange === r.key ? ' active' : ''}`}
            onClick={() => setTimeRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <nav className="sidebar-nav">
        <button
          className={`nav-item${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          <span className="nav-ico">▦</span>
          <span className="nav-label">All channels</span>
          <span
            className="nav-track"
            role="button"
            tabIndex={0}
            title={`${allTrTitle} — click for detail`}
            onClick={(e) => {
              e.stopPropagation()
              openTracking('all')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                openTracking('all')
              }
            }}
          >
            <span className={`nav-track-dot ${allTrCls}`} />
          </span>
          <span className="nav-count">{scopedRows.length}</span>
        </button>

        {cardFilters.length > 0 && (
          <div>
            {sectionHead('__status', 'Status')}
            {!collapsed.has('__status') &&
              cardFilters.map((f) => (
                <button
                  key={f.key}
                  className={`nav-item${cardFilter === f.key ? ' active' : ''}`}
                  onClick={() => setCardFilter(cardFilter === f.key ? 'all' : f.key)}
                  title={f.title}
                >
                  <span className="nav-ico">{f.ico}</span>
                  <span className="nav-label">{f.label}</span>
                  <span className="nav-count">{f.n}</span>
                </button>
              ))}
          </div>
        )}

        {KIND_ORDER.map((section) => (
          <div key={section.kind}>
            {sectionHead(section.kind, section.label)}
            {!collapsed.has(section.kind) &&
              channelsByKind(section.kind).map((c) => {
              const tr = channelTracking(c.id)
              const missing = tr.items.filter((x) => !x.installed).map((x) => x.item.label)
              const trCls = tr.ready === tr.total ? 'ok' : tr.ready === 0 ? 'none' : 'partial'
              return (
                <button
                  key={c.id}
                  className={`nav-item${filter === c.id ? ' active' : ''}`}
                  onClick={() => setFilter(c.id)}
                >
                  <span className="nav-logo">
                    <ChannelIcon channel={c.id} size={15} />
                  </span>
                  <span className="nav-label">{c.label}</span>
                  <span
                    className="nav-track"
                    role="button"
                    tabIndex={0}
                    title={`Infrastructure ${tr.ready}/${tr.total} set up${missing.length ? ` — needs ${missing.join(', ')}` : ''} — click for detail`}
                    onClick={(e) => {
                      e.stopPropagation()
                      openTracking(c.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        openTracking(c.id)
                      }
                    }}
                  >
                    <span className={`nav-track-dot ${trCls}`} />
                  </span>
                  <span className="nav-count">{countFor(c.id)}</span>
                </button>
              )
            })}
          </div>
        ))}

        {audiences.length > 1 && (
          <div>
            {sectionHead('__aud', 'Audiences')}
            {!collapsed.has('__aud') &&
              audiences.map(([name, n]) => (
                <button
                  key={name}
                  className={`nav-item${audienceFilter === name ? ' active' : ''}`}
                  onClick={() => setAudienceFilter(audienceFilter === name ? 'all' : name)}
                  title={`Filter the whole workspace to ${name}`}
                >
                  <span className="nav-ico">◎</span>
                  <span className="nav-label">{name}</span>
                  <span className="nav-count">{n}</span>
                </button>
              ))}
          </div>
        )}

        {proofs.length > 0 && (
          <div>
            {sectionHead('__proof', 'Proof points')}
            {!collapsed.has('__proof') &&
              proofs.map((rtb) => (
              <button
                key={rtb.id}
                className={`nav-item${proofFilter === rtb.id ? ' active' : ''}`}
                onClick={() => setProofFilter(proofFilter === rtb.id ? 'all' : rtb.id)}
                title={rtb.detail}
              >
                <span className="nav-ico">◆</span>
                <span className="nav-label">{rtb.label}</span>
                <span className="nav-count">{proofCount(rtb.id)}</span>
              </button>
            ))}
          </div>
        )}

        {(ctas.length > 0 || noCtaCount > 0) && (
          <div>
            {sectionHead('__cta', 'CTAs')}
            {!collapsed.has('__cta') && (
              <>
                {ctas.map((cta) => (
                  <button
                    key={cta}
                    className={`nav-item${ctaFilter === cta ? ' active' : ''}`}
                    onClick={() => setCtaFilter(ctaFilter === cta ? 'all' : cta)}
                    title={`Filter to assets with the CTA “${cta}”`}
                  >
                    <span className="nav-ico">↗</span>
                    <span className="nav-label">{cta}</span>
                    <span className="nav-count">{ctaCounts.get(cta)}</span>
                  </button>
                ))}
                {noCtaCount > 0 && (
                  <button
                    className={`nav-item${ctaFilter === CTA_NONE ? ' active' : ''}`}
                    onClick={() => setCtaFilter(ctaFilter === CTA_NONE ? 'all' : CTA_NONE)}
                    title="Filter to assets that carry no CTA"
                  >
                    <span className="nav-ico">⊘</span>
                    <span className="nav-label">No CTA</span>
                    <span className="nav-count">{noCtaCount}</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </nav>

      <div className="toolbar-search sidebar-search">
        <span className="search-ico">⌕</span>
        <input value={query} placeholder="Search assets…" onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="sidebar-foot">
        {/* Performance: toggle the on-canvas overlay — per-asset reach/rate plus
            the plan rollup — so you see how everything's doing without leaving
            the map. */}
        <button
          className={`nav-item${perfMode ? ' active' : ''}`}
          onClick={onPerformance}
          title="Performance overlay — reach, conversion and the plan rollup on the canvas"
        >
          <span className="nav-ico">📊</span>
          <span className="nav-label">Performance</span>
          {perfMode && <span className="nav-count">on</span>}
        </button>
        <button
          className="nav-item"
          disabled={rows.length === 0}
          onClick={() => downloadCsv('hyperfocus-sheet.csv', rowsToCsv(rows))}
        >
          <span className="nav-ico">⤓</span>
          <span className="nav-label">Export CSV</span>
        </button>
        <button className="nav-item" disabled={rows.length === 0} onClick={clearSheet}>
          <span className="nav-ico">🗑</span>
          <span className="nav-label">Clear sheet</span>
        </button>
      </div>
    </aside>
  )
}
