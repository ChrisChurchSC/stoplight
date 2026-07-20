import { useState, type DragEvent } from 'react'
import { CHANNELS } from '../domain/channels'
import { clientForCampaign } from '../domain/clients'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { deriveCampaignStatus, type CampaignStatus } from '../domain/lifecycle'
import type { ChannelId } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

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
}

const STATUS_RANK: Record<CampaignStatus, number> = { active: 0, 'in-review': 1, planning: 2, completed: 3 }

export function FlowsHome({ brand, onOpen, onNew }: { brand: string; onOpen: (name: string) => void; onNew: () => void }) {
  const rows = useTrafficStore((s) => s.rows)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const campaignFolders = useTrafficStore((s) => s.campaignFolders)
  const createCampaignFolder = useTrafficStore((s) => s.createCampaignFolder)
  const setCampaignFolder = useTrafficStore((s) => s.setCampaignFolder)
  const deleteCampaignFolder = useTrafficStore((s) => s.deleteCampaignFolder)
  const deleteCampaign = useTrafficStore((s) => s.deleteCampaign)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolder, setNewFolder] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  // Drag a flow card onto a folder section to file it there (replaces the folder dropdown).
  const [dragName, setDragName] = useState<string | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)
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
    return {
      name,
      status: deriveCampaignStatus(meta.get(name), cRows),
      assetCount: cRows.length,
      types: new Set(cRows.map((r) => `${r.channel}/${r.assetType}`)).size,
      channels: [...new Set(cRows.map((r) => r.channel))] as ChannelId[],
      folder: meta.get(name)?.folder,
      parent: meta.get(name)?.parent,
      personalizedTo: meta.get(name)?.references?.find((r) => r.type === 'segment')?.label,
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
  const unfiled = sortCards(topCards.filter((c) => !c.folder || !folders.includes(c.folder)))

  const addFolder = () => {
    if (newFolder.trim()) createCampaignFolder(brand, newFolder.trim())
    setNewFolder('')
    setNewFolderOpen(false)
  }

  const renderCard = (c: FlowCard) => (
    <div
      key={c.name}
      className={`flow-home-card${dragName === c.name ? ' dragging' : ''}`}
      draggable
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
      <div className="flow-home-card-actions">
        <button className="flow-home-del" title="Delete flow" aria-label="Delete flow" onClick={() => setConfirmDelete(c.name)}>
          ✕
        </button>
      </div>
      <button className="flow-home-card-open" onClick={() => onOpen(c.name)}>
        <div className="flow-home-card-name">
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
    </div>
  )

  // A top-level entry: an umbrella (its audience-specific children nested + collapsible) or a
  // standalone campaign.
  const renderTop = (c: FlowCard) => {
    const kids = childrenByParent.get(c.name)
    if (!kids?.length) return renderCard(c)
    const isCollapsed = collapsed.has(c.name)
    const totalAssets = kids.reduce((n, k) => n + k.assetCount, 0)
    const chans = [...new Set(kids.flatMap((k) => k.channels))]
    return (
      <div key={c.name} className="flow-home-umbrella">
        <div className="flow-home-umb-head">
          <button className="flow-home-umb-toggle" onClick={() => toggleUmbrella(c.name)} aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
            {isCollapsed ? '▸' : '▾'}
          </button>
          <button className="flow-home-umb-open" onClick={() => onOpen(c.name)}>
            <span className={`flow-home-dot s-${c.status}`} aria-hidden="true" />
            <span className="flow-home-umb-name">{c.name.replace(`${brand} — `, '')}</span>
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
          <button className="flow-home-del" title="Delete umbrella" aria-label="Delete umbrella" onClick={() => setConfirmDelete(c.name)}>
            ✕
          </button>
        </div>
        {!isCollapsed && <div className="flow-home-grid nested">{sortCards(kids).map(renderCard)}</div>}
      </div>
    )
  }

  return (
    <div className="flow-home">
      <header className="flow-home-head">
        <div>
          <h1 className="flow-home-title">Campaigns</h1>
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
          <button className="flow-home-new" onClick={onNew}>
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
