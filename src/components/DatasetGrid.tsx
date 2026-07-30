import { useTrafficStore } from '../store/useTrafficStore'
import { squareRows } from '../domain/brandDataset'
import { BufferedTextarea } from './BufferedTextarea'

/**
 * The editable grid for one brand data set — labelled columns + free-text cells, with add-row and
 * add-column. Shared by the brand-page inline editor (BrandDataSets) and the full-page data-set tab
 * (DatasetPage) so the spreadsheet behaves identically wherever it's opened.
 *
 * TYPING IS BUFFERED. Every keystroke used to rewrite the whole brandDatasets list and re-serialize
 * it to localStorage, in a grid where a person types across dozens of cells.
 *
 * WHICH CELL A BUFFER BELONGS TO is the thing to be careful with, because a data set's rows are a
 * plain string[][] with no per-row id, so position is the only identity there is. Two things keep a
 * half-typed cell from landing in the wrong one: the boxes are keyed by data set id plus row and
 * column, so pointing this grid at a different set remounts them rather than carrying text across,
 * and a box drops its buffer on blur, so an unfocused cell always renders what is stored. What that
 * does NOT survive is the grid being rewritten under a focused cell, which is refreshBrandDataset
 * replacing columns and rows in place: the pending write would land at the same row/column index in
 * a table that is no longer the same table. That refresh is a click elsewhere, which blurs and
 * commits first, so it takes a background refresh to hit it. There is no such thing today.
 */
export function DatasetGrid({ datasetId }: { datasetId: string }) {
  const dataset = useTrafficStore((s) => s.brandDatasets.find((d) => d.id === datasetId))
  const setDatasetCell = useTrafficStore((s) => s.setDatasetCell)
  const setDatasetColumn = useTrafficStore((s) => s.setDatasetColumn)
  const addDatasetRow = useTrafficStore((s) => s.addDatasetRow)
  const addDatasetColumn = useTrafficStore((s) => s.addDatasetColumn)

  if (!dataset) return <div className="bds-missing">This data set no longer exists.</div>
  const rows = squareRows(dataset.columns, dataset.rows)

  return (
    <div className="bds-grid-wrap">
      <table className="bds-grid">
        <thead>
          <tr>
            <th className="bds-corner" />
            {dataset.columns.map((c, ci) => (
              <th key={ci}>
                <BufferedTextarea
                  key={`${dataset.id}:head:${ci}`}
                  as="input"
                  className="bds-colhead"
                  value={c}
                  onCommit={(label) => setDatasetColumn(dataset.id, ci, label)}
                />
              </th>
            ))}
            <th className="bds-addcol">
              <button title="Add column" aria-label="Add column" onClick={() => addDatasetColumn(dataset.id)}>+</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              <td className="bds-rownum">{ri + 1}</td>
              {dataset.columns.map((_, ci) => (
                <td key={ci}>
                  <BufferedTextarea
                    key={`${dataset.id}:${ri}:${ci}`}
                    as="input"
                    className="bds-cell"
                    value={r[ci] ?? ''}
                    onCommit={(v) => setDatasetCell(dataset.id, ri, ci, v)}
                  />
                </td>
              ))}
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <button className="bds-addrow" onClick={() => addDatasetRow(dataset.id)}>+ Add row</button>
    </div>
  )
}
