import { recordTint } from '../domain/records'

export interface RelatedItem {
  id: string
  name: string
  sub?: string
  onOpen: () => void
}

/**
 * A "related records" block in a record drawer: a labeled, clickable list that surfaces links between
 * record types (the people at a company, the companies in a segment, …). Renders nothing when empty.
 */
export function RelatedList({ title, items, empty }: { title: string; items: RelatedItem[]; empty?: string }) {
  return (
    <div className="rd-related">
      <div className="rd-group">
        {title}
        {items.length > 0 && <span className="rd-related-count">{items.length}</span>}
      </div>
      {items.length === 0 ? (
        <div className="rd-related-empty">{empty ?? 'None yet'}</div>
      ) : (
        <div className="rd-related-list">
          {items.map((it) => (
            <button key={it.id} className="rd-related-item" onClick={it.onOpen} title={`Open ${it.name}`}>
              <span className="rd-related-ava" style={{ background: recordTint(it.name) }}>
                {(it.name.trim()[0] || '?').toUpperCase()}
              </span>
              <span className="rd-related-name">{it.name}</span>
              {it.sub && <span className="rd-related-sub">{it.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
