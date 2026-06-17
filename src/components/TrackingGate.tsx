import { CHANNELS } from '../domain/channels'
import { isTrackingClean, trackingChecks, utmQuery } from '../domain/tracking'
import type { TrafficRow } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

const trackable = (r: TrafficRow) => r.status !== 'posted' && r.status !== 'failed'

export function TrackingGate() {
  const rows = useTrafficStore((s) => s.rows)
  const trackingRan = useTrafficStore((s) => s.trackingRan)
  const trackingCleared = useTrafficStore((s) => s.trackingCleared)
  const generateTracking = useTrafficStore((s) => s.generateTracking)
  const acceptTracking = useTrafficStore((s) => s.acceptTracking)
  const openReview = useTrafficStore((s) => s.openReview)

  const batch = rows.filter(trackable)
  const dirty = batch.filter((r) => !isTrackingClean(r))
  const status = trackingCleared ? 'cleared' : trackingRan ? (dirty.length ? 'dirty' : 'clean') : 'not-run'

  return (
    <section className="icp-gate tracking-gate">
      <div className="icp-gate-head">
        <strong>Pre-flight tracking</strong>
        <span className={`gate-status s-${status === 'clean' ? 'coherent' : status === 'dirty' ? 'mixed' : status === 'cleared' ? 'cleared' : 'not-reviewed'}`}>
          {trackingCleared
            ? '✓ Cleared'
            : trackingRan
              ? dirty.length
                ? `${dirty.length} asset${dirty.length === 1 ? '' : 's'} unverified`
                : 'All clean'
              : 'Not run'}
        </span>
        <span className="spacer" />
        <button className="btn sm primary" onClick={generateTracking}>
          {trackingRan ? '⟳ Re-generate & verify' : 'Generate tracking'}
        </button>
      </div>

      {trackingRan && (
        <div className="icp-review">
          <p className="review-summary">
            UTMs are auto-built from each asset's channel, type, and campaign — one naming
            convention, no hand-tagging. Scheduling stays blocked until every asset is verified.
          </p>

          <ul className="track-list">
            {batch.map((row) => {
              const checks = trackingChecks(row)
              const clean = checks.every((c) => c.ok)
              return (
                <li key={row.id} className={`track-row${clean ? '' : ' dirty'}`} onClick={() => openReview(row.id)}>
                  <ChannelIcon channel={row.channel} size={13} />
                  <span className="track-asset">{row.assetName}</span>
                  <span className="track-checks">
                    {checks.map((c) => (
                      <span key={c.label} className={`track-check${c.ok ? ' ok' : ' bad'}`} title={c.label}>
                        {c.ok ? '✓' : '✗'} {c.label}
                      </span>
                    ))}
                  </span>
                  {row.utm && <code className="track-utm">{utmQuery(row.utm)}</code>}
                </li>
              )
            })}
          </ul>

          <div className="review-foot">
            {trackingCleared ? (
              <span className="cleared-note">✓ Tracking verified — nothing goes out untracked</span>
            ) : (
              <button className="btn green" disabled={dirty.length > 0} onClick={acceptTracking}>
                {dirty.length > 0
                  ? `Resolve ${dirty.length} unverified to accept`
                  : 'Accept tracking & unlock'}
              </button>
            )}
            {dirty.length > 0 && (
              <span className="track-hint">
                Missing pixels/events: {[...new Set(dirty.map((r) => CHANNELS[r.channel].label))].join(', ')}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
