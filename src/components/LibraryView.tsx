import { useMemo } from 'react'
import { sourceLabel } from '../domain/analyticsSources'
import { formatReach } from '../domain/journeyPerf'
import type { ChannelId, TrafficRow } from '../domain/types'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

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
  const d = iso ? new Date(iso) : ms ? new Date(ms) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
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

export function LibraryView({ scopeClient }: { scopeClient?: string }) {
  const { canvases } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const brandActuals = useTrafficStore((s) => s.brandActuals)
  const contentIngesting = useTrafficStore((s) => s.contentIngesting)
  const contentIngest = useTrafficStore((s) => s.contentIngest)
  const ingestContent = useTrafficStore((s) => s.ingestContent)

  const brand = scopeClient ?? (clientFilter !== 'all' ? clientFilter : null)

  const items = useMemo(() => {
    if (!brand) return []
    const rows = canvases.filter((c) => c.client === brand).flatMap((c) => c.rows).filter(isLibraryItem)
    // Best content first — a director scans by what earned reach, not by recency.
    return rows.sort((a, b) => (headline(b)?.value ?? 0) - (headline(a)?.value ?? 0))
  }, [canvases, brand])

  if (!brand) {
    return (
      <div className="mtx">
        <div className="mtx-empty">Open a brand folder to see its content library.</div>
      </div>
    )
  }

  const measured = brandActuals[brand]
  const connectedSources = measured?.sources ?? []
  const busy = contentIngesting === brand
  const last = contentIngest[brand]

  // Roll-up: total reach across the library + per-channel counts.
  const totalReach = items.reduce((s, r) => s + (headline(r)?.value ?? 0), 0)
  const byChannel = new Map<string, number>()
  for (const r of items) byChannel.set(String(r.channel), (byChannel.get(String(r.channel)) ?? 0) + 1)

  return (
    <div className="mtx">
      <header className="mtx-head">
        <h2>Library</h2>
        <span className="mtx-sub">
          {items.length > 0
            ? `${num(items.length)} published ${items.length === 1 ? 'asset' : 'assets'} · ${formatReach(totalReach)} reach to date`
            : 'Everything this brand has published, pulled from its connected channels'}
        </span>
      </header>

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

      {items.length === 0 ? (
        <div className="mtx-empty">
          Nothing ingested yet. Run the backfill above to fill the library with everything this brand has
          published.
        </div>
      ) : (
        <>
          {/* Per-channel tally. */}
          <div className="lib-tally">
            {[...byChannel.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([ch, n]) => (
                <span className="lib-tally-chip" key={ch}>
                  <ChannelIcon channel={ch as ChannelId} size={14} />
                  {n}
                </span>
              ))}
          </div>

          {/* The catalog. */}
          <div className="lib-grid">
            {items.map((r) => {
              const h = headline(r)
              const copy = itemCopy(r)
              const when = fmtDate(r.publishedAt, r.postedAt)
              const eng = r.socialMetrics?.engagement ?? r.socialMetrics?.likes
              const subs = r.socialMetrics?.subscribers
              return (
                <article className="lib-card" key={r.id}>
                  <div className="lib-card-top">
                    <span className="lib-card-ch">
                      <ChannelIcon channel={r.channel as ChannelId} size={14} />
                    </span>
                    {when && <span className="lib-card-date">{when}</span>}
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
                    <a className="lib-card-link" href={r.sourceUrl} target="_blank" rel="noopener noreferrer">
                      ↗ Open
                    </a>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}

      <div className="mtx-foot">
        The library is the brand's real published content, sat beside the plan. Each item keeps its source
        link, so a planned card can later reconcile to the post it became and inherit its measured metrics.
      </div>
    </div>
  )
}
