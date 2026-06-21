import { TIME_RANGES } from '../domain/timeRange'
import { useTrafficStore } from '../store/useTrafficStore'

// Canvas + Connection lead — they're the storefront (the thesis). Grid is the workbench.
const VIEWS = [
  { key: 'canvas', label: '⬡ Canvas' },
  { key: 'flow', label: '⇄ Connection' },
  { key: 'grid', label: '▦ Grid' },
  { key: 'calendar', label: '◷ Calendar' },
] as const

export function ViewToggle() {
  const view = useTrafficStore((s) => s.view)
  const setView = useTrafficStore((s) => s.setView)
  const loadSample = useTrafficStore((s) => s.loadSample)
  const timeRange = useTrafficStore((s) => s.timeRange)
  const setTimeRange = useTrafficStore((s) => s.setTimeRange)
  // Time-range horizon applies to the Connection + Grid views (Calendar has its own).
  const showRange = view === 'flow' || view === 'grid'

  return (
    <div className="view-bar">
      {showRange ? (
        <div className="range-toggle" role="group" aria-label="Time range">
          {TIME_RANGES.map((r) => (
            <button
              key={r.key}
              className={`range-btn${timeRange === r.key ? ' active' : ''}`}
              onClick={() => setTimeRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : (
        <span className="view-bar-spacer" />
      )}
      <span className="view-bar-spacer" />
      <div className="view-toggle" role="group" aria-label="View">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            className={`view-btn${view === v.key ? ' active' : ''}`}
            onClick={() => setView(v.key)}
            title={`${v.label.replace(/^\S+\s/, '')} view`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="view-bar-right">
        <button className="btn ghost sm" onClick={loadSample} title="Replace the sheet with sample data">
          Load sample data
        </button>
      </div>
    </div>
  )
}
