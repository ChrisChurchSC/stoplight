import { useEffect } from 'react'
import { CHANNEL_LIST, KIND_ORDER, channelsByKind } from '../domain/channels'
import { auditReadiness, readinessSummary } from '../domain/readiness'
import { rtbsForCampaign } from '../domain/rtb'
import { INSTALLED_TRACKING, channelTracking } from '../domain/tracking'
import { rowsToCsv, downloadCsv } from '../lib/csv'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

const initials = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
const webHref = (w: string) => (/^https?:\/\//.test(w) ? w : `https://${w}`)

export function Sidebar() {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const setFilter = useTrafficStore((s) => s.setFilter)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const query = useTrafficStore((s) => s.query)
  const clearSheet = useTrafficStore((s) => s.clearSheet)
  const openTracking = useTrafficStore((s) => s.openTracking)
  const profile = useTrafficStore((s) => s.clientProfiles[clientFilter])
  const icp = useTrafficStore((s) => s.icp)
  const loadIcp = useTrafficStore((s) => s.loadIcp)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setIcpOpen = useTrafficStore((s) => s.setIcpOpen)
  const openAudienceWizard = useTrafficStore((s) => s.openAudienceWizard)
  const brandGuides = useTrafficStore((s) => s.brandGuides)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const driveConnected = useTrafficStore((s) => s.driveConnected)
  const openReadiness = useTrafficStore((s) => s.openReadiness)

  // Surface the ICP in the profile card (not behind a button) — pull it if a
  // client is in view and we don't have one yet.
  useEffect(() => {
    if (clientFilter !== 'all' && !icp) loadIcp()
  }, [clientFilter, icp, loadIcp])

  // Audiences (personas under the ICP) live in the profile card. The card lists
  // them; "+ Add audience" opens the guided flow, and a chip opens the ICP drawer
  // where there's room for full editing (angle, proof, strategy).
  const audiences = clientFilter !== 'all' ? clientAudiences[clientFilter] ?? [] : []

  // Onboarding readiness summary for the profile card chip.
  const readiness =
    clientFilter !== 'all'
      ? readinessSummary(
          auditReadiness({
            hasWebsite: !!profile?.website,
            brandGuide: brandGuides[clientFilter]
              ? { confirmed: brandGuides[clientFilter].confirmed }
              : undefined,
            audienceCount: audiences.length,
            channelConnected: driveConnected,
            rtbCount: campaignList
              .filter((c) => c.client === clientFilter)
              .reduce((n, c) => n + rtbsForCampaign(c.name).length, 0),
            trackingReady: INSTALLED_TRACKING.size > 0,
            crmConnected: false,
          }),
        )
      : null

  // Counts reflect the current client / campaign (and search) scope — NOT the
  // channel filter itself — so each count matches what selecting it actually shows.
  const scopedRows = rows.filter((r) =>
    rowInScope(r, { filter: 'all', query, clientFilter, campaignFilter }),
  )
  const countFor = (id: string) => scopedRows.filter((r) => r.channel === id).length

  // Aggregate tracking readiness across every channel, for the "All channels" row.
  const allTracking = CHANNEL_LIST.map((c) => channelTracking(c.id))
  const trReady = allTracking.reduce((n, t) => n + t.ready, 0)
  const trTotal = allTracking.reduce((n, t) => n + t.total, 0)
  const trChannelsNeeding = allTracking.filter((t) => t.ready < t.total).length
  const allTrCls = trReady === trTotal ? 'ok' : trReady === 0 ? 'none' : 'partial'
  const allTrTitle = `Infrastructure ${trReady}/${trTotal} set up across all channels${
    trChannelsNeeding ? ` — ${trChannelsNeeding} channel${trChannelsNeeding === 1 ? '' : 's'} need setup` : ''
  }`

  return (
    <aside className="sidebar">
      <div className="sidebar-client">
        <div className="sidebar-client-head">
          <span className="sidebar-client-avatar">{initials(clientFilter)}</span>
          <div className="sidebar-client-id">
            <div className="sidebar-client-name" title={clientFilter}>
              {clientFilter}
            </div>
            {profile?.industry && <div className="sidebar-client-industry">{profile.industry}</div>}
          </div>
        </div>
        {profile?.website && (
          <a
            className="sidebar-client-web"
            href={webHref(profile.website)}
            target="_blank"
            rel="noreferrer"
          >
            ↗ {profile.website}
          </a>
        )}
        {profile?.voice && <div className="sidebar-client-voice">“{profile.voice}”</div>}

        {readiness && (
          <button
            className={`sidebar-readiness${readiness.tier1Gaps > 0 ? ' warn' : ' ok'}`}
            onClick={openReadiness}
            title="Onboarding readiness — what the product needs to do its job"
          >
            <span className="sidebar-readiness-dot" />
            <span className="sidebar-readiness-label">Readiness</span>
            <span className="sidebar-readiness-count">
              {readiness.ready}/{readiness.total}
              {readiness.tier1Gaps > 0 ? ` · ${readiness.tier1Gaps} to set up` : ' · ready'}
            </span>
          </button>
        )}

        {icp && (
          <div className="sidebar-icp">
            <div className="sidebar-icp-label">ICP · via Claude</div>
            <div className="sidebar-icp-name">{icp.name}</div>
            {icp.segment && <div className="sidebar-icp-seg">{icp.segment}</div>}
            {icp.pains?.length > 0 && (
              <div className="sidebar-icp-pains">
                {icp.pains.slice(0, 4).map((p) => (
                  <span key={p} className="sidebar-icp-pain">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {clientFilter !== 'all' && (
          <div className="sidebar-aud">
            <div className="sidebar-aud-label">
              Audiences
              {audiences.length > 0 && <span className="sidebar-aud-count">{audiences.length}</span>}
            </div>
            {audiences.length > 0 && (
              <div className="sidebar-aud-list">
                {audiences.map((a) => (
                  <button
                    key={a.id}
                    className="sidebar-aud-chip"
                    title={a.messageAngle || 'Edit audience in ICP drawer'}
                    onClick={() => setIcpOpen(true)}
                  >
                    {a.name || 'Untitled audience'}
                  </button>
                ))}
              </div>
            )}
            <button className="sidebar-aud-add" onClick={openAudienceWizard}>
              ＋ Add audience
            </button>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          <span className="nav-ico">▦</span>
          <span className="nav-label">All channels</span>
          <span
            className="nav-track"
            role="button"
            tabIndex={0}
            title={`${allTrTitle} — click for detail`}
            onClick={(e) => {
              e.stopPropagation()
              openTracking('all')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                openTracking('all')
              }
            }}
          >
            <span className={`nav-track-dot ${allTrCls}`} />
          </span>
          <span className="nav-count">{scopedRows.length}</span>
        </button>

        {KIND_ORDER.map((section) => (
          <div key={section.kind}>
            <div className="nav-section">{section.label}</div>
            {channelsByKind(section.kind).map((c) => {
              const tr = channelTracking(c.id)
              const missing = tr.items.filter((x) => !x.installed).map((x) => x.item.label)
              const trCls = tr.ready === tr.total ? 'ok' : tr.ready === 0 ? 'none' : 'partial'
              return (
                <button
                  key={c.id}
                  className={`nav-item${filter === c.id ? ' active' : ''}`}
                  onClick={() => setFilter(c.id)}
                >
                  <span className="nav-logo">
                    <ChannelIcon channel={c.id} size={15} />
                  </span>
                  <span className="nav-label">{c.label}</span>
                  <span
                    className="nav-track"
                    role="button"
                    tabIndex={0}
                    title={`Infrastructure ${tr.ready}/${tr.total} set up${missing.length ? ` — needs ${missing.join(', ')}` : ''} — click for detail`}
                    onClick={(e) => {
                      e.stopPropagation()
                      openTracking(c.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        openTracking(c.id)
                      }
                    }}
                  >
                    <span className={`nav-track-dot ${trCls}`} />
                  </span>
                  <span className="nav-count">{countFor(c.id)}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button
          className="nav-item"
          disabled={rows.length === 0}
          onClick={() => downloadCsv('rushhour-sheet.csv', rowsToCsv(rows))}
        >
          <span className="nav-ico">⤓</span>
          <span className="nav-label">Export CSV</span>
        </button>
        <button className="nav-item" disabled={rows.length === 0} onClick={clearSheet}>
          <span className="nav-ico">🗑</span>
          <span className="nav-label">Clear sheet</span>
        </button>
      </div>
    </aside>
  )
}
