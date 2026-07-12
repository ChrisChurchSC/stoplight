import { useState } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'

type SheetPage =
  | 'brands'
  | 'records'
  | 'people'
  | 'segments'
  | 'messages'
  | 'proofpoints'
  | 'objectives'
  | 'channelrecords'

// The record sheets, organized into the three things a campaign is made of: who you reach, what you
// say, and where it goes out. Each group is a dropdown of nested sheets (like Google Sheets tabs).
const GROUPS: { label: string; sheets: { page: SheetPage; label: string }[] }[] = [
  {
    label: 'Brand',
    sheets: [{ page: 'brands', label: 'Brands' }],
  },
  {
    label: 'Audience',
    sheets: [
      { page: 'records', label: 'Companies' },
      { page: 'people', label: 'People' },
      { page: 'segments', label: 'Segments' },
    ],
  },
  {
    label: 'Message',
    sheets: [
      { page: 'messages', label: 'Messages' },
      { page: 'proofpoints', label: 'Proof points' },
    ],
  },
  {
    label: 'Activation',
    sheets: [
      { page: 'channelrecords', label: 'Channels' },
      { page: 'objectives', label: 'Objectives' },
    ],
  },
]

/**
 * Workbook sheet tabs attached to the bottom of a record sheet (like Google Sheets). The tabs are
 * the peer sheets of whichever section you're in — on Companies you see Companies / People /
 * Segments, its Audience peers; on Messages you see its Message peers. A small section switcher on
 * the left hops between Audience / Message / Activation (jumping to that section's first sheet).
 * Rendered inside each sheet so it reads as part of the spreadsheet, not a floating page footer.
 */
export function SheetTabs() {
  const page = useTrafficStore((s) => s.page)
  const setPage = useTrafficStore((s) => s.setPage)
  const [open, setOpen] = useState(false)
  // The section (Audience / Message / Activation) that holds the sheet you're on. Its sheets are
  // the peer tabs shown to the right.
  const group = GROUPS.find((g) => g.sheets.some((sh) => sh.page === page)) ?? GROUPS[0]
  return (
    <div className="sheet-tabs" role="tablist" aria-label="Record sheets">
      <div className="sheet-tab-drop">
        <button
          className="sheet-group"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          title="Switch section"
        >
          {group.label}
          <span className="sheet-caret" aria-hidden="true">▾</span>
        </button>
        {open && (
          <>
            <div className="sheet-drop-scrim" onClick={() => setOpen(false)} />
            <div className="sheet-drop-menu" role="menu">
              <div className="sheet-drop-head">Sections</div>
              {GROUPS.map((g) => (
                <button
                  key={g.label}
                  className={`sheet-drop-item${g.label === group.label ? ' on' : ''}`}
                  role="menuitem"
                  onClick={() => {
                    setPage(g.sheets[0].page)
                    setOpen(false)
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <span className="sheet-tab-sep" aria-hidden="true" />
      {group.sheets.map((sh) => (
        <button
          key={sh.page}
          className={`sheet-tab${sh.page === page ? ' on' : ''}`}
          role="tab"
          aria-selected={sh.page === page}
          onClick={() => setPage(sh.page)}
        >
          {sh.label}
        </button>
      ))}
    </div>
  )
}
