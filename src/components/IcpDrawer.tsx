import { useEffect } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import type { CampaignVerdict } from '../adapters/icp/types'
import { newAudience, normalizeAudience, type AudienceType } from '../domain/audiences'
import { CHANNEL_LIST } from '../domain/channels'
import type { ChannelId } from '../domain/types'
import { GTM_STRATEGIES } from '../domain/strategies'
import { rtbCoverage, rtbsForCampaign } from '../domain/rtb'
import { rowInScope } from '../lib/scope'
import { ChannelIcon } from './ChannelIcon'

const VERDICT_LABEL: Record<CampaignVerdict, string> = {
  coherent: 'Coherent',
  mixed: 'Mixed',
  incoherent: 'Incoherent',
}

export function IcpDrawer() {
  const open = useTrafficStore((s) => s.icpOpen)
  const setIcpOpen = useTrafficStore((s) => s.setIcpOpen)
  const icp = useTrafficStore((s) => s.icp)
  const review = useTrafficStore((s) => s.batchReview)
  const reviewing = useTrafficStore((s) => s.reviewing)
  const gateCleared = useTrafficStore((s) => s.gateCleared)
  const loadIcp = useTrafficStore((s) => s.loadIcp)
  const runBatchReview = useTrafficStore((s) => s.runBatchReview)
  const acceptReview = useTrafficStore((s) => s.acceptReview)
  const icpFromClosedWon = useTrafficStore((s) => s.icpFromClosedWon)
  const refreshIcpFromClosedWon = useTrafficStore((s) => s.refreshIcpFromClosedWon)
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const query = useTrafficStore((s) => s.query)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)

  // Pull the ICP when the drawer opens, no click needed.
  useEffect(() => {
    if (open && !icp) loadIcp()
  }, [open, icp, loadIcp])

  if (!open) return null

  const scoped = rows.filter((r) => rowInScope(r, { filter, query, clientFilter, campaignFilter }))
  const campaigns = [...new Set(scoped.map((r) => (r.campaign ?? '').trim()).filter(Boolean))].sort()
  const cov = rtbCoverage(scoped)
  const status = gateCleared ? 'cleared' : review ? review.verdict : 'not-reviewed'

  // Audience types (personas under the ICP) for the active client. Normalize on
  // read so audiences saved under the older (fewer-field) shape edit cleanly.
  const client = clientFilter !== 'all' ? clientFilter : ''
  const audiences = client ? (clientAudiences[client] ?? []).map(normalizeAudience) : []
  // Proof pool to emphasize per audience: RTBs across the client's campaigns.
  const rtbPool = [
    ...new Map(campaigns.flatMap((c) => rtbsForCampaign(c)).map((r) => [r.id, r])).values(),
  ]
  const painSuggestions = (id: string) =>
    [...new Set([...(icp?.pains ?? []), ...(audiences.find((a) => a.id === id)?.pains ?? [])])]
  const saveAudiences = (next: AudienceType[]) => setClientAudiences(client, next)
  const patchAudience = (id: string, patch: Partial<AudienceType>) =>
    saveAudiences(audiences.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  const toggleInList = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
  const toggleAudienceRtb = (id: string, rtbId: string) => {
    const a = audiences.find((x) => x.id === id)
    if (a) patchAudience(id, { rtbEmphasis: toggleInList(a.rtbEmphasis, rtbId) })
  }
  const toggleAudiencePain = (id: string, pain: string) => {
    const a = audiences.find((x) => x.id === id)
    if (a) patchAudience(id, { pains: toggleInList(a.pains, pain) })
  }
  const toggleAudienceChannel = (id: string, ch: ChannelId) => {
    const a = audiences.find((x) => x.id === id)
    if (a) patchAudience(id, { channels: toggleInList(a.channels, ch) })
  }
  const addAudience = () => saveAudiences([...audiences, newAudience()])

  return (
    <>
      <div className="drawer-scrim" onClick={() => setIcpOpen(false)} />
      <aside className="drawer icp-drawer">
        <div className="drawer-head">
          <strong>ICP &amp; proof</strong>
          <span className={`gate-status s-${status}`}>
            {gateCleared ? '✓ Cleared' : review ? VERDICT_LABEL[review.verdict] : 'Not reviewed'}
          </span>
          <span className="icp-source" title="ICP pulled via Claude">via Claude</span>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => setIcpOpen(false)}>
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {icp && (
            <div className="icp-panel">
              <div className="icp-card">
                <div className="icp-card-label">Who we're targeting</div>
                <div className="icp-name">
                  {icp.name}
                  {icp.segment && <span className="icp-segment">{icp.segment}</span>}
                  {icpFromClosedWon && (
                    <span className="icp-grounded" title="ICP refined from Attio closed-won customers">
                      ↗ grounded in closed-won
                    </span>
                  )}
                </div>
                <div className="icp-fields">
                  {icp.firmographics.map((f) => (
                    <span key={f.label} className="icp-chip">
                      <span className="icp-chip-k">{f.label}</span>
                      {f.value}
                    </span>
                  ))}
                </div>
                <p className="icp-summary">{icp.summary}</p>
              </div>

              <div className="icp-proof">
                <div className="icp-card-label">
                  Proof tailored to them (RTBs)
                  {cov.total > 0 && (
                    <span className="icp-proof-cov">
                      {cov.used}/{cov.total} used
                      {cov.unsupported.length > 0 && (
                        <span className="rtb-cov-flag unsupported">
                          {cov.unsupported.length} unsupported
                        </span>
                      )}
                      {cov.gaps.length > 0 && (
                        <span
                          className="rtb-cov-flag gap"
                          title={cov.gaps.map((g) => `${g.campaign}: ${g.rtb.label}`).join('\n')}
                        >
                          {cov.gaps.length} unused
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {campaigns.length === 0 ? (
                  <p className="icp-summary">No campaigns in scope.</p>
                ) : (
                  campaigns.map((camp) => (
                    <div key={camp} className="icp-rtb-group">
                      <span className="icp-rtb-camp">{camp}</span>
                      <div className="icp-rtb-list">
                        {rtbsForCampaign(camp).map((rtb) => (
                          <div key={rtb.id} className="icp-rtb">
                            <span className="icp-rtb-label">{rtb.label}</span>
                            <span className="icp-rtb-detail">{rtb.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {client && (
            <div className="aud-section">
              <div className="icp-card-label">
                Audience types
                <span className="aud-sub">personas under this ICP, each with its own angle, proof, and strategy</span>
              </div>
              {audiences.map((a) => (
                <div key={a.id} className="aud-card">
                  <div className="aud-head">
                    <input
                      className="aud-name"
                      value={a.name}
                      placeholder="Audience name (e.g. Enterprise Ops)"
                      onChange={(e) => patchAudience(a.id, { name: e.target.value })}
                    />
                    <button
                      className="aud-del"
                      onClick={() => saveAudiences(audiences.filter((x) => x.id !== a.id))}
                      title="Remove audience"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    className="aud-role"
                    value={a.role}
                    placeholder="Role / title (e.g. VP of Operations)"
                    onChange={(e) => patchAudience(a.id, { role: e.target.value })}
                  />
                  <textarea
                    className="aud-angle"
                    value={a.messageAngle}
                    placeholder="Message angle — how the promise is framed for this buyer's pains and language."
                    onChange={(e) => patchAudience(a.id, { messageAngle: e.target.value })}
                  />
                  {painSuggestions(a.id).length > 0 && (
                    <div className="aud-rtbs">
                      <span className="aud-rtb-label">Pains</span>
                      {painSuggestions(a.id).map((p) => (
                        <button
                          key={p}
                          className={`rtb-chip${a.pains.includes(p) ? ' on' : ''}`}
                          onClick={() => toggleAudiencePain(a.id, p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    className="aud-angle"
                    value={a.goals}
                    placeholder="Goals — what this persona is trying to achieve."
                    onChange={(e) => patchAudience(a.id, { goals: e.target.value })}
                  />
                  <textarea
                    className="aud-angle"
                    value={a.objections}
                    placeholder="Objections — what makes them hesitate."
                    onChange={(e) => patchAudience(a.id, { objections: e.target.value })}
                  />
                  <div className="aud-rtbs">
                    <span className="aud-rtb-label">Channels</span>
                    {CHANNEL_LIST.map((c) => (
                      <button
                        key={c.id}
                        className={`rtb-chip${a.channels.includes(c.id) ? ' on' : ''}`}
                        title={c.label}
                        onClick={() => toggleAudienceChannel(a.id, c.id)}
                      >
                        <ChannelIcon channel={c.id} size={12} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {rtbPool.length > 0 && (
                    <div className="aud-rtbs">
                      <span className="aud-rtb-label">Proof emphasis</span>
                      {rtbPool.map((rtb) => (
                        <button
                          key={rtb.id}
                          className={`rtb-chip${a.rtbEmphasis.includes(rtb.id) ? ' on' : ''}`}
                          title={rtb.detail}
                          onClick={() => toggleAudienceRtb(a.id, rtb.id)}
                        >
                          {rtb.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <select
                    className="aud-strategy"
                    value={a.strategy}
                    onChange={(e) => patchAudience(a.id, { strategy: e.target.value })}
                  >
                    <option value="">Strategy…</option>
                    {GTM_STRATEGIES.map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button className="aud-add" onClick={addAudience}>
                ＋ Add audience type
              </button>
            </div>
          )}

          {review && (
            <div className="icp-review-foot">
              <span className={`vbadge campaign v-${review.verdict}`}>{VERDICT_LABEL[review.verdict]}</span>
              <span className="review-summary-inline">{review.summary}</span>
            </div>
          )}
        </div>

        <div className="drawer-foot">
          {icp && (
            <button
              className="btn ghost sm"
              onClick={refreshIcpFromClosedWon}
              title="Refine the ICP from actual closed-won customers in Attio"
            >
              ↻ From closed-won
            </button>
          )}
          <span className="spacer" />
          {review && !gateCleared && (
            <button className="btn green sm" onClick={acceptReview}>
              Accept &amp; unlock
            </button>
          )}
          {icp && (
            <button className="btn sm primary" disabled={reviewing} onClick={runBatchReview}>
              {reviewing ? 'Reviewing…' : review ? '⟳ Re-run review' : 'Review rows vs ICP'}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
