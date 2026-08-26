import { type ReactNode } from 'react'

/**
 * THE HEAD OF AN INSPECTOR PANEL, in one place.
 *
 * Eleven panels in FlowsView build this by hand and only one of them had grown a definition line or a
 * corner for actions — which is what eleven hand-built headers produce. Extracted before converting
 * the rest, because converting them one at a time without this would write the divergence ten more
 * times.
 *
 * Deliberately not a layout for everything a panel might want. It renders the anatomy every panel
 * shares — a glyph, what kind of panel this is, its one-line definition — and takes the rest as
 * nodes, so a panel with an odd control does not have to teach this component about it.
 */
export function PanelHead({
  lead,
  icon,
  tone,
  title,
  sub,
  tag,
  actions,
}: {
  /**
   * A LEADING ELEMENT THAT FRAMES ITSELF, where `icon` is a bare glyph this component frames.
   *
   * Two things in these panels want the slot an icon sits in but bring their own box: a channel's
   * PresetTile, which is a 30px tinted tile, and a picker's back button. Passing either as `icon`
   * puts it inside `.flow-insp-ic`, which frames an already-framed tile and sizes any svg inside it
   * to 17px — so the distinction is not stylistic, it is the difference between a tile and a dent.
   */
  lead?: ReactNode
  /** The kind's glyph, drawn in the kind's own tone. Omitted where a panel has no icon. */
  icon?: ReactNode
  tone?: string
  /**
   * WHAT KIND OF PANEL THIS IS — "Brand", "Campaign brief" — rather than the name of the thing in it.
   *
   * The name went in here once, because a board can hold four Audience cards and four panels headed
   * "Audience" tell you nothing about which is selected. What that produced was a Name field under a
   * heading already displaying the name, asking you to name a thing it was showing you. The two only
   * conflicted because the header carried the wrong one: a panel says what kind of thing you are in,
   * the canvas already said which one, and the name is the first field in the body.
   */
  title: string
  /**
   * The kind's one-line definition, under its name. It belongs to the panel's title: as the first
   * paragraph of the body it was the third muted line in a row, and the body opened on explanation
   * instead of on the card.
   */
  sub?: ReactNode
  /** A qualifier on the title — "Work in progress" — beside it rather than under it. As a sibling of
   *  the whole heading it takes width off the definition and wraps it. */
  tag?: ReactNode
  /** Things you do TO the thing, at the end of the title's line and clear of the collapse button. */
  actions?: ReactNode
}) {
  return (
    <div className="flow-panel-head">
      {lead}
      {icon && (
        <span className="flow-note-ic flow-insp-ic" style={{ color: tone }} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="flow-panel-heading">
        <span className="flow-panel-titlerow">
          <span className="flow-panel-title" title={title}>{title}</span>
          {tag}
          {actions}
        </span>
        {sub && <span className="flow-panel-sub">{sub}</span>}
      </span>
    </div>
  )
}
