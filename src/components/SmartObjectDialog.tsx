import { useEffect, useRef, useState } from 'react'
import { OBJECT_META } from '../domain/canvasObjectMeta'
import type { CanvasObject } from '../domain/flowBoard'
import type { SmartObject, SmartObjectScope } from '../domain/smartObject'

/**
 * EDITING A SMART OBJECT, in a dialog rather than a page.
 *
 * This replaces a full canvas TAB, which was the wrong weight for the job twice over. A tab is for
 * somewhere you dwell and come back to; changing an object's name and taking a card out of it is a
 * thing you do and close. And it planted an entry in the same strip as the campaigns, so renaming a
 * bundle cost the same furniture as opening a client's work.
 *
 * It also could not do what its own button claimed. The page showed the contents as a read-only
 * grid: you could rename, delete, and attach a document, and that was all. Once editing left the
 * board there was no way anywhere in the app to change what was inside an object — you could only
 * detach it and rebuild. That is the gap this closes.
 *
 * FIELDS THAT LOOK LIKE FIELDS. The page rendered the name as a borderless page title, so it read as
 * a heading and nobody could tell it was editable. Everything here wears the inspector's own
 * vocabulary — .flow-inspect-label over .flow-inspect-input — because that is what every other
 * editing surface in this app looks like and the point is that this one is not special.
 *
 * PRESENTATIONAL ON PURPOSE. Every change is a callback. Resolving a card to the record behind it
 * needs `refForObject` and `objectOptions`, which are FlowsView's, and a dialog that reached for
 * them would drag the board's whole context in behind it.
 */
export function SmartObjectDialog({
  object,
  boardCards,
  cardLabel,
  canUseBrand,
  onRename,
  onScope,
  onAdd,
  onRemove,
  onAttachRef,
  onRemoveRef,
  onDelete,
  onClose,
}: {
  object: SmartObject
  /** Context cards on the board you opened this from, minus the ones already inside. */
  boardCards: CanvasObject[]
  cardLabel: (c: CanvasObject) => string
  /** False when no brand is in view, which is the one rung that needs somewhere to land. */
  canUseBrand: boolean
  onRename: (name: string) => void
  onScope: (scope: SmartObjectScope) => void
  onAdd: (card: CanvasObject) => void
  onRemove: (cardId: string) => void
  onAttachRef: (file: File) => void
  onRemoveRef: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Escape closes, and focus lands inside on open so the dialog is usable without a mouse.
  useEffect(() => {
    box.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      // One Escape per layer: the add list is a thing you opened inside this, so it closes first.
      setAdding((open) => {
        if (open) return false
        onClose()
        return open
      })
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])

  const contents = object.contents ?? []
  const RUNGS: { scope: SmartObjectScope; label: string; hint: string }[] = [
    { scope: 'campaign', label: 'Just this campaign', hint: 'Only this board can use it' },
    { scope: 'brand', label: 'This brand', hint: 'Every campaign for this brand' },
    { scope: 'shared', label: 'Every brand', hint: 'Any campaign, whoever it belongs to' },
  ]
  const scope = object.scope ?? 'brand'

  return (
    <div className="sod-overlay" onMouseDown={onClose}>
      <div
        className="sod"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${object.name || 'smart object'}`}
        tabIndex={-1}
        ref={box}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sod-head">
          <span className="sod-eyebrow">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l8 4.5-8 4.5-8-4.5z" /><path d="M4 12l8 4.5 8-4.5" /><path d="M4 16.5L12 21l8-4.5" />
            </svg>
            Smart object
          </span>
          <button className="sod-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="sod-body">
          <label className="flow-inspect-label" htmlFor="sod-name">Name</label>
          <input
            id="sod-name"
            className="flow-inspect-input"
            value={object.name}
            placeholder="Name this smart object…"
            onChange={(e) => onRename(e.target.value)}
          />

          {/* WHERE IT LIVES, as three named choices rather than a rung you have to already
              understand. Each says who else is affected, because that is the entire difference
              between them and the label alone does not carry it. */}
          <label className="flow-inspect-label">Who can use it</label>
          <div className="sod-rungs">
            {RUNGS.map((r) => (
              <button
                key={r.scope}
                className={`sod-rung${scope === r.scope ? ' on' : ''}`}
                disabled={r.scope === 'brand' && !canUseBrand}
                title={r.scope === 'brand' && !canUseBrand ? 'Add a Brand card to this campaign first' : undefined}
                onClick={() => onScope(r.scope)}
              >
                <strong>{r.label}</strong>
                <em>{r.hint}</em>
              </button>
            ))}
          </div>

          {/* THE DOCUMENT, above the contents, because that is the order of authority: what this
              object IS, then the records it is made of. A reader who meets the cards first reads
              them as the description, which is the misreading the field exists to correct. */}
          <label className="flow-inspect-label">Description</label>
          {object.reference ? (
            <div className="sod-ref">
              <span className="sod-ref-name">{object.reference.name}</span>
              <span className="sod-ref-size">{object.reference.text.length.toLocaleString()} characters</span>
              <button className="sod-ref-x" onClick={onRemoveRef}>Remove</button>
            </div>
          ) : (
            <label className="sod-ref-add">
              <input
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  // Reset first: picking the same file twice running fires no change event.
                  e.target.value = ''
                  if (f) onAttachRef(f)
                }}
              />
              <span>Add a .md or .txt saying what this object is</span>
            </label>
          )}

          <label className="flow-inspect-label">Inside · {contents.length}</label>
          {contents.length === 0 ? (
            <p className="flow-inspect-note">Nothing inside yet. Add a card from this board below.</p>
          ) : (
            <div className="sod-cards">
              {contents.map((c) => {
                const meta = OBJECT_META[c.kind]
                return (
                  <div key={c.id} className="sod-card">
                    <span className="sod-card-ic" style={{ color: meta?.tone }} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{meta?.icon}</svg>
                    </span>
                    <span className="sod-card-txt">
                      <span className="sod-card-kind">{meta?.label ?? c.kind}</span>
                      <span className="sod-card-val">{cardLabel(c) || 'Nothing picked yet'}</span>
                    </span>
                    <button
                      className="sod-card-x"
                      title="Take this out of the object"
                      aria-label={`Take ${meta?.label ?? c.kind} out of this object`}
                      onClick={() => onRemove(c.id)}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* ADDING PICKS FROM THE BOARD YOU CAME FROM, which is how objects get made in the first
              place: select cards, ⌘G. A second card-creation flow here would be a fork of the
              toolbar's, kept aligned by hand. */}
          {adding ? (
            <div className="sod-add-list">
              {boardCards.length === 0 ? (
                <p className="flow-inspect-note">
                  Every context card on this board is already in this object. Drop another on the
                  canvas and it will show up here.
                </p>
              ) : (
                boardCards.map((c) => {
                  const meta = OBJECT_META[c.kind]
                  return (
                    <button key={c.id} className="sod-add-opt" onClick={() => { onAdd(c); setAdding(false) }}>
                      <span className="sod-card-ic" style={{ color: meta?.tone }} aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{meta?.icon}</svg>
                      </span>
                      <span className="sod-card-txt">
                        <span className="sod-card-kind">{meta?.label ?? c.kind}</span>
                        <span className="sod-card-val">{cardLabel(c) || 'Nothing picked yet'}</span>
                      </span>
                    </button>
                  )
                })
              )}
              <button className="sod-add-cancel" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          ) : (
            <button className="sod-add" onClick={() => setAdding(true)}>Add a card from this board</button>
          )}
        </div>

        {/* DELETE IS ARMED, the same two-step the library shelf uses. Destroying an object reaches
            campaigns you cannot see from here, so it is the one action in this dialog that asks
            twice — and it sits apart from the fields for the same reason. */}
        <div className="sod-foot">
          <button
            className={`sod-del${confirmDelete ? ' armed' : ''}`}
            onClick={() => {
              if (!confirmDelete) { setConfirmDelete(true); return }
              onDelete()
            }}
            onBlur={() => setConfirmDelete(false)}
          >
            {confirmDelete ? 'Delete it everywhere — click again' : 'Delete smart object'}
          </button>
          <span className="spacer" />
          <button className="sod-done" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
