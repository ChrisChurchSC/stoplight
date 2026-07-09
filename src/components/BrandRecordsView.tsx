import { useMemo } from 'react'
import type { ClientProfile, Competitor } from '../domain/clients'
import type { RecordColumn, RecordField, RecordFieldKind } from '../domain/records'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

// The diamond brand mark (matches the sidebar's "brand" icon).
const ICON = <path d="M12 2 22 12 12 22 2 12Z" />

const line = (arr?: string[]) => (arr ?? []).join('\n')
const parseLines = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean)
const csv = (arr?: string[]) => (arr ?? []).join(', ')
const parseCsv = (v: string) => v.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)
// A "Name — note" line splits on an em-dash or a spaced hyphen.
const splitPair = (ln: string): [string, string] => {
  const [name, ...rest] = ln.split(/\s+[—–-]\s+/)
  return [name.trim(), rest.join(' — ').trim()]
}
const fmtTeam = (arr?: { name: string; role?: string }[]) => (arr ?? []).map((t) => (t.role ? `${t.name} — ${t.role}` : t.name)).join('\n')
const parseTeam = (v: string) => parseLines(v).map((ln) => { const [name, role] = splitPair(ln); return role ? { name, role } : { name } })
const fmtCompetitors = (arr?: Competitor[]) => (arr ?? []).map((c) => (c.what ? `${c.name} — ${c.what}` : c.name)).join('\n')
const parseCompetitors = (v: string, existing?: Competitor[]): Competitor[] =>
  parseLines(v).map((ln) => {
    const [name, what] = splitPair(ln)
    const prev = (existing ?? []).find((c) => c.name.toLowerCase() === name.toLowerCase())
    return { ...prev, name, what: what || prev?.what }
  })

interface Spec {
  key: string
  label: string
  kind: RecordFieldKind
  group: string
  /** Column width when this field should also show as a table column. */
  col?: number
  get: (p: ClientProfile) => string
  set: (p: ClientProfile, v: string) => void
}

// The whole brand book, surfaced as one editable record per brand: identity, positioning,
// voice, messaging, visual identity and company facts. Edits write straight back to
// clientProfiles (voice fields to the structured voiceGuide) — the same brand system
// generation reads — so the Brand page IS the source of truth, not a copy of it.
const SPECS: Spec[] = [
  // ---- Identity ----
  { key: 'oneLiner', label: 'One-liner', kind: 'text', group: 'Identity', col: 240, get: (p) => p.oneLiner || '', set: (p, v) => { p.oneLiner = v } },
  { key: 'category', label: 'Category', kind: 'text', group: 'Identity', get: (p) => p.category || '', set: (p, v) => { p.category = v } },
  { key: 'mission', label: 'Mission', kind: 'multiline', group: 'Identity', get: (p) => p.mission || '', set: (p, v) => { p.mission = v } },
  { key: 'values', label: 'Values', kind: 'multiline', group: 'Identity', get: (p) => line(p.values), set: (p, v) => { p.values = parseLines(v) } },
  { key: 'founded', label: 'Founded', kind: 'text', group: 'Identity', get: (p) => p.founded || '', set: (p, v) => { p.founded = v } },
  { key: 'headquarters', label: 'Headquarters', kind: 'text', group: 'Identity', get: (p) => p.headquarters || '', set: (p, v) => { p.headquarters = v } },
  { key: 'businessModel', label: 'Business model', kind: 'text', group: 'Identity', get: (p) => p.businessModel || '', set: (p, v) => { p.businessModel = v } },
  { key: 'region', label: 'Region', kind: 'text', group: 'Identity', get: (p) => p.region || '', set: (p, v) => { p.region = v } },
  // ---- Positioning ----
  { key: 'wedge', label: 'Positioning', kind: 'multiline', group: 'Positioning', col: 280, get: (p) => p.wedge || '', set: (p, v) => { p.wedge = v } },
  { key: 'differentiators', label: 'Differentiators', kind: 'multiline', group: 'Positioning', get: (p) => line(p.differentiators), set: (p, v) => { p.differentiators = parseLines(v) } },
  { key: 'competitors', label: 'Competitors', kind: 'multiline', group: 'Positioning', get: (p) => fmtCompetitors(p.competitors), set: (p, v) => { p.competitors = parseCompetitors(v, p.competitors) } },
  { key: 'traction', label: 'Traction', kind: 'text', group: 'Positioning', get: (p) => p.traction || '', set: (p, v) => { p.traction = v } },
  // ---- Voice & tone (wired to the structured voiceGuide) ----
  { key: 'voice', label: 'Voice summary', kind: 'multiline', group: 'Voice & tone', col: 240, get: (p) => p.voice || '', set: (p, v) => { p.voice = v } },
  { key: 'vgTraits', label: 'Voice traits', kind: 'multiline', group: 'Voice & tone', get: (p) => line(p.voiceGuide?.traits), set: (p, v) => { p.voiceGuide = { ...p.voiceGuide, traits: parseLines(v) } } },
  { key: 'vgDos', label: 'Do say', kind: 'multiline', group: 'Voice & tone', get: (p) => line(p.voiceGuide?.dos), set: (p, v) => { p.voiceGuide = { ...p.voiceGuide, dos: parseLines(v) } } },
  { key: 'vgDonts', label: "Don't say", kind: 'multiline', group: 'Voice & tone', get: (p) => line(p.voiceGuide?.donts), set: (p, v) => { p.voiceGuide = { ...p.voiceGuide, donts: parseLines(v) } } },
  { key: 'vgPreferred', label: 'Words we use', kind: 'multiline', group: 'Voice & tone', get: (p) => line(p.voiceGuide?.preferredWords), set: (p, v) => { p.voiceGuide = { ...p.voiceGuide, preferredWords: parseLines(v) } } },
  { key: 'vgAvoid', label: 'Words we avoid', kind: 'multiline', group: 'Voice & tone', get: (p) => line(p.voiceGuide?.avoidWords), set: (p, v) => { p.voiceGuide = { ...p.voiceGuide, avoidWords: parseLines(v) } } },
  { key: 'vgMechanics', label: 'Mechanics', kind: 'text', group: 'Voice & tone', get: (p) => p.voiceGuide?.mechanics || '', set: (p, v) => { p.voiceGuide = { ...p.voiceGuide, mechanics: v } } },
  { key: 'vgReading', label: 'Reading level', kind: 'text', group: 'Voice & tone', get: (p) => p.voiceGuide?.readingLevel || '', set: (p, v) => { p.voiceGuide = { ...p.voiceGuide, readingLevel: v } } },
  // ---- Messaging ----
  { key: 'valueProps', label: 'Value propositions', kind: 'multiline', group: 'Messaging', get: (p) => line(p.valueProps), set: (p, v) => { p.valueProps = parseLines(v) } },
  { key: 'pillars', label: 'Messaging pillars', kind: 'multiline', group: 'Messaging', get: (p) => line(p.pillars), set: (p, v) => { p.pillars = parseLines(v) } },
  { key: 'proofPoints', label: 'Proof points', kind: 'multiline', group: 'Messaging', get: (p) => line(p.proofPoints), set: (p, v) => { p.proofPoints = parseLines(v) } },
  { key: 'taglines', label: 'Taglines', kind: 'multiline', group: 'Messaging', get: (p) => line(p.taglines), set: (p, v) => { p.taglines = parseLines(v) } },
  { key: 'elevatorPitch', label: 'Elevator pitch', kind: 'multiline', group: 'Messaging', get: (p) => p.elevatorPitch || '', set: (p, v) => { p.elevatorPitch = v } },
  { key: 'boilerplate', label: 'Boilerplate', kind: 'multiline', group: 'Messaging', get: (p) => p.boilerplate || '', set: (p, v) => { p.boilerplate = v } },
  // ---- Visual identity ----
  { key: 'logo', label: 'Logo', kind: 'url', group: 'Visual identity', get: (p) => p.logo || '', set: (p, v) => { p.logo = v } },
  { key: 'colors', label: 'Colors', kind: 'colors', group: 'Visual identity', col: 150, get: (p) => csv(p.colors), set: (p, v) => { p.colors = parseCsv(v) } },
  { key: 'fonts', label: 'Fonts', kind: 'multiline', group: 'Visual identity', get: (p) => line(p.fonts), set: (p, v) => { p.fonts = parseLines(v) } },
  { key: 'imageryStyle', label: 'Imagery style', kind: 'multiline', group: 'Visual identity', get: (p) => p.imageryStyle || '', set: (p, v) => { p.imageryStyle = v } },
  // ---- Company ----
  { key: 'website', label: 'Website', kind: 'url', group: 'Company', col: 200, get: (p) => p.website || '', set: (p, v) => { p.website = v } },
  { key: 'industry', label: 'Industry', kind: 'text', group: 'Company', get: (p) => p.industry || '', set: (p, v) => { p.industry = v } },
  { key: 'businessGoal', label: 'Business goal', kind: 'multiline', group: 'Company', get: (p) => p.businessGoal || '', set: (p, v) => { p.businessGoal = v } },
  { key: 'businessKpi', label: 'North-star metric', kind: 'text', group: 'Company', get: (p) => p.businessKpi || '', set: (p, v) => { p.businessKpi = v } },
  { key: 'products', label: 'Products / programs', kind: 'multiline', group: 'Company', get: (p) => line(p.products), set: (p, v) => { p.products = parseLines(v) } },
  { key: 'team', label: 'Team', kind: 'multiline', group: 'Company', get: (p) => fmtTeam(p.team), set: (p, v) => { p.team = parseTeam(v) } },
  { key: 'notableClients', label: 'Notable clients / partners', kind: 'multiline', group: 'Company', get: (p) => line(p.notableClients), set: (p, v) => { p.notableClients = parseLines(v) } },
]

const NAME_COL: RecordColumn = { key: 'name', label: 'Brand', kind: 'name', width: 190 }
const BRAND_COLUMNS: RecordColumn[] = [NAME_COL, ...SPECS.filter((s) => s.col).map((s) => ({ key: s.key, label: s.label, kind: s.kind, width: s.col! }))]
const BRAND_FIELDS: RecordField[] = [{ key: 'name', label: 'Brand', kind: 'name', group: 'Identity' }, ...SPECS.map((s) => ({ key: s.key, label: s.label, kind: s.kind, group: s.group }))]

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
