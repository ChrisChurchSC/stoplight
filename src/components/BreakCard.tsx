import { AXIS_META, type BreakSeverity, type CoherenceBreak } from '../domain/breaks'
import { useTrafficStore } from '../store/useTrafficStore'

const SEV_LABEL: Record<BreakSeverity, string> = { high: 'High', medium: 'Medium', low: 'Low' }

/** Render `text` with the conflicting span emphasized — not "they disagree", the words. */
function Highlighted({ text, highlight }: { text: string; highlight: string }) {
  const idx = highlight ? text.toLowerCase().indexOf(highlight.toLowerCase()) : -1
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="brk-mark">{text.slice(idx, idx + highlight.length)}</mark>
      {text.slice(idx + highlight.length)}
    </>
  )
}

/**
 * The Break card — the most important component in the demo. Answers four
 * questions in order: what (headline) / where (side-by-side evidence with the
 * conflicting spans highlighted) / why (tied to this client's ICP) / fix.
 */
export function BreakCard({ brk, active }: { brk: CoherenceBreak; active: boolean }) {
  const applyFix = useTrafficStore((s) => s.applyBreakFix)
  const reassign = useTrafficStore((s) => s.reassignBreakProof)
  const markIntended = useTrafficStore((s) => s.markBreakIntended)
  const sendReview = useTrafficStore((s) => s.sendBreakToReview)

  return (
    <div className={`brk-card a-${brk.axis}${active ? ' active' : ''}${brk.status !== 'open' ? ' dismissed' : ''}`}>
      {/* what */}
      <div className="brk-headline">{brk.headline}</div>

      {/* axis + severity */}
      <div className="brk-tags">
        <span className={`brk-axis a-${brk.axis}`}>{AXIS_META[brk.axis].label}</span>
        <span className={`brk-sev s-${brk.severity}`}>{SEV_LABEL[brk.severity]}</span>
        {brk.audienceType && <span className="brk-aud">{brk.audienceType}</span>}
        {brk.status === 'intended' && <span className="brk-state intended">✓ Intended</span>}
        {brk.status === 'in-review' && <span className="brk-state review">In review</span>}
      </div>

      {/* where — side by side */}
      <div className={`brk-evidence${brk.to ? '' : ' single'}`}>
        <div className="brk-unit">
          <div className="brk-unit-role">{brk.from.role}</div>
          <div className="brk-unit-text">
            <Highlighted text={brk.from.text} highlight={brk.from.highlight} />
          </div>
          <div className="brk-unit-asset">{brk.from.assetName}</div>
        </div>
        {brk.to && (
          <>
            <div className="brk-vs">→</div>
            <div className="brk-unit broke">
              <div className="brk-unit-role">{brk.to.role}</div>
              <div className="brk-unit-text">
                <Highlighted text={brk.to.text} highlight={brk.to.highlight} />
              </div>
              <div className="brk-unit-asset">{brk.to.assetName}</div>
            </div>
          </>
        )}
      </div>

      {/* why */}
      <div className="brk-why">
        <span className="brk-why-tag">Why it breaks the thread</span>
        {brk.why}
      </div>

      {/* the brand-guide rule this break measures against */}
      {brk.brandRule && (
        <div className="brk-rule">
          <span className="brk-rule-tag">⊘ Brand rule</span>
          {brk.brandRule}
        </div>
      )}

      {/* fix preview — an attach-proof fix keeps the copy, so show the intent
          rather than an identical before → after. */}
      <div className="brk-fix">
        <span className="brk-fix-tag">Suggested fix</span>
        {brk.suggestedFix.attachRtb && brk.suggestedFix.before === brk.suggestedFix.after ? (
          <span className="brk-fix-after">Attach the matching proof point</span>
        ) : (
          <>
            <span className="brk-fix-before">{brk.suggestedFix.before}</span>
            <span className="brk-fix-arrow">→</span>
            <span className="brk-fix-after">{brk.suggestedFix.after}</span>
          </>
        )}
      </div>

      {/* actions */}
      {brk.status === 'open' ? (
        <div className="brk-actions">
          <button className="btn sm primary" onClick={() => applyFix(brk.id)}>
            Apply suggested fix
          </button>
          {brk.suggestedFix.attachRtb && (
            <button className="btn sm" onClick={() => reassign(brk.id)}>
              Reassign proof
            </button>
          )}
          <button className="btn sm" onClick={() => markIntended(brk.id)}>
            Mark as intended
          </button>
          <button className="btn sm" onClick={() => sendReview(brk.id)}>
            Send to review
          </button>
        </div>
      ) : (
        <div className="brk-dismissed-note">
          {brk.status === 'intended'
            ? 'Dismissed as deliberate variation — the system learned this is not drift.'
            : 'Routed to a teammate / legal for review.'}
        </div>
      )}
    </div>
  )
}
