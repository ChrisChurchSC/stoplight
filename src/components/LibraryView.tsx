import { useEffect, useMemo, useState } from 'react'
import { sourceLabel } from '../domain/analyticsSources'
import { CHANNELS } from '../domain/channels'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { formatReach } from '../domain/journeyPerf'
import type { ChannelId, TrafficRow } from '../domain/types'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { GranolaIcon } from './GranolaIcon'
import { LibraryData } from './LibraryData'

/**
 * Library — a brand's whole published body of work, ingested from its connected
 * channels and sat beside the plan. One "Ingest everything to date" pull fans over
 * each connected source (YouTube, LinkedIn, site, ...) through importAssets, which
 * dedups by URL / copy and lands each post as posted content with its real metrics.
 * The result is a catalog of what actually shipped: the join key (sourceUrl) that
 * later reconciles a planned card to the real post it became.
 *
 * A fifth way to look at a folder, alongside Canvases / Grid / Calendar / Metrics.
 */

const num = (n: number) => n.toLocaleString()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDate = (iso?: string, ms?: number) => {
  // A bare YYYY-MM-DD parses as UTC midnight, which renders a day early in a
  // negative-offset timezone. Read the date parts as local when it's date-only.
  let d: Date | null = null
  if (iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.slice(0, 10))
    d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
  } else if (ms) {
    d = new Date(ms)
  }
  if (!d || Number.isNaN(d.getTime())) return ''
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** A row's post date as ms (postedAt / publishedAt), date-only strings read local. */
function postMs(r: TrafficRow): number | null {
  if (typeof r.postedAt === 'number') return r.postedAt
  const iso = r.publishedAt ?? (typeof r.postedAt === 'string' ? r.postedAt : undefined)
  if (iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
    if (!Number.isNaN(d.getTime())) return d.getTime()
  }
  return null
}
/** When the row was pulled into the library (the ingest stamps createdAt). */
const ingestMs = (r: TrafficRow): number | null => (typeof r.createdAt === 'number' ? r.createdAt : null)

/** Date-range presets for the catalog filters. */
const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }
const RANGE_OPTS: [string, string][] = [
  ['all', 'Any time'],
  ['7d', 'Past 7 days'],
  ['30d', 'Past 30 days'],
  ['90d', 'Past 90 days'],
  ['365d', 'Past year'],
]
function inRange(ms: number | null, range: string, now: number): boolean {
  if (range === 'all') return true
  if (ms == null) return false
  const days = RANGE_DAYS[range]
  return days ? ms >= now - days * 86400000 : true
}

/** A row is a library item when it's real published content: it shipped (posted) or
 *  carries a source URL from an ingest. Planned drafts never show here. */
const isLibraryItem = (r: TrafficRow): boolean =>
  r.status === 'posted' || !!r.postedAt || (!!r.sourceUrl && r.source !== 'generated')

/** The headline reach metric for a row, by channel convention (views / impressions),
 *  else the largest numeric metric the source gave us. */
function headline(r: TrafficRow): { label: string; value: number } | null {
  const m = r.socialMetrics
  if (!m) return null
  if (typeof m.views === 'number') return { label: 'views', value: m.views }
  if (typeof m.impressions === 'number') return { label: 'impressions', value: m.impressions }
  if (typeof m.reach === 'number') return { label: 'reach', value: m.reach }
  const nums = Object.entries(m).filter(([, v]) => typeof v === 'number') as [string, number][]
  if (!nums.length) return null
  const top = nums.sort((a, b) => b[1] - a[1])[0]
  return { label: top[0], value: top[1] }
}

/** The line of text under an item's title: the post copy, trimmed. */
function itemCopy(r: TrafficRow): string {
  const vals = Object.values(r.messaging ?? {}).filter(Boolean)
  const joined = vals.join(' · ').trim()
  return joined && joined !== r.assetName ? joined : ''
}

/** A channel id's display label (falls back to the raw value for non-canonical ids). */
const channelLabel = (ch: string): string => CHANNELS[ch as ChannelId]?.label ?? ch

/** A meeting note ingested from Granola (identified by its source link). These carry the
 *  Granola mark instead of a publishing-channel icon. */
const isMeeting = (r: TrafficRow): boolean => /granola\./i.test(r.sourceUrl ?? '') || r.assetType === 'Meeting note'

/** Turn a messaging field key into a readable label (body → Body, primaryText → Primary Text). */
const prettyKey = (k: string): string =>
  k
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase())

/** The messaging fields worth showing in the detail view: [label, value] pairs. */
function messagingEntries(r: TrafficRow): [string, string][] {
  return Object.entries(r.messaging ?? {})
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([k, v]) => [prettyKey(k), v.trim()] as [string, string])
}

/** Numeric metrics on a row: [label, value] pairs for the detail view. */
function metricEntries(r: TrafficRow): [string, number][] {
  return Object.entries(r.socialMetrics ?? {}).filter(([, v]) => typeof v === 'number' && v > 0) as [string, number][]
}

export function LibraryView({ scopeClient }: { scopeClient?: string }) {
  const { canvases } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const brandActuals = useTrafficStore((s) => s.brandActuals)
  const brandSystems = useTrafficStore((s) => s.brandSystems)
  const contentIngesting = useTrafficStore((s) => s.contentIngesting)
  const contentIngest = useTrafficStore((s) => s.contentIngest)
  const ingestContent = useTrafficStore((s) => s.ingestContent)

  // Catalog (browse every published asset) vs Signals (what's working — the read
  // over the library that ranks content by what drives subscribers). The mode lives
  // in the store so the sidebar's nested Library items drive it too.
  const mode = useTrafficStore((s) => s.libraryMode)
  const updateRow = useTrafficStore((s) => s.updateRow)
  // The asset opened in the detail view (click a card to read its full messaging).
  const [detail, setDetail] = useState<TrafficRow | null>(null)
  // Catalog: click a channel chip to filter the grid to that channel ('__meeting__'
  // for the Granola notes); null shows everything.
  const [chFilter, setChFilter] = useState<string | null>(null)
  // Catalog date filters: narrow by when a piece was posted and when it was ingested.
  const [postedRange, setPostedRange] = useState('all')
  const [ingestedRange, setIngestedRange] = useState('all')
  // The card whose "add to campaign" menu is open.
  const [menuFor, setMenuFor] = useState<string | null>(null)
  useEffect(() => {
    if (!detail) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetail(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail])

  const brand = scopeClient ?? (clientFilter !== 'all' ? clientFilter : null)

  // Every asset the brand has (planned + published), for the Signals channel-mix read.
  const allRows = useMemo(
    () => (brand ? canvases.filter((c) => c.client === brand).flatMap((c) => c.rows) : []),
    [canvases, brand],
  )
  const items = useMemo(() => {
    if (!brand) return []
    const rows = allRows.filter(isLibraryItem)
    // Best content first — a director scans by what earned reach, not by recency.
    return rows.sort((a, b) => (headline(b)?.value ?? 0) - (headline(a)?.value ?? 0))
  }, [allRows, brand])

  // The brand's real campaigns (not the ingest bucket), for "add a catalog item to a campaign".
  const campaignNames = useMemo(
    () =>
      Array.from(new Set(canvases.filter((c) => c.client === brand).map((c) => c.name))).filter(
        (n) => n && n !== CONTENT_LIBRARY_CAMPAIGN,
      ),
    [canvases, brand],
  )

  if (!brand) {
    return (
      <div className="mtx">
        <div className="mtx-empty">Pick a brand in the sidebar to see its content library.</div>
      </div>
    )
  }

  const measured = brandActuals[brand]
  const connectedSources = measured?.sources ?? []
  const busy = contentIngesting === brand
  const last = contentIngest[brand]

  // Meeting notes (from Granola) are a distinct kind of asset, not published content, so
  // they're grouped on their own and kept out of the published count / reach roll-up.
  const meetings = items.filter(isMeeting)
  const published = items.filter((r) => !isMeeting(r))

  // Roll-up: total reach across the whole published library (a "to date" summary, so
  // it stays put when the date filters narrow the view below).
  const totalReach = published.reduce((s, r) => s + (headline(r)?.value ?? 0), 0)

  // Date filters — narrow to what was posted / ingested within a window. The channel
  // tally + grid reflect the filtered set; the header count stays the library total.
  const now = Date.now()
  const dateFiltered = (r: TrafficRow) => inRange(postMs(r), postedRange, now) && inRange(ingestMs(r), ingestedRange, now)
  const dateActive = postedRange !== 'all' || ingestedRange !== 'all'
  const publishedShown = dateActive ? published.filter(dateFiltered) : published
  const meetingsShown = dateActive ? meetings.filter(dateFiltered) : meetings

  const byChannel = new Map<string, number>()
  for (const r of publishedShown) byChannel.set(String(r.channel), (byChannel.get(String(r.channel)) ?? 0) + 1)

  // One catalog card, reused by the published grid and the meeting-notes group.
  const renderCard = (r: TrafficRow) => {
    const h = headline(r)
    const copy = itemCopy(r)
    const when = fmtDate(r.publishedAt, r.postedAt)
    const ingested = fmtDate(undefined, r.createdAt)
    const eng = r.socialMetrics?.engagement ?? r.socialMetrics?.likes
    const subs = r.socialMetrics?.subscribers
    const meeting = isMeeting(r)
    const inCampaign = r.campaign && r.campaign !== CONTENT_LIBRARY_CAMPAIGN ? r.campaign : null
    const addOptions = campaignNames.filter((n) => n !== r.campaign)
    return (
      <article
        className="lib-card lib-card-click"
        key={r.id}
        role="button"
        tabIndex={0}
        onClick={() => setDetail(r)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setDetail(r)
          }
        }}
      >
        <div className="lib-card-top">
          <span className="lib-card-ch">
            {meeting ? <GranolaIcon size={14} /> : <ChannelIcon channel={r.channel as ChannelId} size={14} />}
          </span>
          {when && (
            <span className="lib-card-date">
              {!meeting && <em>Posted</em>} {when}
            </span>
          )}
        </div>
        <div className="lib-card-title" title={r.assetName}>
          {r.assetName}
        </div>
        {copy && <div className="lib-card-copy">{copy}</div>}
        <div className="lib-card-metrics">
          {h && (
            <span className="lib-metric strong">
              {formatReach(h.value)} <em>{h.label}</em>
            </span>
          )}
          {typeof eng === 'number' && eng > 0 && (
            <span className="lib-metric">
              {num(eng)} <em>eng.</em>
            </span>
          )}
          {typeof subs === 'number' && subs > 0 && (
            <span className="lib-metric sub">
              +{num(subs)} <em>subs</em>
            </span>
          )}
        </div>
        {r.sourceUrl && (
          <a className="lib-card-link" href={r.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            ↗ Open
          </a>
        )}
        <div className="lib-card-foot">
          {ingested && (
            <span className="lib-card-ingested">
              <em>Ingested</em> {ingested}
            </span>
          )}
          {(inCampaign || addOptions.length > 0) && (
            <span className="lib-card-add-wrap">
              <button
                className={inCampaign ? 'lib-card-campaign' : 'lib-card-add'}
                title={inCampaign ? `In campaign: ${inCampaign}` : 'Add to a campaign'}
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuFor((m) => (m === r.id ? null : r.id))
                }}
              >
                {inCampaign ? `▤ ${inCampaign}` : '+ Campaign'}
              </button>
              {menuFor === r.id && (
                <>
                  <div className="lib-add-scrim" onClick={(e) => { e.stopPropagation(); setMenuFor(null) }} />
                  <div className="lib-add-menu" onClick={(e) => e.stopPropagation()}>
                    <div className="lib-add-menu-head">{inCampaign ? 'Move to campaign' : 'Add to campaign'}</div>
                    {inCampaign && (
                      <button
                        className="lib-add-menu-item remove"
                        onClick={(e) => {
                          e.stopPropagation()
                          void updateRow(r.id, { campaign: CONTENT_LIBRARY_CAMPAIGN })
                          setMenuFor(null)
                        }}
                      >
                        ✕ Remove from campaign
                      </button>
                    )}
                    {addOptions.map((name) => (
                      <button
                        key={name}
                        className="lib-add-menu-item"
                        onClick={(e) => {
                          e.stopPropagation()
                          void updateRow(r.id, { campaign: name })
                          setMenuFor(null)
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </span>
          )}
        </div>
      </article>
    )
  }

  return (
    <div className="mtx">
      <header className="mtx-head">
        <h2>{brand} · Library</h2>
        <span className="mtx-sub">
          {items.length > 0
            ? `${num(published.length)} published ${published.length === 1 ? 'asset' : 'assets'} · ${formatReach(totalReach)} reach to date${meetings.length ? ` · ${meetings.length} meeting ${meetings.length === 1 ? 'note' : 'notes'}` : ''}`
            : 'Everything this brand has published, pulled from its connected channels'}
        </span>
      </header>

      {mode !== 'catalog' ? (
        // Insights: the single derived read over the library — Findings, with the flow
        // map embedded in the dashboard.
        <LibraryData
          items={items}
          allRows={allRows}
          proofPoints={brandSystems[brand]?.rtbs}
          ctas={brandSystems[brand]?.ctas}
          audiences={brandSystems[brand]?.audiences}
          sources={connectedSources}
        />
      ) : (
        <>
          {/* Ingest control — one pull backfills the whole body of work. */}
          <section className="lib-ingest">
        <div className="lib-ingest-main">
          <div className="lib-ingest-copy">
            <strong>Ingest everything to date</strong>
            <span>
              Pull every post, video, and page from the connected channels into the library as posted
              content with its real metrics. Safe to re-run: it refreshes what it already has and skips
              duplicates.
            </span>
          </div>
          <button className="lib-ingest-btn" onClick={() => ingestContent(brand)} disabled={busy}>
            {busy ? 'Ingesting…' : items.length ? '↺ Re-ingest' : '⤓ Ingest everything to date'}
          </button>
        </div>
        <div className="lib-ingest-foot">
          {connectedSources.length > 0 ? (
            <span className="lib-src">⛁ Pulls from {connectedSources.map(sourceLabel).join(' · ')}</span>
          ) : (
            <span className="lib-src off">Connect a source in Summer to backfill this brand's content.</span>
          )}
          {last && (
            <span className="lib-last">
              Last run {fmtDate(undefined, last.at)}: {last.imported} new · {last.updated} refreshed
              {last.skipped ? ` · ${last.skipped} duplicate` : ''}
              {last.sources.length ? ` (${last.sources.join(', ')})` : ''}
            </span>
          )}
        </div>
      </section>

      {/* Add a one-off creative through Claude — it reads the copy off the art and
          writes it here as an asset, no API credits and the sharpest read on
          stylized creatives. The channel-level backfill above stays automatic. */}
      <div className="lib-claude">
        <span className="lib-claude-ico">✦</span>
        <div className="lib-claude-copy">
          <strong>Add a creative through Claude</strong>
          <span>
            Drop a creative into your Claude chat, or point Claude at a post, and it reads the copy off
            it and stores it here as an asset. Best for one-offs and stylized art the channel backfill
            can't reach.
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mtx-empty">
          Nothing ingested yet. Run the backfill above to fill the library with everything this brand has
          published.
        </div>
      ) : (
        <>
          {/* Per-channel tally, clickable to filter the grid. */}
          <div className="lib-tally">
            <button
              className={`lib-tally-chip${chFilter === null ? ' active' : ''}`}
              onClick={() => setChFilter(null)}
            >
              All {publishedShown.length}
            </button>
            {[...byChannel.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([ch, n]) => (
                <button
                  className={`lib-tally-chip${chFilter === ch ? ' active' : ''}`}
                  key={ch}
                  onClick={() => setChFilter((c) => (c === ch ? null : ch))}
                  title={channelLabel(ch)}
                >
                  <ChannelIcon channel={ch as ChannelId} size={14} />
                  {n}
                </button>
              ))}
            {meetingsShown.length > 0 && (
              <button
                className={`lib-tally-chip${chFilter === '__meeting__' ? ' active' : ''}`}
                title="Meeting notes from Granola"
                onClick={() => setChFilter((c) => (c === '__meeting__' ? null : '__meeting__'))}
              >
                <GranolaIcon size={14} />
                {meetingsShown.length}
              </button>
            )}
          </div>

          {/* Date filters — by post date and by when it was ingested. */}
          <div className="lib-filters">
            <label className="lib-filter">
              <span>Posted</span>
              <select value={postedRange} onChange={(e) => setPostedRange(e.target.value)}>
                {RANGE_OPTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="lib-filter">
              <span>Ingested</span>
              <select value={ingestedRange} onChange={(e) => setIngestedRange(e.target.value)}>
                {RANGE_OPTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {dateActive && (
              <button
                className="lib-filter-clear"
                onClick={() => {
                  setPostedRange('all')
                  setIngestedRange('all')
                }}
              >
                Clear dates
              </button>
            )}
          </div>

          {/* The catalog — published content, then meeting notes grouped on their own. */}
          {chFilter !== '__meeting__' &&
            (() => {
              const grid = chFilter ? publishedShown.filter((r) => String(r.channel) === chFilter) : publishedShown
              return grid.length > 0 ? (
                <div className="lib-grid">{grid.map(renderCard)}</div>
              ) : (
                <div className="mtx-empty">No published assets match these filters.</div>
              )
            })()}

          {meetingsShown.length > 0 && (chFilter === null || chFilter === '__meeting__') && (
            <section className="lib-meetings">
              <div className="lib-section-head">
                <GranolaIcon size={16} />
                Meeting notes
                <span className="lib-section-n">{meetingsShown.length}</span>
                <span className="lib-section-sub">strategy calls from Granola</span>
              </div>
              <div className="lib-grid">{meetingsShown.map(renderCard)}</div>
            </section>
          )}
        </>
      )}

          <div className="mtx-foot">
            The library is the brand's real published content, sat beside the plan. Each item keeps its source
            link, so a planned card can later reconcile to the post it became and inherit its measured metrics.
            Click any card to read its full copy.
          </div>
        </>
      )}

      {detail && (
        <div className="lib-modal-overlay" onClick={() => setDetail(null)}>
          <div className="lib-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="lib-modal-x" onClick={() => setDetail(null)} aria-label="Close">
              ×
            </button>
            <div className="lib-modal-head">
              <span className="lib-modal-ch">
                {isMeeting(detail) ? <GranolaIcon size={15} /> : <ChannelIcon channel={detail.channel as ChannelId} size={15} />}
                {isMeeting(detail) ? 'Granola · Meeting' : channelLabel(detail.channel)}
              </span>
              {fmtDate(detail.publishedAt, detail.postedAt) && (
                <span className="lib-modal-date">{fmtDate(detail.publishedAt, detail.postedAt)}</span>
              )}
            </div>
            <h3 className="lib-modal-title">{detail.assetName}</h3>

            {metricEntries(detail).length > 0 && (
              <div className="lib-modal-metrics">
                {metricEntries(detail).map(([k, v]) => (
                  <span className="lib-modal-metric" key={k}>
                    <strong>{num(v)}</strong> {k}
                  </span>
                ))}
              </div>
            )}

            <div className="lib-modal-fields">
              {messagingEntries(detail).length > 0 ? (
                messagingEntries(detail).map(([label, value]) => (
                  <div className="lib-modal-field" key={label}>
                    <div className="lib-modal-field-label">{label}</div>
                    <div className="lib-modal-field-value">{value}</div>
                  </div>
                ))
              ) : (
                <div className="lib-modal-empty">
                  No copy captured for this asset yet. Scrape it from the source and it shows up here.
                </div>
              )}
            </div>

            {detail.sourceUrl && (
              <a className="lib-modal-link" href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">
                ↗ Open original
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
