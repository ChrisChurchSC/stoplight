import { useRef, useState, type ReactNode } from 'react'

/**
 * THE HEAD OF AN INSPECTOR PANEL, in one place.
 *
 * Eleven panels in FlowsView build this by hand and only one of them had grown a definition line, a
 * rename or a corner for actions — which is what eleven hand-built headers produce. Extracted before
 * converting the rest, because converting them one at a time without this would write the divergence
 * ten more times.
 *
 * Deliberately not a layout for everything a panel might want. It renders the anatomy every panel
 * shares (a glyph, the thing's name, what kind of panel this is) and takes the rest as nodes, so a
 * panel with an odd control does not have to teach this component about it.
 */
export function PanelHead({
  icon,
  tone,
  title,
  sub,
  tag,
  actions,
  rename,
}: {
  /** The kind's glyph, drawn in the kind's own tone. Omitted where a panel has no icon. */
  icon?: ReactNode
  tone?: string
  /** The thing's own name, falling back to its kind. Four Audience cards on a board give four panels
   *  headed "Audience" otherwise, and no way to tell from the panel which one is selected. */
  title: string
  /** What kind of panel this is. Dropped where the title already IS the kind, since printing it
   *  twice says nothing. */
  sub?: ReactNode
  /** A qualifier on the name — "Work in progress" — beside the title rather than under it. As a
   *  sibling of the whole heading it takes width off the definition and wraps it. */
  tag?: ReactNode
  /** Things you do TO the thing, at the end of the title's line and clear of the collapse button. */
  actions?: ReactNode
  /**
   * Present only where the panel names something that can be named. A picker has no thing to rename,
   * and giving it a pencil would offer an edit with nowhere to go.
   */
  rename?: {
    /** The STORED name, which is what the box opens on. The displayed title falls back to the kind,
     *  so opening on that would offer "Brand" to you as a name for a brand. */
    value: string
    placeholder: string
    /** Names the act for the tooltip and the screen reader: "Rename this brand". */
    what: string
    onCommit: (next: string) => void
  }
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  /**
   * Escape has to leave without writing, and leaving the field is also how you commit: the blur that
   * ends the edit cannot tell by itself which of the two just happened.
   */
  const cancelled = useRef(false)

  return (
    <div className="flow-panel-head">
      {icon && (
        <span className="flow-note-ic flow-insp-ic" style={{ color: tone }} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="flow-panel-heading">
        <span className="flow-panel-titlerow">
          {rename && editing ? (
            <input
              className="flow-panel-title-input"
              autoFocus
              value={draft}
              placeholder={rename.placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (!cancelled.current) rename.onCommit(draft.trim())
                cancelled.current = false
                setEditing(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                else if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; e.currentTarget.blur() }
              }}
            />
          ) : (
            <>
              <span className="flow-panel-title" title={title}>{title}</span>
              {/* On hover, so a heading is a heading until you reach for it, and on keyboard focus,
                  or the panel carries a control you can tab to and never see. */}
              {rename && (
                <button
                  className="flow-panel-rename"
                  title={rename.what}
                  aria-label={rename.what}
                  onClick={() => { setDraft(rename.value); setEditing(true) }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h8" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                </button>
              )}
            </>
          )}
          {tag}
          {actions}
        </span>
        {sub && <span className="flow-panel-sub">{sub}</span>}
      </span>
    </div>
  )
}
