import { CHANNELS } from '../domain/channels'
import { newAudience, type AudienceType } from '../domain/audiences'
import type { RecordColumn, RecordField, RecordFieldKind } from '../domain/records'
import type { ChannelId } from '../domain/types'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

const ICON = (
  <>
    <path d="M12 3 2 8l10 5 10-5-10-5Z" />
    <path d="m2 13 10 5 10-5" />
  </>
)

// Segments IS the brand's audiences, surfaced as records. One spec drives the columns,
// the drawer fields, the row mapping, and the write-back, so everything stays in sync and
// editing a segment updates the underlying audience (the same data used to generate copy).
const line = (arr?: string[]) => (arr ?? []).join('\n')
const parseLines = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean)
const parseCsv = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean)
const chanId = new Map<string, ChannelId>()
for (const id of Object.keys(CHANNELS) as ChannelId[]) {
  const ch = CHANNELS[id]
  chanId.set(id.toLowerCase(), id)
  if (ch?.label) chanId.set(ch.label.toLowerCase(), id)
  if (ch?.short) chanId.set(ch.short.toLowerCase(), id)
}

interface Spec {
  key: string
  label: string
  kind: RecordFieldKind
  /** Column width when this field should also show as a table column. */
  col?: number
  get: (a: AudienceType) => string
  set: (a: AudienceType, v: string) => void
}

const SPECS: Spec[] = [
  { key: 'name', label: 'Segment', kind: 'name', col: 200, get: (a) => a.name, set: (a, v) => { a.name = v } },
  { key: 'who', label: 'Who it is', kind: 'text', col: 220, get: (a) => a.definition || a.role || '', set: (a, v) => { a.definition = v } },
  { key: 'role', label: 'Role / buyer', kind: 'text', get: (a) => a.role || '', set: (a, v) => { a.role = v } },
  { key: 'angle', label: 'Message angle', kind: 'multiline', col: 300, get: (a) => a.messageAngle || '', set: (a, v) => { a.messageAngle = v } },
  { key: 'antiMessage', label: 'Anti-message (what not to say)', kind: 'multiline', get: (a) => a.antiMessage || '', set: (a, v) => { a.antiMessage = v } },
  { key: 'outcome', label: 'Conversion outcome', kind: 'text', col: 160, get: (a) => a.outcome || '', set: (a, v) => { a.outcome = v } },
  { key: 'funnel', label: 'Funnel stage', kind: 'text', col: 130, get: (a) => a.funnelStage || '', set: (a, v) => { a.funnelStage = v } },
  { key: 'tier', label: 'Value tier', kind: 'text', col: 140, get: (a) => a.tier || '', set: (a, v) => { a.tier = v } },
  { key: 'strategy', label: 'GTM strategy', kind: 'text', get: (a) => a.strategy || '', set: (a, v) => { a.strategy = v } },
  { key: 'pains', label: 'Pains', kind: 'multiline', col: 240, get: (a) => line(a.pains), set: (a, v) => { a.pains = parseLines(v) } },
  { key: 'goals', label: 'Goals', kind: 'multiline', get: (a) => a.goals || '', set: (a, v) => { a.goals = v } },
  { key: 'goalTags', label: 'Goal tags', kind: 'multiline', get: (a) => line(a.goalTags), set: (a, v) => { a.goalTags = parseLines(v) } },
  { key: 'objections', label: 'Objections', kind: 'multiline', get: (a) => a.objections || '', set: (a, v) => { a.objections = v } },
  { key: 'triggers', label: 'Buying triggers', kind: 'multiline', get: (a) => line(a.triggers), set: (a, v) => { a.triggers = parseLines(v) } },
  { key: 'channels', label: 'Channels', kind: 'multiline', col: 180, get: (a) => (a.channels ?? []).map((id) => CHANNELS[id]?.label ?? id).join('\n'), set: (a, v) => { a.channels = parseLines(v).map((s) => chanId.get(s.toLowerCase())).filter((x): x is ChannelId => !!x) } },
  { key: 'leadProof', label: 'Lead proof points', kind: 'multiline', get: (a) => line(a.leadProof), set: (a, v) => { a.leadProof = parseLines(v) } },
  { key: 'examples', label: 'Example accounts', kind: 'multiline', get: (a) => line(a.examples), set: (a, v) => { a.examples = parseLines(v) } },
  { key: 'aliases', label: 'Aliases', kind: 'multiline', get: (a) => line(a.aliases), set: (a, v) => { a.aliases = parseLines(v) } },
  { key: 'geos', label: 'Geographies', kind: 'multiline', get: (a) => line(a.geos), set: (a, v) => { a.geos = parseLines(v) } },
  { key: 'functions', label: 'Job functions', kind: 'multiline', get: (a) => line(a.functions), set: (a, v) => { a.functions = parseLines(v) } },
  { key: 'seniority', label: 'Seniority', kind: 'text', get: (a) => a.seniority || '', set: (a, v) => { a.seniority = v } },
  { key: 'industry', label: 'Industry', kind: 'text', get: (a) => a.industry || '', set: (a, v) => { a.industry = v } },
  { key: 'companySize', label: 'Company size', kind: 'text', get: (a) => a.companySize || '', set: (a, v) => { a.companySize = v } },
  { key: 'ageRanges', label: 'Age ranges', kind: 'text', get: (a) => (a.ageRanges ?? []).join(', '), set: (a, v) => { a.ageRanges = parseCsv(v) } },
  { key: 'incomeRanges', label: 'Income ranges', kind: 'text', get: (a) => (a.incomeRanges ?? []).join(', '), set: (a, v) => { a.incomeRanges = parseCsv(v) } },
  { key: 'gender', label: 'Gender', kind: 'text', get: (a) => a.gender || '', set: (a, v) => { a.gender = v } },
]

const SEGMENT_COLUMNS: RecordColumn[] = SPECS.filter((s) => s.col).map((s) => ({ key: s.key, label: s.label, kind: s.kind, width: s.col! }))
const SEGMENT_FIELDS: RecordField[] = SPECS.map((s) => ({ key: s.key, label: s.label, kind: s.kind }))

type SegRow = { id: string } & Record<string, string>

export function SegmentsView() {
  const { brands } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const brand = clientFilter !== 'all' ? clientFilter : brands[0]?.name ?? ''
  const audiences = clientAudiences[brand] ?? []

  const rows: SegRow[] = audiences.map((a) => {
    const r: SegRow = { id: a.id }
    for (const s of SPECS) r[s.key] = s.get(a)
    return r
  })

  const patchAudience = (a: AudienceType, patch: Partial<SegRow>): AudienceType => {
    const p: AudienceType = { ...a }
    for (const s of SPECS) {
      const v = patch[s.key]
      if (v !== undefined) s.set(p, v)
    }
    return p
  }

  return (
    <RecordsTable
      title="Segments"
      icon={ICON}
      columns={SEGMENT_COLUMNS}
      fields={SEGMENT_FIELDS}
      statuses={[]}
      rows={rows}
      noun={['segment', 'segments']}
      onAdd={() => setClientAudiences(brand, [newAudience({ name: 'New segment' }), ...audiences])}
      onUpdate={(id, patch) =>
        setClientAudiences(brand, audiences.map((a) => (a.id === id ? patchAudience(a, patch) : a)))
      }
      onDelete={(id) => setClientAudiences(brand, audiences.filter((a) => a.id !== id))}
    />
  )
}
