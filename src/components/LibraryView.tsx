import { useEffect, useMemo, useState } from 'react'
import { CHANNELS } from '../domain/channels'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { formatReach } from '../domain/journeyPerf'
import type { ChannelId, TrafficRow } from '../domain/types'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { GranolaIcon } from './GranolaIcon'
import { LibraryData } from './LibraryData'
import { LibraryFolderView } from './LibraryFolderView'
import { BrandPicker } from './BrandPicker'

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
  const ingestContent = useTrafficStore((s) => s.ingestContent)
  const libraryFolders = useTrafficStore((s) => s.libraryFolders)
  const addLibraryFolder = useTrafficStore((s) => s.addLibraryFolder)
  const renameLibraryFolder = useTrafficStore((s) => s.renameLibraryFolder)
  const deleteLibraryFolder = useTrafficStore((s) => s.deleteLibraryFolder)
  // Which folder is open: null = the brand's own ingested catalog ("Your content").
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  // Inline "new folder" name entry in the rail; and inline rename of the open folder.
  const [newFolder, setNewFolder] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)

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
  // The card whose "file to folder" menu is open, and a brief confirmation.
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null)
  const [filedFlash, setFiledFlash] = useState<string | null>(null)
  const addLibraryFolderItems = useTrafficStore((s) => s.addLibraryFolderItems)
  useEffect(() => {
    if (!detail) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetail(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail])

  const brand = scopeClient ?? (clientFilter !== 'all' ? clientFilter : null)

  // Folders are brand-scoped; an open folder from another brand falls back to Your content.
  const brandFolders = useMemo(() => libraryFolders.filter((f) => f.brand === brand), [libraryFolders, brand])
  const openFolder = brandFolders.find((f) => f.id === activeFolder) ?? null

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
        <BrandPicker verb="see its content library" />
      </div>
    )
  }

  const measured = brandActuals[brand]
  const connectedSources = measured?.sources ?? []
  const busy = contentIngesting === brand

  const commitNewFolder = () => {
    const name = (newFolder ?? '').trim()
    if (!name) return setNewFolder(null)
    const id = addLibraryFolder(brand, name)
    setNewFolder(null)
    setActiveFolder(id)
  }
  const removeOpenFolder = () => {
    if (!openFolder) return
    deleteLibraryFolder(openFolder.id)
    setActiveFolder(null)
    setRenaming(false)
  }

  // The left rail: Your content (the ingested catalog) + this brand's folders + a create row.
  const folderRail = (
    <aside className="lib-folder-rail">
      <button
        className={`lib-folder-item${!openFolder ? ' active' : ''}`}
        onClick={() => { setActiveFolder(null); setRenaming(false) }}
      >
        <span className="lib-folder-ic">▤</span>
        <span className="lib-folder-name">Your content</span>
        <span className="lib-folder-n">{items.length}</span>
      </button>
      <div className="lib-folder-sec">Folders</div>
      {brandFolders.map((f) => (
        <button
          key={f.id}
          className={`lib-folder-item${openFolder?.id === f.id ? ' active' : ''}`}
          onClick={() => { setActiveFolder(f.id); setRenaming(false) }}
          title={f.name}
        >
          <span className="lib-folder-ic">📁</span>
          <span className="lib-folder-name">{f.name}</span>
          <span className="lib-folder-n">{f.items.length}</span>
        </button>
      ))}
      {newFolder === null ? (
        <button className="lib-folder-new" onClick={() => setNewFolder('')}>＋ New folder</button>
      ) : (
        <div className="lib-folder-new-row">
          <input
            autoFocus
            value={newFolder}
            placeholder="e.g. Salt Strong"
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNewFolder()
              if (e.key === 'Escape') setNewFolder(null)
            }}
            onBlur={commitNewFolder}
          />
        </div>
      )}
    </aside>
  )

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

  // File a library asset into a folder — copies a lightweight reference (title, channel,
  // link, copy) into the folder; the original stays in Your content.
  const fileToFolder = (r: TrafficRow, folderId: string, folderName: string) => {
    const added = addLibraryFolderItems(folderId, [
      { title: r.assetName, channel: r.channel as ChannelId, url: r.sourceUrl, copy: itemCopy(r) || undefined },
    ])
    setFolderMenuFor(null)
    setFiledFlash(added ? `Filed to “${folderName}”` : `Already in “${folderName}”`)
    window.setTimeout(() => setFiledFlash(null), 2000)
  }

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
          <span className="lib-card-add-wrap">
            <button
              className="lib-card-add"
              title="File this asset into a folder"
              onClick={(e) => {
                e.stopPropagation()
                setFolderMenuFor((m) => (m === r.id ? null : r.id))
              }}
            >
              📁 Folder
            </button>
            {folderMenuFor === r.id && (
              <>
                <div className="lib-add-scrim" onClick={(e) => { e.stopPropagation(); setFolderMenuFor(null) }} />
                <div className="lib-add-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="lib-add-menu-head">File to folder</div>
                  {brandFolders.length === 0 && (
                    <div className="lib-add-menu-empty">No folders yet.</div>
                  )}
                  {brandFolders.map((f) => (
                    <button
                      key={f.id}
                      className="lib-add-menu-item"
                      onClick={(e) => {
                        e.stopPropagation()
                        fileToFolder(r, f.id, f.name)
                      }}
                    >
                      📁 {f.name}
                    </button>
                  ))}
                  <button
                    className="lib-add-menu-item new"
                    onClick={(e) => {
                      e.stopPropagation()
                      const name = window.prompt('New folder name')?.trim()
                      if (!name) return
                      const id = addLibraryFolder(brand, name)
                      fileToFolder(r, id, name)
                    }}
                  >
                    ＋ New folder…
                  </button>
                </div>
              </>
            )}
          </span>
        </div>
      </article>
    )
  }

  return (
    <div className="mtx">
      <header className="mtx-head">
        <h2>{brand} · {mode === 'catalog' ? 'Library' : 'Insights'}</h2>
        <span className="mtx-sub">
          {mode !== 'catalog'
            ? `${formatReach(totalReach)} reach across ${num(published.length)} published ${published.length === 1 ? 'asset' : 'assets'} · what the data says about ${brand} right now`
            : items.length > 0
              ? `${num(published.length)} published ${published.length === 1 ? 'asset' : 'assets'} · ${formatReach(totalReach)} reach to date${meetings.length ? ` · ${meetings.length} meeting ${meetings.length === 1 ? 'note' : 'notes'}` : ''}`
              : 'Everything this brand has published, pulled from its connected channels'}
        </span>
        {mode === 'catalog' && !openFolder && (
          <button
            className="lib-ingest-mini"
            onClick={() => ingestContent(brand)}
            disabled={busy}
            title="Pull every post, video, and page from the connected channels. Safe to re-run: refreshes what it has and skips duplicates."
          >
            {busy ? 'Ingesting…' : items.length ? '↺ Re-ingest' : '⤓ Ingest'}
          </button>
        )}
      </header>

      {mode !== 'catalog' ? (
        // Insights: the single derived read over the library — Findings, with the flow
        // map embedded in the dashboard. Above it, the live connected metrics for the brand
        // (GA4 / Search Console via the analytics feed) — brand-level, so it shows even with
        // no ingested content yet.
        <>
          {measured && measured.channels.length > 0 && (
            <section className="ins-card ins-wide" style={{ marginBottom: 16 }}>
              <div className="ins-card-head">
                <h3>Connected metrics</h3>
                <span className="ins-card-hint">Live from {connectedSources.join(', ')} · last 90 days</span>
              </div>
              <div className="ins-rows">
                {measured.channels.map((c) => {
                  const meta = [
                    c.clicks != null ? `${num(c.clicks)} clicks` : null,
                    c.engagement != null ? `${num(c.engagement)} engaged` : null,
                    c.conversions ? `${num(c.conversions)} conversions` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <div className="ins-row" key={c.channel}>
                      <div className="ins-row-label">
                        <span className="ins-row-name">{c.label}</span>
                        {meta && <span className="ins-row-meta">{meta}</span>}
                      </div>
                      <span className="ins-row-value">
                        {num(c.reach)} {c.reachUnit}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
          <LibraryData
            items={items}
            allRows={allRows}
            proofPoints={brandSystems[brand]?.rtbs}
            ctas={brandSystems[brand]?.ctas}
            audiences={brandSystems[brand]?.audiences}
            sources={connectedSources}
          />
        </>
      ) : (
        <div className="lib-catalog-wrap">
          {folderRail}
          <div className="lib-catalog-main">
          {openFolder ? (
            <>
              <div className="lib-folder-head">
                {renaming ? (
                  <input
                    className="lib-folder-rename"
                    autoFocus
                    defaultValue={openFolder.name}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { renameLibraryFolder(openFolder.id, (e.target as HTMLInputElement).value); setRenaming(false) }
                      if (e.key === 'Escape') setRenaming(false)
                    }}
                    onBlur={(e) => { renameLibraryFolder(openFolder.id, e.target.value); setRenaming(false) }}
                  />
                ) : (
                  <h3 className="lib-folder-title" onDoubleClick={() => setRenaming(true)}>
                    📁 {openFolder.name}
                  </h3>
                )}
                <span className="lib-folder-sub">{openFolder.items.length} item{openFolder.items.length === 1 ? '' : 's'} · reference only</span>
                <span className="lib-folder-head-btns">
                  <button className="lib-folder-rename-btn" onClick={() => setRenaming(true)}>Rename</button>
                  <button className="lib-folder-del-btn" onClick={removeOpenFolder}>Delete folder</button>
                </span>
              </div>
              <LibraryFolderView folderId={openFolder.id} />
            </>
          ) : (
          <>
          {items.length === 0 ? (
        <div className="mtx-empty">
          Nothing ingested yet. Use Ingest in the header to fill the library with everything this brand has
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
          </div>
        </div>
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

      {filedFlash && <div className="lib-toast">{filedFlash}</div>}
    </div>
  )
}
