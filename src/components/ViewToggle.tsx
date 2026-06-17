import { useTrafficStore } from '../store/useTrafficStore'

const VIEWS = [
  { key: 'grid', label: '▦ Grid' },
  { key: 'calendar', label: '◷ Calendar' },
  { key: 'flow', label: '⇄ Flow' },
  { key: 'insights', label: '◧ Insights' },
  { key: 'icp', label: '◎ ICP' },
  { key: 'assets', label: '⬡ Assets' },
] as const

export function ViewToggle() {
  const view = useTrafficStore((s) => s.view)
  const setView = useTrafficStore((s) => s.setView)

  return (
    <div className="view-bar">
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
    </div>
  )
}
