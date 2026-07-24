import { useTrafficStore } from '../store/useTrafficStore'
import { DatasetGrid } from './DatasetGrid'

/**
 * A data set opened as its own canvas tab — the full-page spreadsheet. Double-clicking a Data source
 * card on the canvas opens the linked data set here (see FlowsView.openDataCard). The tab strip
 * (CanvasProjectTabs) manages which data set is active.
 */
export function DatasetPage() {
  const id = useTrafficStore((s) => s.activeDatasetId)
  const dataset = useTrafficStore((s) => s.brandDatasets.find((d) => d.id === id))
  const renameBrandDataset = useTrafficStore((s) => s.renameBrandDataset)
  const deleteBrandDataset = useTrafficStore((s) => s.deleteBrandDataset)
  const closeDatasetTab = useTrafficStore((s) => s.closeDatasetTab)

  if (!id || !dataset) {
    return (
      <div className="dataset-page">
        <div className="bds-missing">No data set open.</div>
      </div>
    )
  }

  return (
    <div className="dataset-page">
      <div className="dataset-page-head">
        <span className="dataset-page-eyebrow">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg>
          {dataset.brand} · Data set
        </span>
        <input
          className="dataset-page-name"
          value={dataset.name}
          placeholder="Untitled data set"
          onChange={(e) => renameBrandDataset(dataset.id, e.target.value)}
        />
        <button
          className="bds-del"
          title="Delete data set"
          onClick={() => { deleteBrandDataset(dataset.id); closeDatasetTab(dataset.id) }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>
          Delete
        </button>
      </div>
      <DatasetGrid datasetId={dataset.id} />
    </div>
  )
}
