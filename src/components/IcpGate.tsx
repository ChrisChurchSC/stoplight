import { useTrafficStore } from '../store/useTrafficStore'
import type { AssetVerdict, CampaignVerdict } from '../adapters/icp/types'
import { ChannelIcon } from './ChannelIcon'

const VERDICT_LABEL: Record<CampaignVerdict, string> = {
  coherent: 'Coherent',
  mixed: 'Mixed',
  incoherent: 'Incoherent',
}

function AssetVerdictBadge({ verdict }: { verdict: AssetVerdict }) {
  return <span className={`vbadge v-${verdict}`}>{verdict.replace('-', ' ')}</span>
}

export function IcpGate() {
  const icp = useTrafficStore((s) => s.icp)
  const review = useTrafficStore((s) => s.batchReview)
  const reviewing = useTrafficStore((s) => s.reviewing)
  const gateCleared = useTrafficStore((s) => s.gateCleared)
  const loadIcp = useTrafficStore((s) => s.loadIcp)
  const runBatchReview = useTrafficStore((s) => s.runBatchReview)
  const acceptReview = useTrafficStore((s) => s.acceptReview)
  const openReview = useTrafficStore((s) => s.openReview)
  const icpFromClosedWon = useTrafficStore((s) => s.icpFromClosedWon)
  const refreshIcpFromClosedWon = useTrafficStore((s) => s.refreshIcpFromClosedWon)

  const status = gateCleared
    ? 'cleared'
    : review
      ? review.verdict
      : 'not-reviewed'

  return (
    <section className="icp-gate">
      <div className="icp-gate-head">
        <strong>ICP messaging review</strong>
        <span className={`gate-status s-${status}`}>
          {gateCleared ? '✓ Cleared' : review ? VERDICT_LABEL[review.verdict] : 'Not reviewed'}
        </span>
        <span className="spacer" />
        {!icp && (
          <button className="btn sm" onClick={loadIcp}>
            ⬇ Load ICP from Clay
          </button>
        )}
        {icp && (
          <button
            className="btn sm"
            onClick={refreshIcpFromClosedWon}
            title="Refine the ICP from actual closed-won customers in Attio"
          >
            ↻ From closed-won
          </button>
        )}
        {icp && (
          <button className="btn sm primary" disabled={reviewing} onClick={runBatchReview}>
            {reviewing ? 'Reviewing…' : review ? '⟳ Re-run review' : 'Run messaging review'}
          </button>
        )}
      </div>

      {icp && (
        <div className="icp-card">
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
      )}

      {review && (
        <div className="icp-review">
          <div className="review-verdict">
            <span className={`vbadge campaign v-${review.verdict}`}>{VERDICT_LABEL[review.verdict]}</span>
            <span className={review.oneStory ? 'one-story yes' : 'one-story no'}>
              {review.oneStory ? '✓ Tells one story' : '⚠ Not one story yet'}
            </span>
          </div>
          <p className="review-summary">{review.summary}</p>

          {review.flags.length > 0 && (
            <ul className="flag-list">
              {review.flags.map((f) => (
                <li key={f.rowId} className="flag" onClick={() => openReview(f.rowId)} title="Open copy review">
                  <AssetVerdictBadge verdict={f.verdict} />
                  <ChannelIcon channel={f.channel} size={13} />
                  <span className="flag-asset">{f.assetName}</span>
                  <span className="flag-issue">{f.issue}</span>
                  {f.suggestion && <span className="flag-fix">→ {f.suggestion}</span>}
                </li>
              ))}
            </ul>
          )}

          <div className="review-foot">
            {gateCleared ? (
              <span className="cleared-note">✓ Messaging cleared — scheduling unlocked</span>
            ) : (
              <button className="btn green" onClick={acceptReview}>
                Accept &amp; unlock scheduling
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
