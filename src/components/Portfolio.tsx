import { useState } from 'react'
import { PortfolioCockpit } from './PortfolioCockpit'
import { ReleasePlan } from './ReleasePlan'

/**
 * Portfolio — one home for every campaign, in two lenses. The Board (cockpit) is
 * triage: risk-first, what needs you now. The Schedule (release plan) is staging: what
 * ships when, at what cadence, is it ready. Same campaigns, one nav item, a toggle
 * between the two views so they stop reading as two lists of the same thing.
 */

type View = 'board' | 'schedule'

export function Portfolio() {
  const [view, setView] = useState<View>('board')
  return (
    <div className="pf">
      <div className="pf-bar">
        <h1 className="pf-title">Portfolio</h1>
        <div className="pf-toggle">
          <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>
            Board
          </button>
          <button className={view === 'schedule' ? 'active' : ''} onClick={() => setView('schedule')}>
            Schedule
          </button>
        </div>
      </div>
      {view === 'board' ? <PortfolioCockpit embedded /> : <ReleasePlan embedded />}
    </div>
  )
}
