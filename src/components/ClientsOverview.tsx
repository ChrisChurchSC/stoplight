import { useEffect, useMemo, useState } from 'react'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { DRAFTS_SPACE, useTrafficStore } from '../store/useTrafficStore'
import { BrandInfo } from './BrandInfo'
import { BrandPersonalization } from './BrandPersonalization'
import { BrandVoice } from './BrandVoice'
import { CalendarView } from './CalendarView'
import { HomeShell } from './HomeShell'
import { LibraryPage } from './LibraryPage'
import { SheetGrid } from './SheetGrid'

/**
 * The home — a files browser for canvases in the shared dashboard shell (sidebar +
 * tab bar from HomeShell). This component owns the main column: a title for the
 * active filter and a gallery of canvas cards you open with a click. The sidebar
 * filters (all / drafts / flagged / live, or a brand) drive `homeFilter` in the store.
 */

const HOUR = 3_600_000
const DAY = 86_400_000
function fmtAgo(ms: number): string {
  if (!ms) return ''
  const d = Date.now() - ms
  if (d < 0) return 'just now'
  if (d < HOUR) {
    const m = Math.floor(d / 60_000)
    return m <= 1 ? 'just now' : `${m}m ago`
  }
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fmtDay(ms: number): string {
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: '2-digit' })
}

/** A canvas's scheduled span — earliest to latest asset date — as "Sep 3 – Sep 17"
 *  (single day when they match), or null when nothing is scheduled. */
function dateRange(rows: { scheduledAt?: string }[]): string | null {
  const times = rows.map((r) => (r.scheduledAt ? +new Date(r.scheduledAt) : NaN)).filter((t) => !Number.isNaN(t))
  if (!times.length) return null
  const a = fmtDay(Math.min(...times))
  const b = fmtDay(Math.max(...times))
  return a === b ? a : `${a} – ${b}`
}

const MONTHS3: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
const MNAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The date window a campaign encodes in its own name, e.g. "(Sept 14-20, 2026)" or
 *  "(Sept 28-Oct 4, 2026)" → "Sep 14 – Sep 20". This is the authoritative campaign
 *  window even when the assets aren't dated yet. */
function nameRange(name: string): string | null {
  // Cross-month: (Sept 28-Oct 4, 2026)
  const cross = name.match(/\(\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[-–]\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})/)
  if (cross) {
    const m1 = MONTHS3[cross[1].slice(0, 3).toLowerCase()]
    const m2 = MONTHS3[cross[3].slice(0, 3).toLowerCase()]
    if (m1 != null && m2 != null) return `${MNAMES[m1]} ${+cross[2]} – ${MNAMES[m2]} ${+cross[4]}`
  }
  // Same-month: (Sept 14-20, 2026)
  const same = name.match(/\(\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[-–]\s*(\d{1,2})/)
  if (same) {
    const mi = MONTHS3[same[1].slice(0, 3).toLowerCase()]
    if (mi != null) return `${MNAMES[mi]} ${+same[2]} – ${MNAMES[mi]} ${+same[3]}`
  }
  return null
}

/** The canvas's start date (ms) for sorting: the campaign name's start date if it
 *  has one, else the earliest asset date, else +Infinity (undated → sorts last). */
function canvasStartMs(name: string, rows: { scheduledAt?: string }[]): number {
  const m = name.match(/\(\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})\b/)
  if (m) {
    const mi = MONTHS3[m[1].slice(0, 3).toLowerCase()]
    if (mi != null) {
      const yr = name.match(/(20\d{2})/)
      return +new Date(yr ? +yr[1] : new Date().getFullYear(), mi, +m[2])
    }
  }
  const times = rows.map((r) => (r.scheduledAt ? +new Date(r.scheduledAt) : NaN)).filter((t) => !Number.isNaN(t))
  return times.length ? Math.min(...times) : Infinity
}

export function ClientsOverview() {
  const { canvases } = useHomeCanvases()
  const filter = useTrafficStore((s) => s.homeFilter)
  const openCampaign = useTrafficStore((s) => s.openCampaign)
  const openOnboard = useTrafficStore((s) => s.openOnboard)
  const loadSample = useTrafficStore((s) => s.loadSample)
  const setMessagingBrand = useTrafficStore((s) => s.setMessagingBrand)
  const deleteCampaign = useTrafficStore((s) => s.deleteCampaign)
  // A canvas delete asks for a second click first (it archives the whole canvas +
  // its assets — recoverable, but not one-click-accidental).
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  // How the gallery is ordered: 'recent' (last touched) or 'date' (campaign start).
  const [sort, setSort] = useState<'recent' | 'date'>('recent')

  // Inside a brand folder you flip between its Canvases, the combined Grid and
  // Calendar (every canvas in the folder on one table / one timeline), About, and
  // Messaging.
  const brandFolder = filter.startsWith('brand:') ? filter.slice(6) : null
  const [folderTab, setFolderTab] = useState<
    'canvases' | 'grid' | 'calendar' | 'about' | 'voice' | 'personalization' | 'messaging'
  >('canvases')
  // Leaving a brand folder (or switching brands) snaps back to Canvases.
  useEffect(() => {
    setFolderTab('canvases')
  }, [filter])

  // The brand-folder header, shared by every tab view so the chrome doesn't move
  // between them. Three zones: brand title (left), the view switcher centered (the
  // three ways to look at the same folder — Canvases / Grid / Calendar), and the
  // secondary About / Messaging nav (right), which aren't views of the content.
  const folderHead = brandFolder && (
    <div className="home-main-head folder-head">
      <h1 className="home-main-title">{brandFolder}</h1>
      <div className="folder-tabs folder-views">
        <button className={`folder-tab${folderTab === 'canvases' ? ' active' : ''}`} onClick={() => setFolderTab('canvases')}>
          Canvases
        </button>
        <button
          className={`folder-tab${folderTab === 'grid' ? ' active' : ''}`}
          onClick={() => setFolderTab('grid')}
          title="Every canvas in this folder, combined into one grid"
        >
          Grid
        </button>
        <button
          className={`folder-tab${folderTab === 'calendar' ? ' active' : ''}`}
          onClick={() => setFolderTab('calendar')}
          title="Every canvas in this folder on one calendar"
        >
          Calendar
        </button>
      </div>
      <div className="folder-tabs folder-aux">
        <button className={`folder-tab${folderTab === 'about' ? ' active' : ''}`} onClick={() => setFolderTab('about')}>
          About
        </button>
        <button
          className={`folder-tab${folderTab === 'voice' ? ' active' : ''}`}
          onClick={() => setFolderTab('voice')}
          title="How the brand sounds — the tone canvases are generated in"
        >
          Voice
        </button>
        <button
          className={`folder-tab${folderTab === 'personalization' ? ' active' : ''}`}
          onClick={() => setFolderTab('personalization')}
          title="The dimensions and values the brand personalizes across"
        >
          Personalization
        </button>
        <button
          className={`folder-tab${folderTab === 'messaging' ? ' active' : ''}`}
          onClick={() => {
            setMessagingBrand(brandFolder)
            setFolderTab('messaging')
          }}
        >
          Messaging
        </button>
      </div>
    </div>
  )

  const shown = useMemo(() => {
    let list = canvases
    if (filter === 'drafts') list = canvases.filter((c) => c.client === DRAFTS_SPACE)
    else if (filter === 'flagged') list = canvases.filter((c) => c.flagged)
    else if (filter === 'live') list = canvases.filter((c) => c.status === 'active')
    else if (filter.startsWith('brand:')) {
      const b = filter.slice(6)
      list = canvases.filter((c) => c.client === b)
    }
    return [...list].sort((a, b) =>
      sort === 'date'
        ? canvasStartMs(a.name, a.rows) - canvasStartMs(b.name, b.rows) || a.name.localeCompare(b.name)
        : b.lastTouched - a.lastTouched || a.name.localeCompare(b.name),
    )
  }, [canvases, filter, sort])

  const title = filter.startsWith('brand:')
    ? filter.slice(6)
    : filter === 'drafts'
      ? 'Drafts'
      : filter === 'flagged'
        ? 'Flagged'
        : filter === 'live'
          ? 'Live'
          : 'All canvases'

  // A brand folder's combined Grid / Calendar: every canvas in the folder on one
  // table / one timeline, scoped to this brand across all its campaigns. These fill
  // the column (flex, not the document scroll), so the view owns its own height.
  if (brandFolder && (folderTab === 'grid' || folderTab === 'calendar')) {
    return (
      <HomeShell>
        <div className="home-main-page folder-combined">
          {folderHead}
          <div className="folder-view">
            {folderTab === 'grid' ? (
              <SheetGrid scopeClient={brandFolder} />
            ) : (
              <CalendarView scopeClient={brandFolder} />
            )}
          </div>
        </div>
      </HomeShell>
    )
  }

  // A brand folder's Messaging system or About tab: render the embedded editor.
  if (brandFolder && folderTab === 'messaging') {
    return (
      <HomeShell>
        <div className="home-main-scroll">
          {folderHead}
          <LibraryPage inline />
        </div>
      </HomeShell>
    )
  }
  if (brandFolder && folderTab === 'about') {
    return (
      <HomeShell>
        <div className="home-main-scroll">
          {folderHead}
          <BrandInfo brand={brandFolder} />
        </div>
      </HomeShell>
    )
  }
  if (brandFolder && folderTab === 'voice') {
    return (
      <HomeShell>
        <div className="home-main-scroll">
          {folderHead}
          <BrandVoice brand={brandFolder} />
        </div>
      </HomeShell>
    )
  }
  if (brandFolder && folderTab === 'personalization') {
    return (
      <HomeShell>
        <div className="home-main-scroll">
          {folderHead}
          <BrandPersonalization brand={brandFolder} />
        </div>
      </HomeShell>
    )
  }

  return (
    <HomeShell>
      <div className="home-main-scroll">
        {brandFolder ? (
          folderHead
        ) : (
          <div className="home-main-head">
            <h1 className="home-main-title">{title}</h1>
          </div>
        )}

        {shown.length === 0 ? (
          <div className="home-empty">
            {canvases.length === 0 ? (
              <>
                No canvases yet.{' '}
                <button className="home-link" onClick={openOnboard}>
                  Set up a brand
                </button>{' '}
                or{' '}
                <button className="home-link" onClick={loadSample}>
                  load sample data
                </button>
                .
              </>
            ) : (
              'No canvases here yet.'
            )}
          </div>
        ) : (
          <>
          <div className="home-sort">
            <span className="home-sort-label">Sort</span>
            <div className="folder-tabs">
              <button className={`folder-tab${sort === 'recent' ? ' active' : ''}`} onClick={() => setSort('recent')}>
                Most recent
              </button>
              <button className={`folder-tab${sort === 'date' ? ' active' : ''}`} onClick={() => setSort('date')}>
                Date
              </button>
            </div>
          </div>
          <div className="hub-recents home-gallery">
            {shown.map((c) => (
              <div key={`${c.client}|${c.name}`} className="hub-recent-wrap">
                <button
                  className="hub-recent"
                  onClick={() => openCampaign(c.name)}
                  title={`Open ${c.name}${c.client ? ` (${c.client})` : ''}`}
                >
                  <div className="hub-recent-foot">
                    <span className={`hub-recent-dot s-${c.status}`} />
                    <span className="hub-recent-foot-text">
                      <span className="hub-recent-name">{c.name}</span>
                      <span className="hub-recent-sub">
                        {c.client || 'Drafts'}
                        {c.lastTouched ? ` · ${fmtAgo(c.lastTouched)}` : ''}
                      </span>
                    </span>
                    {(() => {
                      const range = nameRange(c.name) ?? dateRange(c.rows)
                      return range ? <span className="hub-recent-dates">◷ {range}</span> : null
                    })()}
                  </div>
                </button>
                <button
                  className={`hub-recent-del${confirmDel === c.name ? ' confirm' : ''}`}
                  title={confirmDel === c.name ? 'Click again to delete this canvas' : 'Delete canvas'}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirmDel === c.name) {
                      void deleteCampaign(c.name)
                      setConfirmDel(null)
                    } else {
                      setConfirmDel(c.name)
                    }
                  }}
                  onMouseLeave={() => confirmDel === c.name && setConfirmDel(null)}
                >
                  {confirmDel === c.name ? 'Delete?' : '🗑'}
                </button>
              </div>
            ))}
          </div>
          </>
        )}
      </div>
    </HomeShell>
  )
}
