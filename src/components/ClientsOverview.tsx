import { useRef, useState } from 'react'
import { mockAttio } from '../adapters/attio/mockAttio'
import { isGoogleDriveConfigured } from '../adapters/drive'
import { money } from '../domain/budget'
import { clientForCampaign } from '../domain/clients'
import { filesToAssets } from '../lib/files'
import type { TrafficRow } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'

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
  const addAssets = useTrafficStore((s) => s.addAssets)
  const loadSample = useTrafficStore((s) => s.loadSample)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setPage = useTrafficStore((s) => s.setPage)
  const driveLinks = useTrafficStore((s) => s.driveLinks)
  const setDriveLink = useTrafficStore((s) => s.setDriveLink)
  const ingestDriveLink = useTrafficStore((s) => s.ingestDriveLink)

  const [tab, setTab] = useState<Tab>('all')
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [linkClient, setLinkClient] = useState<string | null>(null)
  const [draftUrl, setDraftUrl] = useState('')

  const openLink = (client: string) => {
    setDraftUrl(driveLinks[client] ?? '')
    setLinkClient(client)
  }

  const clientNames = [...new Set(rows.map((r) => clientForCampaign(r.campaign)))]
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

  async function onFiles(files: FileList | null) {
    if (!files) return
    const assets = await filesToAssets(Array.from(files))
    if (assets.length) addAssets(assets)
  }

  return (
    <div className="home">
      <h1 className="home-greeting">Hey Chris, ready to get started?</h1>

      <div className="home-ask">
        <span className="home-ask-ico">✦</span>
        <input placeholder="Ask Rushhour or describe what you'd like to traffic…" />
        <button className="home-ask-send" title="Coming soon" disabled>↑</button>
      </div>

      <div className="home-actions">
        <button className="home-action" onClick={() => inputRef.current?.click()}>
          <span className="home-action-ico">⬆</span>
          <span className="home-action-title">Add assets</span>
          <span className="home-action-sub">Drop creative or links to traffic.</span>
        </button>
        <button className="home-action" onClick={loadSample}>
          <span className="home-action-ico">✦</span>
          <span className="home-action-title">Load sample</span>
          <span className="home-action-sub">Populate a demo book of clients.</span>
        </button>
        <button className="home-action" onClick={() => setPage('connectors')}>
          <span className="home-action-ico">⇄</span>
          <span className="home-action-title">Connect a tool</span>
          <span className="home-action-sub">Clay, Attio, Buffer, Claude.</span>
        </button>
        <button className="home-action" disabled title="Coming soon">
          <span className="home-action-ico">▤</span>
          <span className="home-action-title">New campaign</span>
          <span className="home-action-sub">Start from a brief or template.</span>
        </button>
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
          {all.length === 0 ? 'No clients yet. Load sample or add assets to get started.' : 'No clients match.'}
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

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />

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
    </div>
  )
}
