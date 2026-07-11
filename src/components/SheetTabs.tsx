import { useTrafficStore } from '../store/useTrafficStore'

type SheetPage = 'brand' | 'records' | 'people' | 'segments' | 'channelrecords' | 'proofpoints'

// The record pages, presented as spreadsheet "sheets" you flip between along a bottom tab bar
// (like Google Sheets), in addition to the left sidebar. Brand is first: the single source of truth.
const SHEETS: { page: SheetPage; label: string }[] = [
  { page: 'brand', label: 'Brand' },
  { page: 'segments', label: 'Segments' },
  { page: 'people', label: 'People' },
  { page: 'records', label: 'Companies' },
  { page: 'channelrecords', label: 'Channels' },
  { page: 'proofpoints', label: 'Proof points' },
]

/**
 * A workbook-style tab strip pinned to the bottom of the records area. Only shows while a record
 * sheet is open; clicking a tab switches sheets. Mirrors the spreadsheet muscle memory of flipping
 * tabs at the bottom of a Google Sheet.
 */
export function SheetTabs() {
  const page = useTrafficStore((s) => s.page)
  const setPage = useTrafficStore((s) => s.setPage)
  if (!SHEETS.some((s) => s.page === page)) return null
  return (
    <div className="sheet-tabs" role="tablist" aria-label="Record sheets">
      <div className="sheet-tab-list">
        {SHEETS.map((s) => (
          <button
            key={s.page}
            className={`sheet-tab${s.page === page ? ' on' : ''}`}
            role="tab"
            aria-selected={s.page === page}
            onClick={() => setPage(s.page)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
