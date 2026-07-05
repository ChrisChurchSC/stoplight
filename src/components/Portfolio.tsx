import { PortfolioCockpit } from './PortfolioCockpit'

/**
 * Portfolio — one home for every campaign, focused on the two questions that matter:
 * what needs you now (attention) and what's due next (assets), with the full campaign
 * list underneath. The triage board, no view toggle.
 */
export function Portfolio() {
  return (
    <div className="pf">
      <div className="pf-bar">
        <h1 className="pf-title">Overview</h1>
      </div>
      <PortfolioCockpit embedded />
    </div>
  )
}
