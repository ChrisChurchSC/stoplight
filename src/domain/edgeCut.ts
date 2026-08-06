import { deliverableKeyFor } from './flowBoard'

/**
 * WHAT CUTTING A DERIVED LINE WOULD MEAN — or nothing, when it would mean nothing.
 *
 * The canvas draws two sorts of line. A STORED one is a wire somebody drew, and deleting it is
 * simply removing what they added. A DERIVED one is drawn by the board because of what the cards
 * are, and most of those have nothing behind them to cut: a post sits under its channel because it
 * IS an asset of that channel, and no edit to that line exists that would not be an edit to the
 * card instead.
 *
 * Two of them are not like that. Both stand for a decision somebody made, recorded on the rows:
 *
 *   detach   campaign → channel. The channel taking the brief's records is the default, not a law.
 *   unbranch asset → channel. The channel hangs off that asset because it was added from the
 *            asset's "+", which wrote `branchOf` on its rows. Cutting the line clears that, and
 *            the channel hangs off the campaign like any other.
 *
 * The second one used to be refused along with the structural lines, and told the person "this line
 * follows from where the post lives, so there is nothing to cut" — which was not true of it. It was
 * the one derived line on the board standing for a choice, and the only way back out of that choice
 * was to delete the channel and add it again.
 *
 * MIRRORS implicitConnectors DELIBERATELY: it resolves the source row by name the same way, so the
 * line that is drawn is exactly the line that can be cut. If the two ever disagree the board grows a
 * ✕ on a line that is not there, or refuses one that is.
 */
export type EdgeCut =
  | { kind: 'detach'; deliv: string }
  | {
      kind: 'unbranch'
      deliv: string
      /** The asset name the channel currently follows — what the line is FROM. */
      source: string
      /**
       * Whether cutting merges this channel into an existing one. A deliverable is identified by
       * what it is (channel + type + the asset it branches off), so dropping the branch changes its
       * key: if the campaign already has that channel and type at the top level, the two become one
       * card and its assets move under it. That is what the data then says, but it is a bigger move
       * than "the line goes away", so the toast has to say so.
       */
      mergesInto: boolean
    }

/** The shape cutForEdge needs from a deliverable — ViewDeliverable satisfies it. */
export interface CutDeliv {
  key: string
  channel: string
  assetType: string
  rows: { branchOf?: string }[]
}
/** The shape cutForEdge needs from a row — TrafficRow satisfies it. */
export interface CutRow {
  id: string
  assetName: string
}

export const cutForEdge = (from: string, to: string, delivs: CutDeliv[], rows: CutRow[]): EdgeCut | null => {
  const d = delivs.find((x) => x.key === to)
  if (!d) return null
  if (from === 'campaign') return { kind: 'detach', deliv: to }
  const source = d.rows.find((r) => r.branchOf)?.branchOf
  if (!source) return null
  // By NAME, because that is what branchOf holds and what the renderer looks up. A branch whose
  // source asset was renamed or deleted draws no line at all, so there is none to offer a cut on.
  const srcRow = rows.find((r) => r.assetName === source)
  if (!srcRow || srcRow.id !== from) return null
  const plain = deliverableKeyFor({ channel: d.channel, assetType: d.assetType })
  return { kind: 'unbranch', deliv: to, source, mergesInto: delivs.some((x) => x.key === plain) }
}
