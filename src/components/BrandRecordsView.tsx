import { useMemo } from 'react'
import type { ClientProfile } from '../domain/clients'
import type { RecordColumn, RecordField, RecordFieldKind } from '../domain/records'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

// The diamond brand mark (matches the sidebar's "brand" icon).
const ICON = <path d="M12 2 22 12 12 22 2 12Z" />

const line = (arr?: string[]) => (arr ?? []).join('\n')
const parseLines = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean)

interface Spec {
  key: string
  label: string
  kind: RecordFieldKind
  /** Column width when this field should also show as a table column. */
  col?: number
  get: (p: ClientProfile) => string
  set: (p: ClientProfile, v: string) => void
}

// The brand-profile fields the app already stores (voice / positioning / mission …),
// surfaced as an editable records table. Edits write back to clientProfiles — the same
// data generation reads — so the Brand page IS the brand system, not a copy of it.
const SPECS: Spec[] = [
  { key: 'oneLiner', label: 'One-liner', kind: 'text', col: 240, get: (p) => p.oneLiner || '', set: (p, v) => { p.oneLiner = v } },
  { key: 'voice', label: 'Voice', kind: 'multiline', col: 240, get: (p) => p.voice || '', set: (p, v) => { p.voice = v } },
  { key: 'wedge', label: 'Positioning', kind: 'multiline', col: 280, get: (p) => p.wedge || '', set: (p, v) => { p.wedge = v } },
  { key: 'website', label: 'Website', kind: 'url', col: 200, get: (p) => p.website || '', set: (p, v) => { p.website = v } },
  { key: 'industry', label: 'Industry', kind: 'text', get: (p) => p.industry || '', set: (p, v) => { p.industry = v } },
  { key: 'mission', label: 'Mission', kind: 'multiline', get: (p) => p.mission || '', set: (p, v) => { p.mission = v } },
  { key: 'businessGoal', label: 'Business goal', kind: 'multiline', get: (p) => p.businessGoal || '', set: (p, v) => { p.businessGoal = v } },
  { key: 'differentiators', label: 'Differentiators', kind: 'multiline', get: (p) => line(p.differentiators), set: (p, v) => { p.differentiators = parseLines(v) } },
  { key: 'values', label: 'Values', kind: 'multiline', get: (p) => line(p.values), set: (p, v) => { p.values = parseLines(v) } },
  { key: 'products', label: 'Products / programs', kind: 'multiline', get: (p) => line(p.products), set: (p, v) => { p.products = parseLines(v) } },
  { key: 'traction', label: 'Traction', kind: 'text', get: (p) => p.traction || '', set: (p, v) => { p.traction = v } },
  { key: 'founded', label: 'Founded', kind: 'text', get: (p) => p.founded || '', set: (p, v) => { p.founded = v } },
  { key: 'headquarters', label: 'Headquarters', kind: 'text', get: (p) => p.headquarters || '', set: (p, v) => { p.headquarters = v } },
  { key: 'businessModel', label: 'Business model', kind: 'text', get: (p) => p.businessModel || '', set: (p, v) => { p.businessModel = v } },
  { key: 'region', label: 'Region', kind: 'text', get: (p) => p.region || '', set: (p, v) => { p.region = v } },
]

const NAME_COL: RecordColumn = { key: 'name', label: 'Brand', kind: 'name', width: 200 }
const BRAND_COLUMNS: RecordColumn[] = [NAME_COL, ...SPECS.filter((s) => s.col).map((s) => ({ key: s.key, label: s.label, kind: s.kind, width: s.col! }))]
const BRAND_FIELDS: RecordField[] = [{ key: 'name', label: 'Brand', kind: 'name' }, ...SPECS.map((s) => ({ key: s.key, label: s.label, kind: s.kind }))]

type BrandRow = { id: string } & Record<string, string>

export function BrandRecordsView() {
  const { brands } = useHomeCanvases()
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)
  const removeClientProfile = useTrafficStore((s) => s.removeClientProfile)

  // Every brand the app knows: those with campaigns (from canvases) plus profile-only ones.
  const names = useMemo(() => {
    const set = new Set<string>()
    for (const b of brands) set.add(b.name)
    for (const n of Object.keys(clientProfiles)) set.add(n)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [brands, clientProfiles])

  const rows: BrandRow[] = names.map((name) => {
    const p = clientProfiles[name] ?? {}
    const r: BrandRow = { id: name, name }
    for (const s of SPECS) r[s.key] = s.get(p)
    return r
  })

  const uniqueName = (base: string): string => {
    let n = base
    let i = 2
    while (names.includes(n)) n = `${base} ${i++}`
    return n
  }

  return (
    <RecordsTable
      title="Brand"
      icon={ICON}
      columns={BRAND_COLUMNS}
      fields={BRAND_FIELDS}
      statuses={[]}
      rows={rows}
      noun={['brand', 'brands']}
      onAdd={() => setClientProfile(uniqueName('New brand'), {})}
      onUpdate={(id, patch) => {
        const next: ClientProfile = { ...(clientProfiles[id] ?? {}) }
        for (const s of SPECS) {
          const v = patch[s.key]
          if (v !== undefined) s.set(next, v)
        }
        // Renaming a brand moves its profile record to the new key.
        const newName = patch.name?.trim()
        if (newName && newName !== id) {
          setClientProfile(newName, next)
          removeClientProfile(id)
        } else {
          setClientProfile(id, next)
        }
      }}
      onDelete={(id) => removeClientProfile(id)}
    />
  )
}
