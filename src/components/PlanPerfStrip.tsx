import { formatReach, type JourneyPerf } from '../domain/journeyPerf'

/**
 * The whole-plan performance rollup as a compact horizontal strip, so the journey's
 * funnel + conversion read the same above the grid and the calendar as they do on
 * the canvas. Hidden when there's nothing to roll up (no reach in scope).
 */
export function PlanPerfStrip({ plan }: { plan: JourneyPerf['plan'] }) {
  if (!plan.topReach) return null
  return (
    <div className="planstrip">
      <span className="planstrip-k">📊 Plan</span>
      <span className="planstrip-funnel">
        {plan.byStage.map((s, i) => (
          <span className="planstrip-stage" key={s.stage}>
            {i > 0 && <span className="planstrip-arrow">▸</span>}
            <span className="planstrip-label">{s.label}</span>
            <span className="planstrip-val">{formatReach(s.reach)}</span>
          </span>
        ))}
      </span>
      <span className="planstrip-conv">
        <strong>{(plan.convRate * 100).toFixed(1)}%</strong> to conversion
      </span>
      {plan.weakestFork && (
        <span className="planstrip-leak" title={`Weakest handoff: ${plan.weakestFork.name}`}>
          ⚠ leak: {plan.weakestFork.name} ({(plan.weakestFork.flow * 100).toFixed(0)}%)
        </span>
      )}
    </div>
  )
}
