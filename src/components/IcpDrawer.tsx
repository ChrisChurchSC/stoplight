import { useEffect } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import type { CampaignVerdict } from '../adapters/icp/types'
import { rtbCoverage, rtbsForCampaign } from '../domain/rtb'
import { rowInScope } from '../lib/scope'

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

  // Pull from Clay when the drawer opens, no click needed.
  useEffect(() => {
    if (open && !icp) loadIcp()
  }, [open, icp, loadIcp])

  if (!open) return null

  const scoped = rows.filter((r) => rowInScope(r, { filter, query, clientFilter, campaignFilter }))
  const campaigns = [...new Set(scoped.map((r) => (r.campaign ?? '').trim()).filter(Boolean))].sort()
  const cov = rtbCoverage(scoped)
  const status = gateCleared ? 'cleared' : review ? review.verdict : 'not-reviewed'

  return (
    <>
      <div className="drawer-scrim" onClick={() => setIcpOpen(false)} />
      <aside className="drawer icp-drawer">
        <div className="drawer-head">
          <strong>ICP &amp; proof</strong>
          <span className={`gate-status s-${status}`}>
            {gateCleared ? '✓ Cleared' : review ? VERDICT_LABEL[review.verdict] : 'Not reviewed'}
          </span>
          <span className="icp-source" title="ICP pulled from Clay">via Clay</span>
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
