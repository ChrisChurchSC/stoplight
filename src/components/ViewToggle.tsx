import { useTrafficStore } from '../store/useTrafficStore'

const VIEWS = [
  { key: 'grid', label: '▦ Grid' },
  { key: 'calendar', label: '◷ Calendar' },
  { key: 'flow', label: '⇄ Flow' },
  { key: 'insights', label: '◧ Insights' },
] as const

export function ViewToggle() {
  const view = useTrafficStore((s) => s.view)
  const setView = useTrafficStore((s) => s.setView)
  const loadSample = useTrafficStore((s) => s.loadSample)

  return (
    <div className="view-bar">
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
