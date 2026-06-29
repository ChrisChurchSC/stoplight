import { useMemo } from 'react'
import { mockAttio } from '../adapters/attio/mockAttio'
import { applyBreakStatus, breakScopeKey, resolveBreaks } from '../domain/breaks'
import { clientForCampaign } from '../domain/clients'
import {
  STATUS_LABEL,
  breaksForCampaign,
  campaignAttention,
  campaignStats,
  deriveCampaignStatus,
  type CampaignAttention,
  type CampaignStatus,
} from '../domain/lifecycle'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The home hub's two launch zones, sitting above the clients directory:
 *  - Jump back in — the campaigns you touched most recently, one click to resume.
 *  - What needs you — a tight, cross-client triage strip of live/near-live work
 *    carrying a flag (coherence, re-check, approval, performance).
 *
 * This is the launchpad layer over the dashboard IA: it answers "take me back to
 * what I was doing" and "what needs my attention" before "start something new"
 * (the create CTAs below) and "take me to a space" (the clients table). It reads
 * across every client, labelling each item with its brand — the agency front door.
 * Both zones self-hide when empty, so a fresh workspace leads with create.
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

interface HubCampaign {
  name: string
  client: string
  status: CampaignStatus
  assets: number
  posted: number
  lastTouched: number
  attention: CampaignAttention
}

export function HomeHub() {
  const rows = useTrafficStore((s) => s.rows)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const openCampaign = useTrafficStore((s) => s.openCampaign)

  const camps = useMemo<HubCampaign[]>(() => {
    // One heuristic break pass across every client (the deep Claude check runs
    // inside a campaign; the hub triage stays light), attributed per campaign.
    const allBreaks = applyBreakStatus(resolveBreaks(rows, null, null, breakScopeKey('all', 'all')), breakStatus)
    const meta = new Map(campaignList.map((c) => [c.name, c] as const))
    const names = [
      ...new Set([
        ...rows.map((r) => (r.campaign ?? '').trim()).filter(Boolean),
        ...campaignList.map((c) => c.name),
      ]),
    ]
    return names.map((name) => {
      const cRows = rows.filter((r) => (r.campaign ?? '').trim() === name)
      const assetNames = new Set(cRows.map((r) => r.assetName))
      let revenue = 0
      for (const n of assetNames) revenue += mockAttio.attributionForAsset(n).wonRevenue
      const spend = cRows.reduce((a, r) => a + (r.spend?.toDate ?? 0), 0)
      const roas = spend > 0 ? revenue / spend : null
      const stats = campaignStats(cRows)
      const lastTouched = cRows.reduce((m, r) => Math.max(m, r.postedAt ?? r.createdAt ?? 0), 0)
      return {
        name,
        client: clientForCampaign(name),
        status: deriveCampaignStatus(meta.get(name), cRows),
        assets: stats.assets,
        posted: stats.posted,
        lastTouched,
        attention: campaignAttention({ rows: cRows, breaks: breaksForCampaign(name, assetNames, allBreaks), roas, spend }),
      }
    })
  }, [rows, campaignList, breakStatus])

  // Recents: campaigns you've actually touched, newest first.
  const recents = camps
    .filter((c) => c.lastTouched > 0)
    .sort((a, b) => b.lastTouched - a.lastTouched)
    .slice(0, 6)

  // Triage: live / near-live work carrying a flag. Planning + completed are left
  // out — drafting is the job in planning, and completed is done.
  const triageAll = camps
    .filter((c) => (c.status === 'active' || c.status === 'in-review') && c.attention.count > 0)
    .sort((a, b) => b.attention.count - a.attention.count || a.client.localeCompare(b.client))
  const triage = triageAll.slice(0, 5)

  if (recents.length === 0 && triageAll.length === 0) return null

  return (
    <div className="hub">
      {recents.length > 0 && (
        <section className="hub-zone">
          <div className="hub-zone-head">
            <h2>Jump back in</h2>
          </div>
          <div className="hub-recents">
            {recents.map((c) => (
              <button
                key={`${c.client}|${c.name}`}
                className={`hub-recent s-${c.status}`}
                onClick={() => openCampaign(c.name)}
                title={`Resume ${c.name} (${c.client})`}
              >
                <span className="hub-recent-client">{c.client}</span>
                <span className="hub-recent-name">{c.name}</span>
                <span className="hub-recent-meta">
                  <span className={`pill s-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                  <span className="hub-recent-stat">
                    {c.assets} asset{c.assets === 1 ? '' : 's'}
                    {c.posted > 0 ? ` · ${c.posted} posted` : ''}
                  </span>
                </span>
                <span className="hub-recent-ago">{fmtAgo(c.lastTouched)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {triageAll.length > 0 && (
        <section className="hub-zone">
          <div className="hub-zone-head">
            <h2>What needs you</h2>
            <span className="hub-zone-count">{triageAll.length}</span>
          </div>
          <div className="hub-triage">
            {triage.map((c) => (
              <button
                key={`${c.client}|${c.name}`}
                className="hub-triage-row"
                onClick={() => openCampaign(c.name)}
                title={`Open ${c.name} (${c.client})`}
              >
                <span className="hub-triage-where">
                  <span className="hub-triage-client">{c.client}</span>
                  <span className="hub-triage-name">{c.name}</span>
                </span>
                <span className="hub-triage-flags">
                  {c.attention.flags.map((f) => (
                    <span key={f.kind} className={`flag k-${f.kind} sev-${f.severity}`}>
                      {f.label}
                    </span>
                  ))}
                </span>
                <span className="hub-triage-go">Open →</span>
              </button>
            ))}
            {triageAll.length > triage.length && (
              <div className="hub-triage-more">+{triageAll.length - triage.length} more need attention</div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
