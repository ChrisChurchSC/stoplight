import { useState } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import { DatasetGrid } from './DatasetGrid'

/**
 * A brand's data sets — the flexible half of the hybrid brand model. Each data set is a blank
 * spreadsheet the user fills out however they like; the cards preview them as tiny spreadsheets.
 * Clicking a card opens a simple editable grid (labelled columns + free-text cells, add row/col).
 * Free-form on purpose: nothing here feeds Hansel, so there are no required fields.
 */

// A tiny non-interactive spreadsheet drawn on the card — a header band over a few body rows, with
// filled cells reflecting where the real data set actually has content, so cards read as "data".
function MiniSheet({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const cols = Math.min(Math.max(columns.length, 1), 5)
  const bodyRows = 4
  return (
    <div className="bds-mini" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: cols }, (_, c) => (
        <div key={`h${c}`} className="bds-mini-cell head" />
      ))}
      {Array.from({ length: bodyRows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const filled = !!rows[r]?.[c]?.trim()
          return <div key={`${r}-${c}`} className={`bds-mini-cell${filled ? ' filled' : ''}`} />
        }),
      )}
    </div>
  )
}

export function BrandDataSets({ brand }: { brand: string }) {
  const datasets = useTrafficStore((s) => s.brandDatasets)
  const addBrandDataset = useTrafficStore((s) => s.addBrandDataset)
  const renameBrandDataset = useTrafficStore((s) => s.renameBrandDataset)
  const deleteBrandDataset = useTrafficStore((s) => s.deleteBrandDataset)

  const [openId, setOpenId] = useState<string | null>(null)

  const mine = datasets.filter((d) => d.brand === brand)
  const open = openId ? mine.find((d) => d.id === openId) : null

  // Editor: one open data set as an editable grid.
  if (open) {
    return (
      <div className="bds-editor">
        <div className="bds-editor-head">
          <button className="bds-back" onClick={() => setOpenId(null)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
            All data sets
          </button>
          <input
            className="bds-name-input"
            value={open.name}
            placeholder="Untitled data set"
            onChange={(e) => renameBrandDataset(open.id, e.target.value)}
          />
          <button className="bds-del" title="Delete data set" onClick={() => { deleteBrandDataset(open.id); setOpenId(null) }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>
            Delete
          </button>
        </div>
        <DatasetGrid datasetId={open.id} />
      </div>
    )
  }

  // Gallery: the brand's data sets as tiny-spreadsheet cards, plus an "add" card.
  return (
    <div className="bds">
      <div className="bds-lead">
        Free-form spreadsheets for anything the brand basics don&rsquo;t cover: research, competitor
        notes, campaign learnings. Fill them out however you like.
      </div>
      <div className="bds-cards">
        {mine.map((d) => (
          <button key={d.id} className="bds-card" onClick={() => setOpenId(d.id)}>
            <MiniSheet columns={d.columns} rows={d.rows} />
            <span className="bds-card-name">{d.name || 'Untitled data set'}</span>
            <span className="bds-card-meta">{d.rows.length} rows · {d.columns.length} cols</span>
          </button>
        ))}
        <button
          className="bds-card bds-card-add"
          onClick={() => {
            const id = addBrandDataset(brand)
            setOpenId(id)
          }}
        >
          <span className="bds-add-plus" aria-hidden="true">+</span>
          <span className="bds-card-name">Add a data set</span>
          <span className="bds-card-meta">Blank spreadsheet</span>
        </button>
      </div>
    </div>
  )
}
