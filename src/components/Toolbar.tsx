import { useTrafficStore } from '../store/useTrafficStore'

export function Toolbar() {
  const query = useTrafficStore((s) => s.query)
  const setQuery = useTrafficStore((s) => s.setQuery)
  const view = useTrafficStore((s) => s.view)
  const setView = useTrafficStore((s) => s.setView)
  const icpOpen = useTrafficStore((s) => s.icpOpen)
  const setIcpOpen = useTrafficStore((s) => s.setIcpOpen)

  return (
    <div className="toolbar">
      <button
        className={`btn sm${icpOpen ? ' primary' : ''}`}
        onClick={() => setIcpOpen(!icpOpen)}
        title="ICP & proof"
      >
        ◎ ICP
      </button>

      <span className="spacer" />

      <div className="toolbar-search">
        <span className="search-ico">⌕</span>
        <input
          value={query}
          placeholder="Search assets…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <button
        className={`btn sm${view === 'assets' ? ' primary' : ''}`}
        onClick={() => setView(view === 'assets' ? 'grid' : 'assets')}
        title="Assets — staged intake"
      >
        ⬡ Assets
      </button>
    </div>
  )
}
