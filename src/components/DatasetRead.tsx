import { useMemo, useState } from 'react'
import { readDataset } from '../domain/datasetRead'
import type { BrandDataset } from '../domain/brandDataset'

/**
 * WHAT THIS TABLE SAYS, and what it deliberately does not.
 *
 * Sits above the source picker, because the answer belongs above the question. Everything here was
 * computed in plain arithmetic by readDataset, so it needs no API key, costs nothing and says the
 * same thing twice.
 *
 * THE SECOND HEADING IS NOT DECORATION. Every refusal in readDataset is invisible otherwise, and a
 * refusal you cannot see is indistinguishable from the tool not having noticed: somebody who knows
 * their table was capped at 500 rows needs to see that the app knows too, or they will assume the
 * share it did not print was an oversight. It is capped to one line with a count so it stays a note
 * rather than a wall of amber that gets skimmed past by the second session.
 */

const MAX_FINDINGS = 4

export function DatasetRead({ ds }: { ds: BrandDataset }) {
  const [showAll, setShowAll] = useState(false)
  const [openCaveats, setOpenCaveats] = useState(false)
  // Keyed on what can change the reading, so dragging a card does not re-read 500 rows every frame.
  const read = useMemo(
    () => readDataset(ds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ds.id, ds.rows.length, ds.editedAt, ds.source?.kind === 'aggregator' ? ds.source.syncedAt : 0],
  )

  if (!read.ok) {
    return (
      <div className="flow-read">
        <span className="flow-read-none">{read.caveats[0]}</span>
      </div>
    )
  }

  const shown = showAll ? read.findings : read.findings.slice(0, MAX_FINDINGS)

  return (
    <div className="flow-read">
      <div className="flow-read-head">
        <span className="flow-read-headline">{read.headline}</span>
        {read.read && <span className="flow-read-clause">{read.read}</span>}
      </div>

      {read.findings.length > 0 && (
        <>
          <label className="flow-inspect-label">What this says</label>
          {shown.map((f) => (
            <div key={f.id} className="flow-read-find">
              <span className="flow-read-claim">{f.claim}</span>
              {/* Naming the columns and the row count is what makes the claim checkable rather than
                  a thing the tool asserts. */}
              <span className="flow-read-detail">{f.detail}</span>
            </div>
          ))}
          {read.findings.length > MAX_FINDINGS && (
            <button className="flow-src-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${read.findings.length}`}
            </button>
          )}
        </>
      )}

      {read.caveats.length > 0 && (
        <>
          <label className="flow-inspect-label">What it does not say</label>
          {openCaveats ? (
            read.caveats.map((c) => (
              <span key={c} className="flow-read-caveat">
                {c}
              </span>
            ))
          ) : (
            <button className="flow-src-more" onClick={() => setOpenCaveats(true)}>
              {read.caveats.length} thing{read.caveats.length === 1 ? '' : 's'} this does not tell you. Open
            </button>
          )}
        </>
      )}
    </div>
  )
}
