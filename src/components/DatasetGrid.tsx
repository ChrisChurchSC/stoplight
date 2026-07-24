import { useTrafficStore } from '../store/useTrafficStore'
import { squareRows } from '../domain/brandDataset'

/**
 * The editable grid for one brand data set — labelled columns + free-text cells, with add-row and
 * add-column. Shared by the brand-page inline editor (BrandDataSets) and the full-page data-set tab
 * (DatasetPage) so the spreadsheet behaves identically wherever it's opened.
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
                <input
                  className="bds-colhead"
                  value={c}
                  onChange={(e) => setDatasetColumn(dataset.id, ci, e.target.value)}
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
                  <input
                    className="bds-cell"
                    value={r[ci] ?? ''}
                    onChange={(e) => setDatasetCell(dataset.id, ri, ci, e.target.value)}
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
