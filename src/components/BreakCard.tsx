import { type CoherenceBreak } from '../domain/breaks'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The Break card, kept deliberately simple: the problem in a line, where it is, the
 * suggested fix (this → that), and one button to apply it. The deeper detail (axis,
 * severity, side-by-side evidence, the why, the brand rule) is intentionally left off
 * so a flag reads at a glance.
 */
export function BreakCard({ brk, active }: { brk: CoherenceBreak; active: boolean }) {
  const applyFix = useTrafficStore((s) => s.applyBreakFix)
  const markIntended = useTrafficStore((s) => s.markBreakIntended)

  const fix = brk.suggestedFix
  const attach = !!fix.attachRtb && fix.before === fix.after
  const before = fix.before.length > 90 ? `${fix.before.slice(0, 89)}…` : fix.before

  return (
    <div className={`brk-card simple a-${brk.axis}${active ? ' active' : ''}${brk.status !== 'open' ? ' dismissed' : ''}`}>
      <div className="brk-simple-head">
        <span className="brk-simple-problem">{brk.headline}</span>
        {brk.from.assetName && <span className="brk-simple-where">{brk.from.assetName}</span>}
      </div>

      {attach ? (
        <div className="brk-simple-fix">
          <span className="brk-simple-after">Attach the matching proof point</span>
        </div>
      ) : (
        fix.after && (
          <div className="brk-simple-fix">
            <span className="brk-simple-before">{before}</span>
            <span className="brk-simple-arrow">→</span>
            <span className="brk-simple-after">{fix.after}</span>
          </div>
        )
      )}

      {brk.status === 'open' ? (
        <div className="brk-simple-actions">
          <button className="btn sm primary" onClick={() => applyFix(brk.id)}>
            Apply
          </button>
          <button className="btn sm" onClick={() => markIntended(brk.id)}>
            Dismiss
          </button>
        </div>
      ) : (
        <div className="brk-simple-done">{brk.status === 'intended' ? '✓ Dismissed' : 'In review'}</div>
      )}
    </div>
  )
}
