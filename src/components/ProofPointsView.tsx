import { useEffect } from 'react'
import { canvasBrandScope } from '../domain/brand'
import type { Rtb } from '../domain/rtb'
import { freshRecordId, type RecordColumn, type RecordField, type RecordFieldKind } from '../domain/records'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

// A checkmark — proof / reason to believe.
const ICON = <path d="m5 12.5 4.5 4.5L19 6" />

// Proof points (RTBs) surfaced as records. Unlike the singular brand, these are a
// collection of reusable proof — so they get the same records-table shape as
// Companies / People / Segments. One spec drives the columns, the drawer fields, and
// the write-back to the brand's messaging library.
interface Spec {
  key: string
  label: string
  kind: RecordFieldKind
  group: string
  col?: number
  get: (r: Rtb) => string
  set: (r: Rtb, v: string) => void
}
const SPECS: Spec[] = [
  { key: 'name', label: 'Proof point', kind: 'name', group: 'Claim', col: 240, get: (r) => r.label, set: (r, v) => { r.label = v } },
  { key: 'detail', label: 'Detail', kind: 'multiline', group: 'Claim', col: 340, get: (r) => r.detail || '', set: (r, v) => { r.detail = v } },
  { key: 'metric', label: 'Metric', kind: 'text', group: 'Evidence', col: 160, get: (r) => r.metric || '', set: (r, v) => { r.metric = v } },
  { key: 'source', label: 'Source', kind: 'text', group: 'Evidence', col: 180, get: (r) => r.source || '', set: (r, v) => { r.source = v } },
]

const COLUMNS: RecordColumn[] = SPECS.filter((s) => s.col).map((s) => ({ key: s.key, label: s.label, kind: s.kind, width: s.col!, group: s.group }))
const FIELDS: RecordField[] = SPECS.map((s) => ({ key: s.key, label: s.label, kind: s.kind, group: s.group }))

type Row = { id: string } & Record<string, string>

export function ProofPointsView() {
  const { brands } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const setMessagingBrand = useTrafficStore((s) => s.setMessagingBrand)
  const library = useTrafficStore((s) => s.library)
  const addLibraryItem = useTrafficStore((s) => s.addLibraryItem)
  const updateLibraryItem = useTrafficStore((s) => s.updateLibraryItem)
  const removeLibraryItem = useTrafficStore((s) => s.removeLibraryItem)
  // Scoped by canvasBrandScope, not by "whichever brand is first": with several in the account and
  // none selected, guessing one showed that brand's proof here and pointed the library write at it.
  const brand = canvasBrandScope(clientFilter, brands.map((b) => b.name))

  // Point the messaging library at this brand so reads + writes target it.
  useEffect(() => {
    if (brand) setMessagingBrand(brand)
  }, [brand, setMessagingBrand])

  const rtbs = library.rtbs
  const rows: Row[] = rtbs.map((r) => {
    const row: Row = { id: r.id }
    for (const s of SPECS) row[s.key] = s.get(r)
    return row
  })

  return (
    <RecordsTable
      title="Proof points"
      term="proofPoint"
      icon={ICON}
      columns={COLUMNS}
      fields={FIELDS}
      statuses={[]}
      rows={rows}
      noun={['proof point', 'proof points']}
      onAdd={() => {
        // Return the id (and read live rows in onUpdate) so a paste that spins up several rows can
        // fill each one it just created.
        const id = freshRecordId('lrtb')
        addLibraryItem('rtbs', { id, label: 'New proof point', detail: '', approved: false })
        return id
      }}
      onUpdate={(id, patch) => {
        const rtb = (useTrafficStore.getState().library.rtbs ?? []).find((r) => r.id === id)
        if (!rtb) return
        const next: Rtb = { ...rtb }
        for (const s of SPECS) {
          const v = patch[s.key]
          if (v !== undefined) s.set(next, v)
        }
        updateLibraryItem('rtbs', id, next as unknown as Record<string, unknown>)
      }}
      onDelete={(id) => removeLibraryItem('rtbs', id)}
    />
  )
}
