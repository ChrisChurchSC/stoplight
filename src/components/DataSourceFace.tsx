import { useMemo } from 'react'
import { datasetProvenance, readDataset } from '../domain/datasetRead'
import type { BrandDataset } from '../domain/brandDataset'
import { MiniSheet } from './MiniSheet'
import { SourceMark } from './SourceMark'

/**
 * WHAT A DATA SOURCE CARD SAYS ON THE BOARD.
 *
 * The card's most informative pixel was a 50px grid of grey blocks meaning "this has data in it",
 * read on a wall of twenty cards at 40% zoom in a meeting. Every number needed to say something
 * better was already computed: readDataset has been shipped and tested since the reading panel, and
 * had exactly one caller, the inspector. So the board showed a fill pattern while the panel two
 * clicks away showed "12,481 clicks. The top 10 pages are 58% of them."
 *
 * WHY THIS IS ITS OWN COMPONENT rather than the IIFE it replaces. readDataset walks up to 500 rows
 * and the card renders on every drag frame, so the reading has to be memoised, and a hook cannot be
 * called from inside a callback in a list. Being a component is also what makes it testable without
 * mounting the canvas.
 *
 * MINISHEET IS NOT DELETED. A blank or manual sheet has nothing to read, and for that card the fill
 * pattern is the honest picture: it says "there is a table here and it is yours" without asserting
 * anything about what is in it. The grid stays for exactly those cards.
 */

export function DataSourceFace({
  ds,
  dangling,
  far,
}: {
  /** The resolved data set, or null when the card names nothing or names something deleted. */
  ds: BrandDataset | null
  /** The card holds a refId that resolves to nothing. A deleted set is not an empty card. */
  dangling: boolean
  /**
   * Zoomed out past the point where a sentence is readable.
   *
   * The headline goes, the name and the provenance badge stay. Deliberately not the other way
   * around: a computed figure whose window, age and truncation caveat live in the line you dropped
   * is the staleness failure this feature exists to prevent, rendered larger.
   */
  far: boolean
}) {
  /**
   * Keyed on everything that can change the reading and nothing that cannot. rows.length rather
   * than rows: a cell edit changes editedAt, and a refresh changes syncedAt, so the identity of the
   * array is not needed and holding it would defeat the memo on every parent render.
   */
  const read = useMemo(
    () => (ds ? readDataset(ds) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ds?.id, ds?.rows.length, ds?.editedAt, ds?.source?.kind === 'aggregator' ? ds.source.syncedAt : 0],
  )
  const prov = ds ? datasetProvenance(ds) : null

  // The reading, when there is one to show. A sketch returns not-ok on purpose and lands in the
  // MiniSheet branch below, where it reads as a table with nothing to say rather than a headline.
  const line = read?.ok && read.headline ? [read.headline, read.read].filter(Boolean).join('. ') : ''

  return (
    <div
      className={`flow-note-mini${ds ? ' linked' : ''}`}
      title={
        ds
          ? `${ds.name || 'Untitled data set'} · double-click to open`
          : dangling
            ? 'That data set was deleted. Pick another one in the inspector.'
            : 'Link or create a data set, then double-click to open it'
      }
    >
      {/* The name first, because it is what the table is called everywhere else in the app and a
          card that renamed its own table on the board would be lying about which one it holds. */}
      <span className="flow-note-mini-label">
        {/* The platform's mark sits with the NAME, so a card read at a glance says what the data is
            before the provenance line is read at all. */}
        {ds?.source?.kind === 'aggregator' && ds.source.service && (
          <span className="flow-note-mini-mark"><SourceMark id={ds.source.service} /></span>
        )}
        {ds ? ds.name || 'Untitled data set' : dangling ? 'That data set was deleted' : 'No data set linked yet'}
      </span>

      {line && !far ? (
        // WHAT THE TABLE SAYS. Two lines hard, so one long finding cannot make this card taller
        // than its neighbours and break the row it sits in.
        <span className={`flow-note-mini-read${prov?.tone === 'amber' ? ' quiet' : ''}`}>{line}</span>
      ) : (
        /**
         * The sheet, for a table with nothing to read AND for a readable one at far zoom.
         *
         * Falling back to the grid rather than to nothing is what keeps the card the same height at
         * every zoom: the box is laid out in canvas units, so a card that shed a 50px block on the
         * way out to 40% would resize under the cursor mid-gesture and shift every card near it.
         */
        <MiniSheet columns={ds?.columns ?? ['', '', '', '']} rows={ds?.rows ?? []} bodyRows={3} />
      )}

      {/* WHERE IT CAME FROM, from the one function that decides it. These were four inline branches
          reading source.kind directly, which is how a table typed over by hand went on presenting
          itself as measured. datasetProvenance holds the precedence and every surface reads it. */}
      {ds && prov && (
        <span className={`flow-note-mini-src${prov.tone === 'amber' ? ' sketched' : ''}`} title={prov.detail}>
          {ds.source?.kind === 'aggregator' && (
            <span className="flow-note-mini-mark"><SourceMark id={ds.source.provider} /></span>
          )}
          {prov.badge}
        </span>
      )}
    </div>
  )
}
