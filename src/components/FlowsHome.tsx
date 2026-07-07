import { useState } from 'react'
import { CHANNELS } from '../domain/channels'
import { clientForCampaign } from '../domain/clients'
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
}

const STATUS_RANK: Record<CampaignStatus, number> = { active: 0, 'in-review': 1, planning: 2, completed: 3 }

export function FlowsHome({ brand, onOpen, onNew }: { brand: string; onOpen: (name: string) => void; onNew: () => void }) {
  const rows = useTrafficStore((s) => s.rows)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const campaignFolders = useTrafficStore((s) => s.campaignFolders)
  const createCampaignFolder = useTrafficStore((s) => s.createCampaignFolder)
  const setCampaignFolder = useTrafficStore((s) => s.setCampaignFolder)
  const deleteCampaignFolder = useTrafficStore((s) => s.deleteCampaignFolder)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolder, setNewFolder] = useState('')

  const folders = campaignFolders[brand] ?? []
  const brandRows = rows.filter((r) => clientForCampaign(r.campaign) === brand)
  const forBrand = campaignList.filter((c) => c.client === brand && !c.archivedAt)
  const meta = new Map(forBrand.map((c) => [c.name, c] as const))
  const names = [
    ...new Set([
      ...brandRows.map((r) => (r.campaign ?? '').trim()).filter(Boolean),
      ...forBrand.map((c) => c.name),
    ]),
  ]
  const cards: FlowCard[] = names.map((name) => {
    const cRows = brandRows.filter((r) => (r.campaign ?? '').trim() === name)
    return {
      name,
      status: deriveCampaignStatus(meta.get(name), cRows),
      assetCount: cRows.length,
      types: new Set(cRows.map((r) => `${r.channel}/${r.assetType}`)).size,
      channels: [...new Set(cRows.map((r) => r.channel))] as ChannelId[],
      folder: meta.get(name)?.folder,
    }
  })
  const sortCards = (arr: FlowCard[]) =>
    [...arr].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.assetCount - a.assetCount)
  const unfiled = sortCards(cards.filter((c) => !c.folder || !folders.includes(c.folder)))

  const addFolder = () => {
    if (newFolder.trim()) createCampaignFolder(brand, newFolder.trim())
    setNewFolder('')
    setNewFolderOpen(false)
  }

  const renderCard = (c: FlowCard) => (
    <div key={c.name} className="flow-home-card">
      <select
        className="flow-home-move"
        value={c.folder && folders.includes(c.folder) ? c.folder : ''}
        onChange={(e) => setCampaignFolder(c.name, e.target.value || undefined)}
        title="Move to folder"
      >
        <option value="">Unfiled</option>
        {folders.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <button className="flow-home-card-open" onClick={() => onOpen(c.name)}>
        <div className="flow-home-card-name">
          <span className={`flow-home-dot s-${c.status}`} aria-hidden="true" />
          {c.name.replace(`${brand} — `, '')}
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

  return (
    <div className="flow-home">
      <header className="flow-home-head">
        <div>
          <h1 className="flow-home-title">Flows</h1>
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
            ＋ New flow
          </button>
        </div>
      </header>

      <div className="flow-home-groups">
        {folders.map((folder) => {
          const group = sortCards(cards.filter((c) => c.folder === folder))
          return (
            <section key={folder} className="flow-home-group">
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
                <div className="flow-home-empty-folder">Empty. Use the folder menu on a flow card to file it here.</div>
              ) : (
                <div className="flow-home-grid">{group.map(renderCard)}</div>
              )}
            </section>
          )
        })}

        <section className="flow-home-group">
          <div className="flow-home-group-h">
            {folders.length ? 'Unfiled' : 'All flows'}
            <span className="flow-home-group-n">{unfiled.length}</span>
          </div>
          {unfiled.length === 0 ? (
            <div className="flow-home-empty-folder">No flows here yet.</div>
          ) : (
            <div className="flow-home-grid">{unfiled.map(renderCard)}</div>
          )}
        </section>
      </div>
    </div>
  )
}
