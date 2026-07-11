import { useState } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'

type SheetPage =
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
 * Workbook tabs attached to the bottom of a record sheet (like Google Sheets). Each of the three
 * groups — Audience, Message, Activation — is a dropdown of its nested sheets; the active group
 * shows the open sheet (e.g. "Audience · Companies"). Rendered inside each sheet so it reads as
 * part of the spreadsheet, not a floating page footer.
 */
export function SheetTabs() {
  const page = useTrafficStore((s) => s.page)
  const setPage = useTrafficStore((s) => s.setPage)
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="sheet-tabs" role="tablist" aria-label="Record sheets">
      {GROUPS.map((g, gi) => {
        const active = g.sheets.find((sh) => sh.page === page)
        return (
          <div key={g.label} className="sheet-tab-drop">
            <button
              className={`sheet-tab sheet-tab-parent${active ? ' on' : ''}`}
              aria-haspopup="true"
              aria-expanded={open === gi}
              onClick={() => setOpen((o) => (o === gi ? null : gi))}
            >
              {active ? `${g.label} · ${active.label}` : g.label}
              <span className="sheet-caret" aria-hidden="true">▾</span>
            </button>
            {open === gi && (
              <>
                <div className="sheet-drop-scrim" onClick={() => setOpen(null)} />
                <div className="sheet-drop-menu" role="menu">
                  <div className="sheet-drop-head">{g.label}</div>
                  {g.sheets.map((sh) => (
                    <button
                      key={sh.page}
                      className={`sheet-drop-item${sh.page === page ? ' on' : ''}`}
                      role="menuitem"
                      onClick={() => {
                        setPage(sh.page)
                        setOpen(null)
                      }}
                    >
                      {sh.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
