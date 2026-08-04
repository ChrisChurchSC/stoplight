import { type DragEvent as ReactDragEvent, useEffect, useMemo, useState } from 'react'
import { DRAFTS, folderDepth, folderName, withAncestors } from '../domain/campaignFolders'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { useHomeCanvases, type CanvasCard } from '../lib/useHomeCanvases'
import { DRAFTS_SPACE, useTrafficStore } from '../store/useTrafficStore'
import { CalendarView } from './CalendarView'
import { HomeShell } from './HomeShell'
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
  const setHomeFilter = useTrafficStore((s) => s.setHomeFilter)
  const openCampaign = useTrafficStore((s) => s.openCampaign)
  const openClientWizard = useTrafficStore((s) => s.openClientWizard)
  const loadSample = useTrafficStore((s) => s.loadSample)
  const deleteCampaign = useTrafficStore((s) => s.deleteCampaign)
  const campaignFolders = useTrafficStore((s) => s.campaignFolders)
  const setCampaignFolder = useTrafficStore((s) => s.setCampaignFolder)
  const createCampaignFolder = useTrafficStore((s) => s.createCampaignFolder)
  const renameCampaignFolder = useTrafficStore((s) => s.renameCampaignFolder)
  const deleteCampaignFolder = useTrafficStore((s) => s.deleteCampaignFolder)
  // Which folder the sidebar has scoped the gallery to (null = all folders grouped).
  const folderView = useTrafficStore((s) => s.campaignFolderView)
  const setFolderView = useTrafficStore((s) => s.setCampaignFolderView)
  // A canvas delete asks for a second click first (it archives the whole canvas +
  // its assets — recoverable, but not one-click-accidental).
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  // How the gallery is ordered: 'recent' (last touched) or 'date' (campaign start).
  const [sort, setSort] = useState<'recent' | 'date'>('recent')
  // Folder UI: which are collapsed, the drag target, the new-folder input, an inline
  // rename, and a two-click folder delete. All keyed by folder name; '' = Unfiled.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolder, setNewFolder] = useState('')
  const [editFolder, setEditFolder] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDelFolder, setConfirmDelFolder] = useState<string | null>(null)

  // Inside a brand folder you flip between its Canvases, the combined Grid and
  // Calendar (every canvas in the folder on one table / one timeline), About, and
  // Messaging.
  const brandFolder = filter.startsWith('brand:') ? filter.slice(6) : null
  const [folderTab, setFolderTab] = useState<'canvases' | 'grid' | 'calendar'>('canvases')

  // With a single brand, "All canvases" (filter 'all') and that brand's gallery are the
  // same set of campaigns under two titles. Collapse them: coerce 'all' to the brand so
  // there is one campaigns page, always titled by the brand.
  const brandNames = useMemo(
    () => [...new Set(canvases.map((c) => c.client).filter((b) => b && b !== DRAFTS_SPACE))],
    [canvases],
  )
  useEffect(() => {
    if (brandNames.length === 1 && filter === 'all') setHomeFilter(`brand:${brandNames[0]}`)
  }, [brandNames, filter, setHomeFilter])
  // Leaving a brand folder (or switching brands) snaps back to Canvases and clears any
  // folder scoping so the new brand shows all its folders.
  useEffect(() => {
    setFolderTab('canvases')
    setFolderView(null)
  }, [filter, setFolderView])
  // Picking a folder from the sidebar means "show me the canvases in it".
  useEffect(() => {
    if (folderView !== null) setFolderTab('canvases')
  }, [folderView])

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
    // The published-content archive lives in the Library, not the campaign gallery.
    list = list.filter((c) => c.name !== CONTENT_LIBRARY_CAMPAIGN)
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

  // One canvas card, reused by the flat gallery and the folder sections. Draggable so
  // it can be dropped onto a folder (drag payload = the campaign name).
  const renderCard = (c: CanvasCard) => (
    <div
      key={`${c.client}|${c.name}`}
      className={`hub-recent-wrap${brandFolder ? ' draggable' : ''}`}
      draggable={!!brandFolder}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', c.name)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <button className="hub-recent" onClick={() => openCampaign(c.name)} title={`Open ${c.name}${c.client ? ` (${c.client})` : ''}`}>
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
  )

  // Inside a brand folder, campaigns group under named folders (plus an Unfiled bucket).
  // Folder paths, ancestors included and sorted parent-before-child. This view lists folders flat
  // rather than as a tree, so a nested folder shows its own NAME indented by depth; showing the raw
  // "Year-End Giving/Paid/Meta" path as a heading read as one strangely-named folder.
  const folderNames = brandFolder ? withAncestors(campaignFolders[brandFolder] ?? []) : []
  const cardsInFolder = (folder: string) =>
    shown.filter((c) => (folder ? c.folder === folder : !c.folder || !folderNames.includes(c.folder)))
  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  const onDropTo = (folder: string) => (e: ReactDragEvent) => {
    e.preventDefault()
    const name = e.dataTransfer.getData('text/plain')
    if (name) setCampaignFolder(name, folder || undefined)
    setDragOver(null)
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
                <button className="home-link" onClick={openClientWizard}>
                  Add a brand
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
            {brandFolder && (
              <div className="home-sort-folder">
                {newFolderOpen ? (
                  <input
                    className="folder-new-input"
                    autoFocus
                    placeholder="Folder name…"
                    value={newFolder}
                    onChange={(e) => setNewFolder(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        createCampaignFolder(brandFolder, newFolder)
                        setNewFolder('')
                        setNewFolderOpen(false)
                      }
                      if (e.key === 'Escape') {
                        setNewFolder('')
                        setNewFolderOpen(false)
                      }
                    }}
                    onBlur={() => {
                      if (newFolder.trim()) createCampaignFolder(brandFolder, newFolder)
                      setNewFolder('')
                      setNewFolderOpen(false)
                    }}
                  />
                ) : (
                  <button className="folder-new-btn" onClick={() => setNewFolderOpen(true)}>
                    + New folder
                  </button>
                )}
              </div>
            )}
          </div>
          {brandFolder ? (
            <div className="folder-groups">
              {(folderView === null ? [...folderNames, ''] : [folderView]).map((folder) => {
                const key = folder || '__unfiled__'
                const cards = cardsInFolder(folder)
                // Skip an empty Unfiled bucket when showing everything; a folder picked in
                // the sidebar always renders (even empty) so it stays a drop target.
                if (!folder && cards.length === 0 && folderView === null) return null
                const isCollapsed = collapsed.has(key)
                return (
                  <section
                    key={key}
                    className={`folder-group${dragOver === key ? ' drop-over' : ''}`}
                    style={folder && folderDepth(folder) > 1 ? { marginLeft: (folderDepth(folder) - 1) * 18 } : undefined}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (dragOver !== key) setDragOver(key)
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((p) => (p === key ? null : p))
                    }}
                    onDrop={onDropTo(folder)}
                  >
                    <div className="folder-group-head">
                      <button
                        className="folder-group-toggle"
                        onClick={() => toggleCollapsed(key)}
                        aria-label={isCollapsed ? 'Expand folder' : 'Collapse folder'}
                      >
                        {isCollapsed ? '▸' : '▾'}
                      </button>
                      {editFolder === folder && folder ? (
                        <input
                          className="folder-rename-input"
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              renameCampaignFolder(brandFolder, folder, editName)
                              setEditFolder(null)
                            }
                            if (e.key === 'Escape') setEditFolder(null)
                          }}
                          onBlur={() => {
                            renameCampaignFolder(brandFolder, folder, editName)
                            setEditFolder(null)
                          }}
                        />
                      ) : (
                        <button
                          className="folder-group-name"
                          onClick={() => toggleCollapsed(key)}
                          onDoubleClick={() => {
                            if (folder) {
                              setEditFolder(folder)
                              setEditName(folderName(folder))
                            }
                          }}
                        >
                          {folder ? folderName(folder) : DRAFTS} <span className="folder-group-count">{cards.length}</span>
                        </button>
                      )}
                      {folder && (
                        <div className="folder-group-actions">
                          <button className="folder-act" title="Rename folder" onClick={() => { setEditFolder(folder); setEditName(folderName(folder)) }}>
                            ✎
                          </button>
                          <button
                            className={`folder-act${confirmDelFolder === folder ? ' danger' : ''}`}
                            title={confirmDelFolder === folder ? `Click again to delete (campaigns move to ${DRAFTS})` : 'Delete folder'}
                            onClick={() => {
                              if (confirmDelFolder === folder) {
                                deleteCampaignFolder(brandFolder, folder)
                                setConfirmDelFolder(null)
                              } else setConfirmDelFolder(folder)
                            }}
                            onMouseLeave={() => confirmDelFolder === folder && setConfirmDelFolder(null)}
                          >
                            {confirmDelFolder === folder ? 'Delete?' : '🗑'}
                          </button>
                        </div>
                      )}
                    </div>
                    {!isCollapsed &&
                      (cards.length ? (
                        <div className="hub-recents home-gallery">{cards.map(renderCard)}</div>
                      ) : (
                        <div className="folder-empty">Drag a campaign here</div>
                      ))}
                  </section>
                )
              })}
            </div>
          ) : (
            <div className="hub-recents home-gallery">{shown.map(renderCard)}</div>
          )}
          </>
        )}
      </div>
    </HomeShell>
  )
}
