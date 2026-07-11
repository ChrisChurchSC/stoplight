import { useState } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'

type SheetPage = 'brand' | 'records' | 'people' | 'segments' | 'channelrecords' | 'proofpoints'

// Segments / Companies / People are facets of the same thing — the brand's audiences — so they
// nest under one "Audiences" tab (a dropdown). Channels, Proof points, and Brand are their own sheets.
const AUDIENCE: { page: SheetPage; label: string }[] = [
  { page: 'segments', label: 'Segments' },
  { page: 'records', label: 'Companies' },
  { page: 'people', label: 'People' },
]
const TOP: { page: SheetPage; label: string }[] = [
  { page: 'channelrecords', label: 'Channels' },
  { page: 'proofpoints', label: 'Proof points' },
  { page: 'brand', label: 'Brand' },
]

/**
 * Workbook tabs attached to the bottom of a record sheet (like Google Sheets). Audiences nests its
 * three record types behind a dropdown; everything else is a flat tab. Rendered inside each sheet
 * so it reads as part of the spreadsheet, not a floating page footer.
 */
export function SheetTabs() {
  const page = useTrafficStore((s) => s.page)
  const setPage = useTrafficStore((s) => s.setPage)
  const [open, setOpen] = useState(false)
  const inAudience = AUDIENCE.some((s) => s.page === page)
  const audienceLabel = AUDIENCE.find((s) => s.page === page)?.label
  return (
    <div className="sheet-tabs" role="tablist" aria-label="Record sheets">
      <div className="sheet-tab-drop">
        <button
          className={`sheet-tab sheet-tab-parent${inAudience ? ' on' : ''}`}
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {inAudience && audienceLabel ? `Audiences · ${audienceLabel}` : 'Audiences'}
          <span className="sheet-caret" aria-hidden="true">▾</span>
        </button>
        {open && (
          <>
            <div className="sheet-drop-scrim" onClick={() => setOpen(false)} />
            <div className="sheet-drop-menu" role="menu">
              {AUDIENCE.map((s) => (
                <button
                  key={s.page}
                  className={`sheet-drop-item${s.page === page ? ' on' : ''}`}
                  role="menuitem"
                  onClick={() => {
                    setPage(s.page)
                    setOpen(false)
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {TOP.map((s) => (
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
  )
}
