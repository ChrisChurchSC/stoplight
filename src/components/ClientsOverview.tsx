import { useEffect, useMemo, useState } from 'react'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { DRAFTS_SPACE, useTrafficStore } from '../store/useTrafficStore'
import { BrandInfo } from './BrandInfo'
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

export function ClientsOverview() {
  const { canvases } = useHomeCanvases()
  const filter = useTrafficStore((s) => s.homeFilter)
  const openCampaign = useTrafficStore((s) => s.openCampaign)
  const openOnboard = useTrafficStore((s) => s.openOnboard)
  const loadSample = useTrafficStore((s) => s.loadSample)
  const setMessagingBrand = useTrafficStore((s) => s.setMessagingBrand)

  // Inside a brand folder you flip between its Canvases, the combined Grid and
  // Calendar (every canvas in the folder on one table / one timeline), About, and
  // Messaging.
  const brandFolder = filter.startsWith('brand:') ? filter.slice(6) : null
  const [folderTab, setFolderTab] = useState<'canvases' | 'grid' | 'calendar' | 'about' | 'voice' | 'messaging'>(
    'canvases',
  )
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
    return [...list].sort((a, b) => b.lastTouched - a.lastTouched || a.name.localeCompare(b.name))
  }, [canvases, filter])

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
          <div className="hub-recents home-gallery">
            {shown.map((c) => (
              <button
                key={`${c.client}|${c.name}`}
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
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </HomeShell>
  )
}
