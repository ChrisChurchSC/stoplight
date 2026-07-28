import { useMemo, useState } from 'react'
import { clientForCampaign } from '../domain/clients'
import { CHANNELS } from '../domain/channels'
import { assetBadge } from '../domain/assetBadge'
import { proxiedMedia } from '../lib/media'
import { assetDate, assetMatchesFilter, groupKeyFor, resolveWindow, type AssetFilter, type ViewGroupBy } from '../domain/savedViews'
import type { TrafficRow } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { Thumb } from './Thumb'

/**
 * Saved Views (smart canvases) in the UI. A view is a stored FILTER over the brand's
 * assets that re-resolves live, so "last 30 days of social" is a clickable board, not a
 * one-off export. Lists the brand's views, creates new ones (with a relative window), and
 * renders the selected one as a grouped board of real assets.
 */

const WINDOWS: { label: string; days: number }[] = [
  { label: 'All time', days: 0 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 60 days', days: 60 },
  { label: 'Last quarter', days: 90 },
  { label: 'Last year', days: 365 },
]
const SOURCES: { label: string; value: string }[] = [
  { label: 'All content', value: '' },
  { label: 'Social posts (live)', value: 'social-live' },
  { label: 'Site / case studies', value: 'site' },
  { label: 'Generated', value: 'generated' },
  { label: 'Authored', value: 'authored' },
]
const GROUPS: ViewGroupBy[] = ['date', 'channel', 'audience', 'stage', 'none']

const cardCaption = (r: TrafficRow): string => {
  const vals = Object.values(r.messaging ?? {}).map((v) => (v ?? '').trim()).filter(Boolean)
  return vals.sort((a, b) => b.length - a.length)[0] || r.assetName
}
const fmtDate = (r: TrafficRow) => {
  const d = new Date(assetDate(r))
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''
}
const engagementOf = (r: TrafficRow) => r.socialMetrics?.engagementRate ?? (r.engagement ? r.engagement.likes + r.engagement.comments : 0)

export function SavedViewsDrawer() {
  const open = useTrafficStore((s) => s.savedViewsOpen)
  const setOpen = useTrafficStore((s) => s.setSavedViewsOpen)
  const openId = useTrafficStore((s) => s.openSavedViewId)
  const setOpenId = useTrafficStore((s) => s.setOpenSavedViewId)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const savedViews = useTrafficStore((s) => s.savedViews)
  const rows = useTrafficStore((s) => s.rows)
  const createSavedView = useTrafficStore((s) => s.createSavedView)
  const deleteSavedView = useTrafficStore((s) => s.deleteSavedView)

  const brand = clientFilter !== 'all' ? clientFilter : ''
  const brandViews = useMemo(() => savedViews.filter((v) => v.brand === brand), [savedViews, brand])

  // Create-form state.
  const [name, setName] = useState('')
  const [days, setDays] = useState(30)
  const [source, setSource] = useState('social-live')
  const [groupBy, setGroupBy] = useState<ViewGroupBy>('date')

  // Resolve a view's filter to matched rows, NOW (relative windows recompute).
  const resolve = (filter: AssetFilter, sort?: string): TrafficRow[] => {
    const f = resolveWindow(filter, Date.now())
    const matched = rows.filter((r) => clientForCampaign(r.campaign) === brand && assetMatchesFilter(r, f))
    matched.sort((a, b) => (sort === 'oldest' ? assetDate(a) - assetDate(b) : sort === 'engagement' ? engagementOf(b) - engagementOf(a) : assetDate(b) - assetDate(a)))
    return matched
  }

  if (!open) return null
  const active = openId ? brandViews.find((v) => v.id === openId) : undefined

  const create = () => {
    const filter: AssetFilter = {}
    if (source) filter.source = [source]
    if (days > 0) filter.withinDays = days
    const v = createSavedView(brand, name.trim() || WINDOWS.find((w) => w.days === days)?.label || 'Saved view', {
      filter,
      layout: 'board',
      groupBy,
      sort: 'newest',
    })
    setName('')
    setOpenId(v.id)
  }

  return (
    <>
      <div className="drawer-scrim" onClick={() => setOpen(false)} />
      <aside className="drawer sv-drawer">
        <div className="drawer-head">
          {active ? (
            <button className="btn ghost sm" onClick={() => setOpenId(null)} title="Back to views">
              ‹ Views
            </button>
          ) : (
            <strong>▦ Saved Views</strong>
          )}
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>

        {!brand ? (
          <div className="drawer-body">
            <div className="sv-empty">Open a brand to see its saved views.</div>
          </div>
        ) : active ? (
          <SavedViewBoard view={active} rows={resolve(active.filter, active.sort)} />
        ) : (
          <div className="drawer-body">
            <div className="sv-section">
              <div className="sv-label">New view</div>
              <input className="library-input" placeholder="Name (e.g. Last 30 Days)" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="sv-row">
                <label className="sv-field">
                  <span>Window</span>
                  <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    {WINDOWS.map((w) => (
                      <option key={w.days} value={w.days}>{w.label}</option>
                    ))}
                  </select>
                </label>
                <label className="sv-field">
                  <span>Content</span>
                  <select value={source} onChange={(e) => setSource(e.target.value)}>
                    {SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label className="sv-field">
                  <span>Group by</span>
                  <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as ViewGroupBy)}>
                    {GROUPS.map((g) => (
                      <option key={g} value={g}>{g === 'none' ? 'None' : g[0].toUpperCase() + g.slice(1)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button className="btn sm primary" onClick={create}>
                Create view
              </button>
            </div>

            <div className="sv-section">
              <div className="sv-label">{brand}'s views</div>
              {brandViews.length === 0 ? (
                <div className="sv-empty">No saved views yet. A view is a live filter, e.g. "Last 30 days of social".</div>
              ) : (
                brandViews.map((v) => {
                  const n = resolve(v.filter, v.sort).length
                  return (
                    <div key={v.id} className="sv-item">
                      <button className="sv-item-open" onClick={() => setOpenId(v.id)}>
                        <span className="sv-item-name">{v.name}</span>
                        <span className="sv-item-sub">
                          {filterSummary(v.filter)} · <strong>{n}</strong> asset{n === 1 ? '' : 's'}
                        </span>
                      </button>
                      <button className="sv-item-del" title="Delete view" onClick={() => deleteSavedView(v.id)}>
                        ✕
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

function filterSummary(f: AssetFilter): string {
  const parts: string[] = []
  if (f.source?.length) parts.push(f.source.join('/'))
  if (f.withinDays) parts.push(`last ${f.withinDays}d`)
  if (f.channel?.length) parts.push(f.channel.join('/'))
  if (f.status?.length) parts.push(f.status.join('/'))
  return parts.join(' · ') || 'all content'
}

function SavedViewBoard({ view, rows }: { view: { name: string; groupBy: ViewGroupBy }; rows: TrafficRow[] }) {
  // Group per the view config; 'none' = one flat group.
  const groups = useMemo(() => {
    const m = new Map<string, TrafficRow[]>()
    for (const r of rows) {
      const k = view.groupBy && view.groupBy !== 'none' ? groupKeyFor(r, view.groupBy) : 'all'
      ;(m.get(k) ?? m.set(k, []).get(k)!).push(r)
    }
    const entries = [...m.entries()]
    entries.sort((a, b) => (view.groupBy === 'date' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])))
    return entries
  }, [rows, view.groupBy])

  return (
    <div className="drawer-body sv-board">
      <div className="sv-board-head">
        <strong>{view.name}</strong>
        <span className="sv-board-count">{rows.length} asset{rows.length === 1 ? '' : 's'}</span>
      </div>
      {rows.length === 0 && <div className="sv-empty">Nothing matches this view right now.</div>}
      {groups.map(([key, items]) => (
        <div key={key} className="sv-group">
          {view.groupBy !== 'none' && (
            <div className="sv-group-head">
              {groupLabel(key, view.groupBy)} <span className="sv-group-n">{items.length}</span>
            </div>
          )}
          <div className="sv-cards">
            {items.map((r) => (
              <div key={r.id} className="sv-card">
                {r.mediaRef ? (
                  <div className="sv-card-media" key={r.mediaRef}>
                    <Thumb mediaType={r.mediaType} url={proxiedMedia(r.mediaRef, 200)} />
                  </div>
                ) : (
                  <div className="sv-card-media sv-card-media-none">
                    <ChannelIcon channel={r.channel} size={20} />
                  </div>
                )}
                <div className="sv-card-body">
                  <div className="sv-card-meta">
                    <ChannelIcon channel={r.channel} size={13} />
                    <span>{CHANNELS[r.channel]?.label ?? r.channel}</span>
                    {(() => {
                      const b = assetBadge(r)
                      return <span className={`cv-node-badge badge-${b.kind}`}>{b.label}</span>
                    })()}
                    <span className="sv-card-date">{fmtDate(r)}</span>
                    {engagementOf(r) > 0 && <span className="sv-card-eng">♥ {engagementOf(r)}</span>}
                  </div>
                  <div className="sv-card-text">{cardCaption(r)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function groupLabel(key: string, groupBy: ViewGroupBy): string {
  if (groupBy === 'date' && /^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }
  if (groupBy === 'channel') return CHANNELS[key as keyof typeof CHANNELS]?.label ?? key
  return key
}
