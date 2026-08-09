/**
 * THE RECORD STEP — the list between pressing a card kind on the toolbar and that card landing.
 *
 * WHAT THIS REPLACED: the same list, hanging off the card's own face. You dropped a blank card,
 * pressed it, and a menu opened over the board — covering the cards around the one you were editing,
 * and it was the only way a card ever got a record. Two things were wrong with that and neither was
 * the list. A card that means nothing until you press it is a control wearing a card's clothes; and a
 * menu anchored to a canvas card has to fight the board for every event it receives, because a card
 * starts a drag on mousedown and a press behind the menu re-selects whatever it lands on. The old
 * file carried a capture-phase dismisser and a note explaining why a scrim could not work.
 *
 * So the list moved to the moment it answers — choosing what to put on the board — where a scrim is
 * just a scrim and a card arrives already meaning something.
 *
 * NO TICK AND NO UNLINK, which is what makes this a shorter file than the one it replaces. Nothing
 * here is the current choice, because there is no card yet; and there is nothing to unlink for the
 * same reason. Both were answers to "change what this card points at", a question that is now asked
 * by deleting the card and adding the one you meant.
 *
 * Renders a scrim and the menu as siblings, to be dropped inside the positioned .flow-tb-palwrap of
 * the toolbar button that opened it.
 */

export interface ObjectCardOption {
  id: string
  label: string
  /** The record's own one line. Absent for kinds whose records carry none. */
  detail?: string
}

interface Props {
  /** The records available, already scoped to the brand by the caller. */
  options: ObjectCardOption[]
  /** The kind as a word, lowercase — "audience", "proof point". Used in every string here. */
  noun: string
  /** Plural of `noun`. The caller owns pluralisation. */
  plural: string
  /**
   * Why the list is empty, when it is. An empty library and an unbound brand are different problems
   * with different fixes, and only the caller knows which one this is.
   */
  emptyNote: string
  /** Whether this kind can be made from here. Not every kind can. */
  canCreate: boolean
  query: string
  onQuery: (q: string) => void
  onPick: (id: string) => void
  onCreate: () => void
  onClose: () => void
}

/** Above this many, scanning beats reading and a filter box earns its line. */
export const ADD_SEARCH_FROM = 7

export function AddRecordMenu({ options, noun, plural, emptyNote, canCreate, query, onQuery, onPick, onCreate, onClose }: Props) {
  const q = query.trim().toLowerCase()
  const shown = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || (o.detail ?? '').toLowerCase().includes(q))
    : options

  return (
    <>
      <div className="flow-tb-palscrim" onMouseDown={onClose} />
      <div className="flow-tb-palmenu flow-tb-recmenu" role="listbox" aria-label={`Pick ${plural === noun ? noun : plural}`}>
        {options.length >= ADD_SEARCH_FROM && (
          <input
            className="flow-pick-search"
            autoFocus
            placeholder={`Search ${plural}…`}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }}
          />
        )}
        <div className="flow-pick-list">
          {!options.length && <div className="flow-pick-note">{emptyNote}</div>}
          {!!options.length && !shown.length && (
            <div className="flow-pick-note">No {plural} match “{query.trim()}”.</div>
          )}
          {shown.map((o) => (
            <button
              key={o.id}
              className="flow-pick-opt"
              role="option"
              aria-selected={false}
              onClick={() => onPick(o.id)}
            >
              <span className="flow-pick-opt-txt">
                <span className="flow-pick-opt-name">{o.label}</span>
                {o.detail && <span className="flow-pick-opt-sub">{o.detail}</span>}
              </span>
            </button>
          ))}
        </div>
        {/* Every record-linked kind can make the thing it needs, or a fresh brand dead-ends here with
            nowhere to go. The card lands first and names its new record in place — a text field on
            the card, which was never the part of the old picker that was in anyone's way. */}
        {canCreate && (
          <button className="flow-pick-act flow-pick-new" onClick={onCreate}>
            + New {noun}…
          </button>
        )}
      </div>
    </>
  )
}
