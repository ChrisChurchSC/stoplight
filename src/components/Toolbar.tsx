import { useRef } from 'react'
import { CHANNELS } from '../domain/channels'
import { isTrackingClean } from '../domain/tracking'
import { hasBudget, isPaidRow } from '../domain/budget'
import { filesToAssets } from '../lib/files'
import { useTrafficStore } from '../store/useTrafficStore'

export function Toolbar() {
  const rows = useTrafficStore((s) => s.rows)
  const query = useTrafficStore((s) => s.query)
  const setQuery = useTrafficStore((s) => s.setQuery)
  const addAssets = useTrafficStore((s) => s.addAssets)
  const approveAll = useTrafficStore((s) => s.approveAll)
  const loadSample = useTrafficStore((s) => s.loadSample)
  const gateCleared = useTrafficStore((s) => s.gateCleared)
  const trackingCleared = useTrafficStore((s) => s.trackingCleared)
  const generateTracking = useTrafficStore((s) => s.generateTracking)
  const acceptTracking = useTrafficStore((s) => s.acceptTracking)
  const budgetCleared = useTrafficStore((s) => s.budgetCleared)
  const syncSpend = useTrafficStore((s) => s.syncSpend)
  const acceptBudget = useTrafficStore((s) => s.acceptBudget)
  const cleared = gateCleared && trackingCleared && budgetCleared

  const reviewable = rows.filter((r) => r.status !== 'posted' && r.status !== 'failed')
  const missingUtm = reviewable.filter((r) => !r.utm)
  const dirtyTracking = reviewable.filter((r) => r.utm && !isTrackingClean(r))
  const paidReviewable = reviewable.filter(isPaidRow)
  const missingBudget = paidReviewable.filter((r) => !hasBudget(r))

  const inputRef = useRef<HTMLInputElement>(null)
  const draftCount = rows.filter((r) => r.status === 'draft').length
  const posted = rows.filter((r) => r.status === 'posted').length
  const approved = rows.filter((r) => r.status === 'approved' || r.status === 'scheduled').length

  async function onFiles(files: FileList | null) {
    if (!files) return
    const assets = await filesToAssets(Array.from(files))
    if (assets.length) addAssets(assets)
  }

  return (
    <div className="toolbar">
      <button
        className="btn green sm"
        disabled={draftCount === 0 || !cleared}
        onClick={approveAll}
        title={
          cleared
            ? 'Approve all draft rows — messaging on-ICP, tracking clean, budgets set'
            : !gateCleared
              ? 'Clear the ICP messaging review to unlock scheduling'
              : !trackingCleared
                ? 'Clear the pre-flight tracking gate to unlock scheduling'
                : 'Set budgets on all paid assets to unlock scheduling'
        }
      >
        ⟳ Approve {draftCount} draft{draftCount === 1 ? '' : 's'}
        {!cleared && ' 🔒'}
      </button>

      {trackingCleared ? (
        <span className="toolbar-stat" title="Tracking verified">✓ Tracking</span>
      ) : missingUtm.length > 0 ? (
        <button
          className="btn sm"
          onClick={generateTracking}
          title="Build UTMs + verify pixels/events for all assets"
        >
          Generate tracking ({missingUtm.length})
        </button>
      ) : dirtyTracking.length > 0 ? (
        <button
          className="btn sm"
          disabled
          title={`Unverified tracking: ${[...new Set(dirtyTracking.map((r) => CHANNELS[r.channel].label))].join(', ')}`}
        >
          🔒 {dirtyTracking.length} unverified
        </button>
      ) : reviewable.length > 0 ? (
        <button className="btn green sm" onClick={acceptTracking}>
          Accept tracking
        </button>
      ) : null}

      {paidReviewable.length > 0 &&
        (budgetCleared ? (
          <span className="toolbar-stat" title="Budgets set on all paid assets">
            ✓ Budget
          </span>
        ) : missingBudget.length > 0 ? (
          <button className="btn sm" disabled title="Set a budget on every paid asset to unlock">
            🔒 {missingBudget.length} need budget
          </button>
        ) : (
          <button className="btn green sm" onClick={acceptBudget}>
            Accept budget
          </button>
        ))}

      {paidReviewable.some((r) => hasBudget(r)) && (
        <button className="btn sm" onClick={syncSpend} title="Pull actual spend (daily sync)">
          ↻ Sync spend
        </button>
      )}

      <button className="btn sm" onClick={() => inputRef.current?.click()}>
        + Add assets
      </button>
      <button className="btn ghost sm" onClick={loadSample} title="Replace the sheet with sample data">
        Load sample
      </button>
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

      <div className="toolbar-stat">▦ {rows.length} rows</div>
      <div className="toolbar-stat">
        <span className="dot" style={{ background: 'var(--blue)' }} /> {approved} approved
      </div>
      <div className="toolbar-stat">
        <span className="dot" style={{ background: 'var(--green)' }} /> {posted} posted
      </div>

      <span className="spacer" />

      <div className="toolbar-search">
        <span className="search-ico">⌕</span>
        <input
          value={query}
          placeholder="Search assets…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
    </div>
  )
}
