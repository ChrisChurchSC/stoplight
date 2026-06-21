import { applyBreakStatus, breakScopeKey, resolveBreaks, threadHealth } from '../domain/breaks'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The persistent Connection health header. Pinned above every workspace view so
 * the connection state — not a revenue number every martech tool shows — is the
 * constant frame. The breaks count is a button into the queue.
 */
export function ConnectionHeader() {
  const rows = useTrafficStore((s) => s.rows)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const openBreaks = useTrafficStore((s) => s.openBreaks)
  const openAsk = useTrafficStore((s) => s.openAsk)
  const claudeBreaks = useTrafficStore((s) => s.claudeBreaks)
  const claudeBreaksScope = useTrafficStore((s) => s.claudeBreaksScope)
  const coherenceChecking = useTrafficStore((s) => s.coherenceChecking)
  const coherenceLive = useTrafficStore((s) => s.coherenceLive)
  const runCoherenceCheck = useTrafficStore((s) => s.runCoherenceCheck)

  if (clientFilter === 'all') return null
  const scoped = rows.filter((r) =>
    rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }),
  )
  if (scoped.length === 0) return null

  const scopeKey = breakScopeKey(clientFilter, campaignFilter)
  const checkedByClaude = !!claudeBreaks && claudeBreaksScope === scopeKey && coherenceLive
  const breaks = applyBreakStatus(
    resolveBreaks(scoped, claudeBreaks, claudeBreaksScope, scopeKey),
    breakStatus,
  )
  const assetNames = new Set(scoped.map((r) => r.assetName))
  const health = threadHealth(assetNames, breaks)
  const openHeadlines = breaks
    .filter((b) => b.status === 'open')
    .map((b) => `• ${b.headline}`)
    .join('\n')

  return (
    <div className="conn-header">
      <span className="conn-title">Thread integrity</span>
      <span className="conn-stat ok">{health.connected} connected</span>
      <span className="conn-sep">·</span>
      <span className={`conn-stat${health.breaks > 0 ? ' bad' : ' none'}`}>
        {health.breaks} break{health.breaks === 1 ? '' : 's'}
      </span>
      {health.breaks > 0 ? (
        <>
          <button
            className="conn-cta"
            onClick={() => openBreaks()}
            title={`The thread breaks in ${health.breaks} place${health.breaks === 1 ? '' : 's'}:\n${openHeadlines}`}
          >
            View breaks →
          </button>
          <span className="conn-gate-note">Resolve to publish</span>
        </>
      ) : (
        <span className="conn-allclear">✓ every asset tells one story</span>
      )}
      {checkedByClaude && <span className="conn-checked" title="These breaks were found by Claude, not the heuristic">✦ checked by Claude</span>}
      <span className="spacer" />
      <button
        className="conn-recheck"
        onClick={() => runCoherenceCheck()}
        disabled={coherenceChecking}
        title="Run the coherence check with Claude over this campaign's real copy"
      >
        {coherenceChecking ? 'Checking…' : '✦ Recheck with Claude'}
      </button>
      <button className="conn-ask" onClick={openAsk} title="Ask Claude about this campaign (⌘K)">
        ✦ Ask Claude
      </button>
    </div>
  )
}
