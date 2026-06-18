import { useState } from 'react'
import { mockAttio } from '../adapters/attio/mockAttio'
import { isGoogleDriveConfigured } from '../adapters/drive'
import { money } from '../domain/budget'
import { clientForCampaign } from '../domain/clients'
import type { TrafficRow } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { NewClientWizard } from './NewClientWizard'

interface ClientRow {
  client: string
  assets: number
  campaigns: number
  revenue: number
  posted: number
  lastActivity: number
}

function summarize(client: string, rows: TrafficRow[]): ClientRow {
  const names = new Set(rows.map((r) => r.assetName))
  let revenue = 0
  for (const n of names) revenue += mockAttio.attributionForAsset(n).wonRevenue
  return {
    client,
    assets: names.size,
    campaigns: new Set(rows.map((r) => (r.campaign ?? '').trim()).filter(Boolean)).size,
    revenue,
    posted: rows.filter((r) => r.status === 'posted').length,
    lastActivity: Math.max(0, ...rows.map((r) => r.postedAt ?? r.createdAt ?? 0)),
  }
}

const fmtDate = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

type Tab = 'all' | 'recents' | 'favorites'

export function ClientsOverview() {
  const rows = useTrafficStore((s) => s.rows)
  const loadSample = useTrafficStore((s) => s.loadSample)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const driveLinks = useTrafficStore((s) => s.driveLinks)
  const setDriveLink = useTrafficStore((s) => s.setDriveLink)
  const ingestDriveLink = useTrafficStore((s) => s.ingestDriveLink)
  const clientList = useTrafficStore((s) => s.clientList)

  const [tab, setTab] = useState<Tab>('all')
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [linkClient, setLinkClient] = useState<string | null>(null)
  const [draftUrl, setDraftUrl] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)

  const openLink = (client: string) => {
    setDraftUrl(driveLinks[client] ?? '')
    setLinkClient(client)
  }

  // Clients = explicitly added + any derived from existing rows.
  const clientNames = [...new Set([...clientList, ...rows.map((r) => clientForCampaign(r.campaign))])]
  const all = clientNames.map((c) =>
    summarize(c, rows.filter((r) => clientForCampaign(r.campaign) === c)),
  )

  let list = all
  if (tab === 'favorites') list = all.filter((c) => favorites.has(c.client))
  if (tab === 'recents') list = [...all].sort((a, b) => b.lastActivity - a.lastActivity)
  else list = [...list].sort((a, b) => a.client.localeCompare(b.client))
  if (q.trim()) list = list.filter((c) => c.client.toLowerCase().includes(q.trim().toLowerCase()))

  const toggleFav = (client: string) =>
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(client)) next.delete(client)
      else next.add(client)
      return next
    })

  return (
    <div className="home">
      <h1 className="home-greeting">Your clients</h1>
      <p className="home-sub">Add a client, then bring their creative in from Drive or upload inside their workspace.</p>

      <div className="home-newclient-cta">
        <button className="home-addclient" onClick={() => setWizardOpen(true)}>
          <span className="home-addclient-ico">＋</span>
          <span>
            <span className="home-addclient-title">Add new client</span>
            <span className="home-addclient-sub">Name, ICP via Clay, then a first campaign.</span>
          </span>
        </button>
        {all.length === 0 && (
          <button className="home-link" onClick={loadSample}>
            or load sample data
          </button>
        )}
      </div>

      <div className="home-tabs">
        {(['all', 'recents', 'favorites'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`home-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'all' ? 'All clients' : t === 'recents' ? 'Recents' : 'Favorites'}
          </button>
        ))}
      </div>

      <div className="home-files-head">
        <h2>Clients</h2>
        <div className="home-search">
          <span className="search-ico">⌕</span>
          <input value={q} placeholder="Search clients…" onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {list.length === 0 ? (
        <div className="home-empty">
          {all.length === 0 ? 'No clients yet. Add your first client above to get started.' : 'No clients match.'}
        </div>
      ) : (
        <table className="home-table">
          <thead>
            <tr>
              <th>Name</th>
              <th />
              <th>Revenue</th>
              <th>Assets</th>
              <th>Campaigns</th>
              <th>Drive folder</th>
              <th>Last activity</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.client} onClick={() => setClientFilter(c.client)}>
                <td className="home-file-name">
                  <span className="home-file-ico">▦</span>
                  {c.client}
                </td>
                <td>
                  <button
                    className={`home-star${favorites.has(c.client) ? ' on' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFav(c.client)
                    }}
                    title="Favorite"
                  >
                    {favorites.has(c.client) ? '★' : '☆'}
                  </button>
                </td>
                <td>{money(c.revenue)}</td>
                <td>{c.assets}</td>
                <td>{c.campaigns}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="btn ghost sm" onClick={() => openLink(c.client)}>
                    {driveLinks[c.client] ? '⬇ Folder linked' : '+ Drive folder'}
                  </button>
                </td>
                <td className="home-muted">{fmtDate(c.lastActivity)}</td>
                <td className="home-owner">
                  <span className="home-owner-dot" /> Chris Church
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {linkClient && (
        <>
          <div className="drawer-scrim" onClick={() => setLinkClient(null)} />
          <div className="drive-modal" role="dialog" aria-label="Drive folder">
            <div className="drive-head">
              <strong>Drive folder · {linkClient}</strong>
              <button className="btn ghost sm" onClick={() => setLinkClient(null)}>
                Close
              </button>
            </div>
            <div className="drive-note">
              Paste a Google Drive folder link — ingesting pulls the files and auto-organizes them by
              folder + filename.{' '}
              {isGoogleDriveConfigured
                ? 'Reads the folder via your Google sign-in (drive.readonly).'
                : 'Demo: ingests sample files. Set VITE_GOOGLE_CLIENT_ID to read real folders.'}
            </div>
            <div className="drive-link-body">
              <input
                className="drive-url-input"
                value={draftUrl}
                placeholder="https://drive.google.com/drive/folders/…"
                onChange={(e) => setDraftUrl(e.target.value)}
                autoFocus
              />
            </div>
            <div className="drive-foot">
              <button
                className="btn sm"
                onClick={() => {
                  setDriveLink(linkClient, draftUrl)
                  setLinkClient(null)
                }}
              >
                Save link
              </button>
              <span className="spacer" />
              <button
                className="btn primary"
                disabled={!draftUrl.trim()}
                onClick={() => {
                  const client = linkClient
                  setDriveLink(client, draftUrl)
                  setLinkClient(null)
                  void ingestDriveLink(client)
                }}
              >
                Ingest assets ↓
              </button>
            </div>
          </div>
        </>
      )}

      {wizardOpen && <NewClientWizard onClose={() => setWizardOpen(false)} />}
    </div>
  )
}
