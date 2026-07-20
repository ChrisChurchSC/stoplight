import { useRef, useState, type DragEvent } from 'react'
import { CHANNELS } from '../domain/channels'
import { clientForCampaign } from '../domain/clients'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { deriveCampaignStatus, type CampaignStatus } from '../domain/lifecycle'
import type { ChannelId } from '../domain/types'
import { flightForRow } from '../domain/flight'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { InfoTip } from './InfoTip'

/**
 * The Flows landing page: every one of a brand's campaigns shown as a flow card, organized
 * into FOLDERS (reusing the shared campaign-folder system, so a flow's folder is the same
 * whether seen here or in Campaigns). Create folders, file flows into them, and click a card
 * to open that flow in the canvas. Mirrors the Campaigns overview.
 */
interface FlowCard {
  name: string
  status: CampaignStatus
  assetCount: number
  types: number
  channels: ChannelId[]
  folder?: string
  /** Umbrella parent campaign name, when this is an audience-specific child. */
  parent?: string
  /** The single audience this campaign is personalized to (its segment reference label). */
  personalizedTo?: string
  /** This campaign's flights (one scheduled run each), for the overview + folder drill-in. */
  flights: { id: string; name: string; assetCount: number; types: number; channels: ChannelId[]; start: number; end: number }[]
  /** A manually-created umbrella container (renders as an umbrella even with no children yet). */
  isUmbrella?: boolean
}

const STATUS_RANK: Record<CampaignStatus, number> = { active: 0, 'in-review': 1, planning: 2, completed: 3 }

export function FlowsHome({ brand, onOpen, onNew }: { brand: string; onOpen: (name: string) => void; onNew: () => void }) {
  const rows = useTrafficStore((s) => s.rows)
  const flights = useTrafficStore((s) => s.flights)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const campaignFolders = useTrafficStore((s) => s.campaignFolders)
  const createCampaignFolder = useTrafficStore((s) => s.createCampaignFolder)
  const setCampaignFolder = useTrafficStore((s) => s.setCampaignFolder)
  const deleteCampaignFolder = useTrafficStore((s) => s.deleteCampaignFolder)
  const deleteCampaign = useTrafficStore((s) => s.deleteCampaign)
  const renameCampaign = useTrafficStore((s) => s.renameCampaign)
  const addCampaign = useTrafficStore((s) => s.addCampaign)
  const setNewCampaignParent = useTrafficStore((s) => s.setNewCampaignParent)
  const addFlightRun = useTrafficStore((s) => s.addFlightRun)
  const patchFlight = useTrafficStore((s) => s.patchFlight)
  const removeFlight = useTrafficStore((s) => s.removeFlight)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolder, setNewFolder] = useState('')
  const [newUmbrellaOpen, setNewUmbrellaOpen] = useState(false)
  const [newUmbrella, setNewUmbrella] = useState('')
  const [flightPickerOpen, setFlightPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  // Flight pending deletion (folder view): its id + display name + asset count for the confirm modal.
  const [confirmDeleteFlight, setConfirmDeleteFlight] = useState<{ id: string; name: string; count: number } | null>(null)
  // A multi-flight campaign drilled into like a folder: shows its flights as rows. null = grid view.
  const [openFolder, setOpenFolder] = useState<string | null>(null)
  // Inline rename in progress. kind distinguishes a campaign/umbrella (key = full campaign name) from
  // a flight (key = flight id). value holds the editable text (short name for campaigns).
  const [renaming, setRenaming] = useState<{ kind: 'campaign' | 'flight'; key: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Escape cancels a rename; guards against the input's onBlur firing a stray commit right after.
  const renameSkipRef = useRef(false)
  const brandPrefix = `${brand} — `
  const startRename = (kind: 'campaign' | 'flight', key: string, current: string) => {
    renameSkipRef.current = false
    setRenaming({ kind, key })
    setRenameValue(current)
  }
  const commitRename = () => {
    if (renameSkipRef.current) {
      renameSkipRef.current = false
      setRenaming(null)
      setRenameValue('')
      return
    }
    if (!renaming) return
    const v = renameValue.trim()
    if (v) {
      if (renaming.kind === 'flight') {
        patchFlight(renaming.key, { name: v })
      } else {
        const nextFull = renaming.key.startsWith(brandPrefix) ? brandPrefix + v : v
        void renameCampaign(renaming.key, nextFull)
      }
    }
    setRenaming(null)
    setRenameValue('')
  }
  const cancelRename = () => {
    renameSkipRef.current = true
    setRenaming(null)
    setRenameValue('')
  }
  // Shared inline rename input for cards/heads/flights.
  const renameInput = (placeholder: string) => (
    <input
      className="flow-home-rename-input"
      autoFocus
      placeholder={placeholder}
      value={renameValue}
      onChange={(e) => setRenameValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commitRename}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commitRename()
        if (e.key === 'Escape') cancelRename()
      }}
    />
  )
  const addUmbrella = () => {
    const nm = newUmbrella.trim()
    if (nm && brand) addCampaign({ name: `${brand} — ${nm}`, client: brand, strategy: 'content-seo', isUmbrella: true })
    setNewUmbrella('')
    setNewUmbrellaOpen(false)
  }
  // Open the campaign builder to create a campaign nested under an umbrella.
  const addCampaignUnder = (umbrella: string) => {
    setNewCampaignParent(umbrella)
    onNew()
  }
  // Drag a flow card onto a folder section to file it there (replaces the folder dropdown).
  const [dragName, setDragName] = useState<string | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)
  // A flight's month window, e.g. "Sep" or "Sep - Oct".
  const flightWindow = (start: number, end: number) => {
    const mo = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short' })
    return mo(start) === mo(end) ? mo(start) : `${mo(start)} - ${mo(end)}`
  }
  // Umbrellas that are collapsed (children hidden). Default expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleUmbrella = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  const sectionDrop = (folder: string | undefined) => {
    const key = folder ?? '__unfiled__'
    return {
      active: dropKey === key,
      onDragOver: (e: DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (dropKey !== key) setDropKey(key)
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        const n = e.dataTransfer.getData('text/plain')
        if (n) setCampaignFolder(n, folder)
        setDropKey(null)
        setDragName(null)
      },
    }
  }

  const folders = campaignFolders[brand] ?? []
  const brandRows = rows.filter((r) => !r.archivedAt && clientForCampaign(r.campaign) === brand)
  const forBrand = campaignList.filter((c) => c.client === brand && !c.archivedAt)
  const meta = new Map(forBrand.map((c) => [c.name, c] as const))
  const names = [
    ...new Set([
      ...brandRows.map((r) => (r.campaign ?? '').trim()).filter(Boolean),
      ...forBrand.map((c) => c.name),
    ]),
    // The content library archive ("Published content") isn't a flow — it's where every
    // ingested/published asset lives, so keep it out of the Flows list (delete it here
    // would archive the whole library). It stays reachable under Library.
  ].filter((n) => n !== CONTENT_LIBRARY_CAMPAIGN)
  const cards: FlowCard[] = names.map((name) => {
    const cRows = brandRows.filter((r) => (r.campaign ?? '').trim() === name)
    // This campaign's flights, each with its resolved assets and derived window.
    const campFlights = flights
      .filter((f) => f.campaign === name)
      .map((f) => {
        const fRows = cRows.filter((r) => flightForRow(r, flights)?.id === f.id)
        const times = fRows.map((r) => Date.parse(r.scheduledAt)).filter((t) => !Number.isNaN(t))
        const start = times.length ? Math.min(...times) : Date.parse(f.startAt)
        const end = times.length ? Math.max(...times) : start
        return {
          id: f.id,
          name: f.name,
          assetCount: fRows.length,
          types: new Set(fRows.map((r) => `${r.channel}/${r.assetType}`)).size,
          channels: [...new Set(fRows.map((r) => r.channel))] as ChannelId[],
          start,
          end,
        }
      })
      .sort((a, b) => a.start - b.start)
    return {
      name,
      status: deriveCampaignStatus(meta.get(name), cRows),
      assetCount: cRows.length,
      types: new Set(cRows.map((r) => `${r.channel}/${r.assetType}`)).size,
      channels: [...new Set(cRows.map((r) => r.channel))] as ChannelId[],
      folder: meta.get(name)?.folder,
      parent: meta.get(name)?.parent,
      personalizedTo: meta.get(name)?.references?.find((r) => r.type === 'segment')?.label,
      flights: campFlights,
      isUmbrella: meta.get(name)?.isUmbrella,
    }
  })
  const sortCards = (arr: FlowCard[]) =>
    [...arr].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.assetCount - a.assetCount)
  // Umbrella grouping: children (audience-specific campaigns) nest under their parent; a child whose
  // parent no longer exists falls back to top level. Folder grouping operates on top-level cards only.
  const childrenByParent = new Map<string, FlowCard[]>()
  for (const c of cards)
    if (c.parent && meta.has(c.parent)) {
      const arr = childrenByParent.get(c.parent) ?? []
      arr.push(c)
      childrenByParent.set(c.parent, arr)
    }
  const topCards = cards.filter((c) => !(c.parent && meta.has(c.parent)))
  // Campaigns you can add a flight to (real campaigns that have assets, not umbrellas).
  const flightable = cards.filter((c) => !c.isUmbrella && c.flights.length > 0)
  const unfiled = sortCards(topCards.filter((c) => !c.folder || !folders.includes(c.folder)))

  const addFolder = () => {
    if (newFolder.trim()) createCampaignFolder(brand, newFolder.trim())
    setNewFolder('')
    setNewFolderOpen(false)
  }

  const renderCard = (c: FlowCard) => {
    // A campaign with more than one flight behaves like a folder: clicking it drills into the
    // flight list rather than opening the canvas directly.
    const isFolder = c.flights.length > 1
    const isRenaming = renaming?.kind === 'campaign' && renaming.key === c.name
    const short = c.name.replace(brandPrefix, '')
    return (
      <div
        key={c.name}
        className={`flow-home-card${isFolder ? ' is-folder' : ''}${dragName === c.name ? ' dragging' : ''}`}
        data-flights={isFolder ? Math.min(c.flights.length, 5) : undefined}
        draggable={!isRenaming}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', c.name)
          e.dataTransfer.effectAllowed = 'move'
          setDragName(c.name)
        }}
        onDragEnd={() => {
          setDragName(null)
          setDropKey(null)
        }}
      >
        {!isRenaming && (
          <div className="flow-home-card-actions">
            <button className="flow-home-rename" title="Rename" aria-label="Rename" onClick={() => startRename('campaign', c.name, short)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </button>
            <button className="flow-home-del" title="Delete flow" aria-label="Delete flow" onClick={() => setConfirmDelete(c.name)}>
              ✕
            </button>
          </div>
        )}
        {isRenaming ? (
          <div className="flow-home-card-open flow-home-card-renaming">{renameInput('Campaign name')}</div>
        ) : (
        <button className="flow-home-card-open" onClick={() => (isFolder ? setOpenFolder(c.name) : onOpen(c.name))}>
          <div className="flow-home-card-name">
            {isFolder && (
              <span className="flow-home-card-folder-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              </span>
            )}
            <span className={`flow-home-dot s-${c.status}`} aria-hidden="true" />
            <span className="flow-home-card-title-text">{c.name.replace(`${brand} — `, '')}</span>
            {c.personalizedTo && (
              <span className="flow-home-persona" title={`Personalized to ${c.personalizedTo}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="3.2" />
                  <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
                </svg>
                <span>{c.personalizedTo}</span>
              </span>
            )}
          </div>
          <div className="flow-home-card-meta">
            {c.types} deliverable{c.types === 1 ? '' : 's'} · {c.assetCount} asset{c.assetCount === 1 ? '' : 's'}
            {isFolder ? ` · ${c.flights.length} flights` : ''}
          </div>
          <div className="flow-home-chans">
            {c.channels.slice(0, 8).map((ch) => (
              <span key={ch} className="flow-home-chan-ico" title={CHANNELS[ch]?.label ?? ch}>
                <ChannelIcon channel={ch} size={16} />
              </span>
            ))}
            {c.channels.length > 8 && <span className="flow-home-chan more">+{c.channels.length - 8}</span>}
          </div>
        </button>
        )}
        {!isRenaming && isFolder && (
          <div className="flow-home-card-folder-hint" aria-hidden="true">
            Open campaign →
          </div>
        )}
        {/* Re-run: add another flight of this campaign (clones its assets into a new window). */}
        {!isRenaming && c.flights.length > 0 && (
          <button className="flow-home-flight-add" onClick={() => void addFlightRun(c.name)} title="Add another flight of this campaign (clones its assets into a new window)">
            ＋ Flight
          </button>
        )}
      </div>
    )
  }

  // A top-level entry: an umbrella (its audience-specific children nested + collapsible) or a
  // standalone campaign.
  const renderTop = (c: FlowCard) => {
    const kids = childrenByParent.get(c.name) ?? []
    // An umbrella if it has children OR was explicitly created as one (renders even when empty).
    if (!kids.length && !c.isUmbrella) return renderCard(c)
    const isCollapsed = collapsed.has(c.name)
    const totalAssets = kids.reduce((n, k) => n + k.assetCount, 0)
    const chans = [...new Set(kids.flatMap((k) => k.channels))]
    const isRenaming = renaming?.kind === 'campaign' && renaming.key === c.name
    const short = c.name.replace(brandPrefix, '')
    return (
      <div key={c.name} className="flow-home-umbrella">
        <div className="flow-home-umb-head">
          <button className="flow-home-umb-toggle" onClick={() => toggleUmbrella(c.name)} aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
            {isCollapsed ? '▸' : '▾'}
          </button>
          {isRenaming ? (
            <div className="flow-home-umb-open flow-home-umb-renaming">{renameInput('Umbrella name')}</div>
          ) : (
            <button className="flow-home-umb-open" onClick={() => onOpen(c.name)}>
              <span className={`flow-home-dot s-${c.status}`} aria-hidden="true" />
              <span className="flow-home-umb-name">{short}</span>
              <span className="flow-home-umb-meta">
                {kids.length} campaign{kids.length === 1 ? '' : 's'} · {totalAssets} asset{totalAssets === 1 ? '' : 's'}
              </span>
              <span className="flow-home-chans">
                {chans.slice(0, 8).map((ch) => (
                  <span key={ch} className="flow-home-chan-ico" title={CHANNELS[ch]?.label ?? ch}>
                    <ChannelIcon channel={ch} size={15} />
                  </span>
                ))}
              </span>
            </button>
          )}
          {!isRenaming && (
            <>
              <button className="flow-home-rename" title="Rename umbrella" aria-label="Rename umbrella" onClick={() => startRename('campaign', c.name, short)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </button>
              <button className="flow-home-del" title="Delete umbrella" aria-label="Delete umbrella" onClick={() => setConfirmDelete(c.name)}>
                ✕
              </button>
            </>
          )}
        </div>
        {!isCollapsed && (
          <div className="flow-home-grid nested">
            {sortCards(kids).map(renderCard)}
            <button className="flow-home-add-under" onClick={() => addCampaignUnder(c.name)}>
              ＋ Add a campaign
            </button>
          </div>
        )}
      </div>
    )
  }

  // Drilled into a multi-flight campaign: show its flights as a folder of rows.
  const folderCard = openFolder ? cards.find((c) => c.name === openFolder) : null
  if (folderCard && folderCard.flights.length > 1) {
    const title = folderCard.name.replace(`${brand} — `, '')
    return (
      <div className="flow-home">
        <header className="flow-home-head">
          <div>
            <button className="flow-home-back" onClick={() => setOpenFolder(null)}>
              <span aria-hidden="true">←</span> All campaigns
            </button>
            <h1 className="flow-home-title flow-home-folder-title">
              <span className="flow-home-folder-title-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              </span>
              {title}
            </h1>
            <p className="flow-home-sub">
              {folderCard.flights.length} flights · {folderCard.assetCount} asset{folderCard.assetCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flow-home-actions">
            <button className="flow-home-new" onClick={() => void addFlightRun(folderCard.name)}>
              ＋ Flight
            </button>
            <button className="flow-home-new" onClick={() => onOpen(folderCard.name)}>
              Open in canvas
            </button>
          </div>
        </header>
        <div className="flow-home-grid">
          {folderCard.flights.map((f) => {
            const isRenaming = renaming?.kind === 'flight' && renaming.key === f.id
            return (
            <div key={f.id} className="flow-home-card">
              {!isRenaming && (
                <div className="flow-home-card-actions">
                  <button className="flow-home-rename" title="Rename flight" aria-label="Rename flight" onClick={() => startRename('flight', f.id, f.name)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </svg>
                  </button>
                  <button className="flow-home-del" title="Delete flight" aria-label="Delete flight" onClick={() => setConfirmDeleteFlight({ id: f.id, name: f.name, count: f.assetCount })}>
                    ✕
                  </button>
                </div>
              )}
              {isRenaming ? (
                <div className="flow-home-card-open flow-home-card-renaming">{renameInput('Flight name')}</div>
              ) : (
                <button className="flow-home-card-open" onClick={() => onOpen(folderCard.name)}>
                  <div className="flow-home-card-name">
                    <span className={`flow-home-dot s-${folderCard.status}`} aria-hidden="true" />
                    <span className="flow-home-card-title-text">{f.name}</span>
                  </div>
                  <div className="flow-home-card-meta">
                    {f.types} deliverable{f.types === 1 ? '' : 's'} · {f.assetCount} asset{f.assetCount === 1 ? '' : 's'} · {flightWindow(f.start, f.end)}
                  </div>
                  <div className="flow-home-chans">
                    {f.channels.slice(0, 8).map((ch) => (
                      <span key={ch} className="flow-home-chan-ico" title={CHANNELS[ch]?.label ?? ch}>
                        <ChannelIcon channel={ch} size={16} />
                      </span>
                    ))}
                    {f.channels.length > 8 && <span className="flow-home-chan more">+{f.channels.length - 8}</span>}
                  </div>
                </button>
              )}
            </div>
            )
          })}
        </div>
        {confirmDeleteFlight && (
          <>
            <div className="drawer-scrim" onClick={() => setConfirmDeleteFlight(null)} />
            <div className="confirm-modal" role="dialog" aria-label="Delete flight">
              <strong className="confirm-title">Delete {confirmDeleteFlight.name}?</strong>
              <p className="confirm-text">
                This archives the flight and its {confirmDeleteFlight.count} asset{confirmDeleteFlight.count === 1 ? '' : 's'}. It won't show here anymore.
              </p>
              <div className="confirm-foot">
                <button className="btn sm" onClick={() => setConfirmDeleteFlight(null)}>
                  Cancel
                </button>
                <span className="spacer" />
                <button
                  className="btn sm danger"
                  onClick={() => {
                    void removeFlight(confirmDeleteFlight.id)
                    setConfirmDeleteFlight(null)
                  }}
                >
                  Delete flight
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flow-home">
      <header className="flow-home-head">
        <div>
          <h1 className="flow-home-title">
            Campaigns
            <InfoTip term="campaign" />
          </h1>
          <p className="flow-home-sub">
            {cards.length} flow{cards.length === 1 ? '' : 's'} · {folders.length} folder{folders.length === 1 ? '' : 's'} for {brand || 'this brand'}
          </p>
        </div>
        <div className="flow-home-actions">
          {newFolderOpen ? (
            <input
              className="flow-home-folder-input"
              autoFocus
              placeholder="Folder name"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onBlur={addFolder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addFolder()
                if (e.key === 'Escape') {
                  setNewFolder('')
                  setNewFolderOpen(false)
                }
              }}
            />
          ) : (
            <button className="flow-home-folder-new" onClick={() => setNewFolderOpen(true)}>
              ＋ New folder
            </button>
          )}
          {newUmbrellaOpen ? (
            <input
              className="flow-home-folder-input"
              autoFocus
              placeholder="Umbrella name"
              value={newUmbrella}
              onChange={(e) => setNewUmbrella(e.target.value)}
              onBlur={addUmbrella}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addUmbrella()
                if (e.key === 'Escape') {
                  setNewUmbrella('')
                  setNewUmbrellaOpen(false)
                }
              }}
            />
          ) : (
            <button className="flow-home-folder-new" onClick={() => setNewUmbrellaOpen(true)}>
              ＋ New umbrella
            </button>
          )}
          <div className="flow-home-flightpick">
            <button className="flow-home-new" onClick={() => setFlightPickerOpen((o) => !o)}>
              ＋ New flight
            </button>
            {flightPickerOpen && (
              <>
                <div className="flow-home-flightpick-scrim" onClick={() => setFlightPickerOpen(false)} />
                <div className="flow-home-flightpick-menu" role="menu">
                  <div className="flow-home-flightpick-head">Add a flight to…</div>
                  {flightable.length === 0 ? (
                    <div className="flow-home-flightpick-empty">No campaigns to re-run yet.</div>
                  ) : (
                    flightable.map((c) => (
                      <button
                        key={c.name}
                        className="flow-home-flightpick-item"
                        role="menuitem"
                        onClick={() => {
                          void addFlightRun(c.name)
                          setFlightPickerOpen(false)
                        }}
                      >
                        {c.name.replace(`${brand} — `, '')}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          <button
            className="flow-home-new"
            onClick={() => {
              setNewCampaignParent(null)
              onNew()
            }}
          >
            ＋ New campaign
          </button>
        </div>
      </header>

      <div className="flow-home-groups">
        {folders.map((folder) => {
          const group = sortCards(topCards.filter((c) => c.folder === folder))
          const drop = sectionDrop(folder)
          return (
            <section key={folder} className={`flow-home-group${drop.active ? ' drop-active' : ''}`} onDragOver={drop.onDragOver} onDrop={drop.onDrop}>
              <div className="flow-home-group-h">
                <span className="flow-home-folder-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                </span>
                {folder}
                <span className="flow-home-group-n">{group.length}</span>
                <button className="flow-home-folder-del" title="Delete folder (flows become unfiled)" onClick={() => deleteCampaignFolder(brand, folder)}>
                  ✕
                </button>
              </div>
              {group.length === 0 ? (
                <div className="flow-home-empty-folder">Empty. Drag a campaign here to file it.</div>
              ) : (
                <div className="flow-home-grid">{group.map(renderTop)}</div>
              )}
            </section>
          )
        })}

        {(() => {
          const drop = sectionDrop(undefined)
          return (
            <section className={`flow-home-group${drop.active ? ' drop-active' : ''}`} onDragOver={drop.onDragOver} onDrop={drop.onDrop}>
              <div className="flow-home-group-h">
                {folders.length ? 'Unfiled' : 'All campaigns'}
                <span className="flow-home-group-n">{unfiled.length}</span>
              </div>
              {unfiled.length === 0 ? (
                <div className="flow-home-empty-folder">No flows here yet.</div>
              ) : (
                <div className="flow-home-grid">{unfiled.map(renderTop)}</div>
              )}
            </section>
          )
        })()}
      </div>

      {confirmDelete && (
        <>
          <div className="drawer-scrim" onClick={() => setConfirmDelete(null)} />
          <div className="confirm-modal" role="dialog" aria-label="Delete flow">
            <strong className="confirm-title">Delete {confirmDelete.replace(`${brand} — `, '')}?</strong>
            <p className="confirm-text">This archives the flow and all its assets. It won't show here anymore.</p>
            <div className="confirm-foot">
              <button className="btn sm" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <span className="spacer" />
              <button
                className="btn sm danger"
                onClick={() => {
                  void deleteCampaign(confirmDelete)
                  setConfirmDelete(null)
                }}
              >
                Delete flow
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
