import { OBJECT_META } from '../domain/canvasObjectMeta'
import { describeSmartObject, scopeOf } from '../domain/smartObject'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * A smart object opened as its own canvas tab: a separate blank canvas holding just that object's
 * contents, the way double-clicking a smart object in Photoshop opens it in its own document.
 *
 * The tab strip (CanvasProjectTabs) owns which object is active, and the page reads it from the
 * store with no props, as DatasetPage does. Deliberately a listing of contents rather than a second
 * draggable board: the canvas surface is still welded into FlowsView, so a real editable canvas here
 * would mean a second copy of it. What this page can honestly do today is show what is inside, say
 * where the object lives, and let you name it.
 */
export function ObjectPage() {
  const id = useTrafficStore((s) => s.activeObjectId)
  const object = useTrafficStore((s) => s.smartObjects.find((o) => o.id === id))
  const updateSmartObject = useTrafficStore((s) => s.updateSmartObject)
  const deleteSmartObject = useTrafficStore((s) => s.deleteSmartObject)
  const closeObjectTab = useTrafficStore((s) => s.closeObjectTab)

  if (!id || !object) {
    return (
      <div className="dataset-page">
        <div className="bds-missing">No smart object open.</div>
      </div>
    )
  }

  const contents = object.contents ?? []
  const scope = scopeOf(object)

  return (
    <div className="dataset-page">
      <div className="dataset-page-head">
        <span className="dataset-page-eyebrow">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l8 4.5-8 4.5-8-4.5z" /><path d="M4 12l8 4.5 8-4.5" /><path d="M4 16.5L12 21l8-4.5" />
          </svg>
          {/* The eyebrow reads the SCOPE, because "which of these can other campaigns see" is the
              one thing about an object you cannot work out by looking at its contents. */}
          {scope === 'brand'
            ? `${object.brand ?? 'Brand'} · Brand library`
            : `${object.campaign ? object.campaign.replace(`${object.brand} — `, '') : 'This campaign'} · Only here`}
        </span>
        <input
          className="dataset-page-name"
          value={object.name}
          placeholder="Untitled smart object"
          onChange={(e) => updateSmartObject(object.id, { name: e.target.value })}
        />
        <button
          className="bds-del"
          title="Delete smart object"
          onClick={() => { deleteSmartObject(object.id); closeObjectTab(object.id) }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>
          Delete
        </button>
      </div>

      <div className="objpage-body">
        <div className="objpage-sub">{describeSmartObject(object)}</div>
        {contents.length === 0 ? (
          <div className="bds-missing">Nothing inside yet. Select a card on a campaign canvas and press ⌘G, or several to bundle them.</div>
        ) : (
          <div className="objpage-cards">
            {contents.map((c) => {
              const meta = OBJECT_META[c.kind]
              return (
                <div key={c.id} className="objpage-card" style={{ borderTopColor: meta?.tone ?? 'var(--border)' }}>
                  <div className="objpage-card-h" style={{ color: meta?.tone }}>
                    {meta && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{meta.icon}</svg>
                    )}
                    {meta?.label ?? c.kind}
                  </div>
                  <div className="objpage-card-body">
                    {object.refs.find((r) => r.id === c.refId)?.label ?? c.text.trim().split('\n')[0] ?? ''}
                    {!c.refId && !c.text.trim() && <span className="objpage-card-empty">Nothing picked yet</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
