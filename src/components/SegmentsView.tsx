import { useState } from 'react'
import { liveRecordUsage, splitAudiencesByUse } from '../domain/audienceUsage'
import { canvasBrandScope } from '../domain/brand'
import { CHANNELS } from '../domain/channels'
import { GENDERS, SENIORITIES, INDUSTRIES, COMPANY_SIZES, VALUE_TIERS, MARITAL_STATUSES } from '../domain/taxonomy'
import { newAudience, type AudienceType } from '../domain/audiences'
import { FUNNEL_STAGES } from '../domain/funnel'
import { draftAngle } from '../adapters/ask/draftAngle'
import type { RecordColumn, RecordField, RecordFieldKind } from '../domain/records'
import type { ChannelId } from '../domain/types'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'
import { RelatedList } from './RelatedList'

const ICON = (
  <>
    <path d="M12 3 2 8l10 5 10-5-10-5Z" />
    <path d="m2 13 10 5 10-5" />
  </>
)

// This page IS the brand's audiences, surfaced as records. One spec drives the columns,
// the drawer fields, the row mapping, and the write-back, so everything stays in sync and
// editing a row updates the underlying audience (the same data used to generate copy).
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
  /** A fixed pick-list (renders the cell as a dropdown), e.g. Funnel stage. */
  options?: readonly string[]
  /** Set false to disable sorting on this column (meaningless for long free text). */
  sortable?: boolean
  get: (a: AudienceType) => string
  set: (a: AudienceType, v: string) => void
}

const SPECS: Spec[] = [
  { key: 'name', label: 'Audience', kind: 'name', col: 200, get: (a) => a.name, set: (a, v) => { a.name = v } },
  { key: 'who', label: 'Who it is', kind: 'text', col: 220, sortable: false, get: (a) => a.definition || a.role || '', set: (a, v) => { a.definition = v } },
  { key: 'role', label: 'Role / buyer', kind: 'text', get: (a) => a.role || '', set: (a, v) => { a.role = v } },
  { key: 'angle', label: 'Message angle', kind: 'multiline', col: 300, sortable: false, get: (a) => a.messageAngle || '', set: (a, v) => { a.messageAngle = v } },
  { key: 'antiMessage', label: 'Anti-message (what not to say)', kind: 'multiline', get: (a) => a.antiMessage || '', set: (a, v) => { a.antiMessage = v } },
  { key: 'outcome', label: 'Conversion outcome', kind: 'text', col: 160, get: (a) => a.outcome || '', set: (a, v) => { a.outcome = v } },
  { key: 'funnel', label: 'Funnel stage', kind: 'text', col: 130, options: FUNNEL_STAGES.map((s) => s.label), get: (a) => a.funnelStage || '', set: (a, v) => { a.funnelStage = v } },
  { key: 'tier', label: 'Value tier', kind: 'text', col: 140, options: VALUE_TIERS, get: (a) => a.tier || '', set: (a, v) => { a.tier = v } },
  { key: 'strategy', label: 'GTM strategy', kind: 'text', get: (a) => a.strategy || '', set: (a, v) => { a.strategy = v } },
  { key: 'pains', label: 'Pains', kind: 'multiline', col: 240, sortable: false, get: (a) => line(a.pains), set: (a, v) => { a.pains = parseLines(v) } },
  { key: 'goals', label: 'Goals', kind: 'multiline', get: (a) => a.goals || '', set: (a, v) => { a.goals = v } },
  { key: 'goalTags', label: 'Goal tags', kind: 'multiline', get: (a) => line(a.goalTags), set: (a, v) => { a.goalTags = parseLines(v) } },
  { key: 'objections', label: 'Objections', kind: 'multiline', get: (a) => a.objections || '', set: (a, v) => { a.objections = v } },
  { key: 'triggers', label: 'Buying triggers', kind: 'multiline', get: (a) => line(a.triggers), set: (a, v) => { a.triggers = parseLines(v) } },
  { key: 'channels', label: 'Channels', kind: 'multiline', col: 180, sortable: false, get: (a) => (a.channels ?? []).map((id) => CHANNELS[id]?.label ?? id).join('\n'), set: (a, v) => { a.channels = parseLines(v).map((s) => chanId.get(s.toLowerCase())).filter((x): x is ChannelId => !!x) } },
  { key: 'leadProof', label: 'Lead proof points', kind: 'multiline', get: (a) => line(a.leadProof), set: (a, v) => { a.leadProof = parseLines(v) } },
  { key: 'examples', label: 'Example accounts', kind: 'multiline', get: (a) => line(a.examples), set: (a, v) => { a.examples = parseLines(v) } },
  { key: 'aliases', label: 'Aliases', kind: 'multiline', get: (a) => line(a.aliases), set: (a, v) => { a.aliases = parseLines(v) } },
  { key: 'geos', label: 'Geographies', kind: 'multiline', get: (a) => line(a.geos), set: (a, v) => { a.geos = parseLines(v) } },
  { key: 'functions', label: 'Job functions', kind: 'multiline', get: (a) => line(a.functions), set: (a, v) => { a.functions = parseLines(v) } },
  { key: 'seniority', label: 'Seniority', kind: 'text', options: SENIORITIES, get: (a) => a.seniority || '', set: (a, v) => { a.seniority = v } },
  { key: 'industry', label: 'Industry', kind: 'text', options: INDUSTRIES, get: (a) => a.industry || '', set: (a, v) => { a.industry = v } },
  { key: 'companySize', label: 'Company size', kind: 'text', options: COMPANY_SIZES, get: (a) => a.companySize || '', set: (a, v) => { a.companySize = v } },
  { key: 'ageRanges', label: 'Age ranges', kind: 'text', col: 130, sortable: false, get: (a) => (a.ageRanges ?? []).join(', '), set: (a, v) => { a.ageRanges = parseCsv(v) } },
  { key: 'incomeRanges', label: 'Income ranges', kind: 'text', col: 140, sortable: false, get: (a) => (a.incomeRanges ?? []).join(', '), set: (a, v) => { a.incomeRanges = parseCsv(v) } },
  { key: 'gender', label: 'Gender', kind: 'text', col: 110, options: GENDERS, get: (a) => a.gender || '', set: (a, v) => { a.gender = v } },
  { key: 'maritalStatus', label: 'Marital status', kind: 'text', options: MARITAL_STATUSES, get: (a) => a.maritalStatus || '', set: (a, v) => { a.maritalStatus = v } },
]

// Section groups so the table columns and the drawer fields organize under Brand-Foundation-style
// headers (Identity / Messaging / Priority / ...). Groups must stay contiguous in SPEC order.
const GROUP: Record<string, string> = {
  name: 'Identity', who: 'Identity', role: 'Identity',
  angle: 'Messaging', antiMessage: 'Messaging', outcome: 'Messaging',
  funnel: 'Priority', tier: 'Priority', strategy: 'Priority',
  pains: 'Motivations', goals: 'Motivations', goalTags: 'Motivations', objections: 'Motivations', triggers: 'Motivations',
  channels: 'Go-to-market', leadProof: 'Go-to-market',
  examples: 'References', aliases: 'References',
  geos: 'Firmographics', functions: 'Firmographics', seniority: 'Firmographics', industry: 'Firmographics', companySize: 'Firmographics',
  ageRanges: 'Demographics', incomeRanges: 'Demographics', gender: 'Demographics', maritalStatus: 'Demographics',
}
// The deep persona groups are advanced-tier: they hide in Simple detail level (still reachable via
// "Show all"), so a beginner sees just Identity / Messaging / Priority / Motivations / Go-to-market.
const ADVANCED_GROUPS = new Set(['References', 'Firmographics', 'Demographics'])
const tierOf = (key: string): 'advanced' | undefined => (ADVANCED_GROUPS.has(GROUP[key] ?? '') ? 'advanced' : undefined)
const SEGMENT_COLUMNS: RecordColumn[] = SPECS.filter((s) => s.col).map((s) => ({ key: s.key, label: s.label, kind: s.kind, width: s.col!, group: GROUP[s.key], options: s.options, sortable: s.sortable, tier: tierOf(s.key) }))
const SEGMENT_FIELDS: RecordField[] = SPECS.map((s) => ({ key: s.key, label: s.label, kind: s.kind, group: GROUP[s.key], options: s.options, tier: tierOf(s.key) }))

type SegRow = { id: string } & Record<string, string>

export function SegmentsView() {
  const { brands } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const companies = useTrafficStore((s) => s.companies)
  const jumpToRecord = useTrafficStore((s) => s.jumpToRecord)
  const brandRecords = useTrafficStore((s) => s.brandRecords)
  const showToast = useTrafficStore((s) => s.showToast)
  const openAudienceWizard = useTrafficStore((s) => s.openAudienceWizard)
  // Scoped by canvasBrandScope, not by "whichever brand is first": with several in the account and
  // none selected, guessing one showed that brand's records here and filed anything added under it.
  const brand = canvasBrandScope(clientFilter, brands.map((b) => b.name))
  const audiences = clientAudiences[brand] ?? []

  /**
   * THE SHELF ACCUMULATES; this is where it gets swept. Every campaign build mints records for the
   * audiences it writes to, so a brand that has generated for months holds dozens the user never
   * made by hand — invisible while the pickers read the wrong shelf, and a wall of strangers the
   * moment the scope was fixed. Which ones are safe to remove is a domain question with a test
   * (splitAudiencesByUse casts the reference net deliberately wide); this page only asks it, shows
   * the answer, and applies it on an explicit confirm. Nothing referenced is ever offered.
   */
  const allRows = useTrafficStore((s) => s.rows)
  const flowBoards = useTrafficStore((s) => s.flowBoards)
  const smartObjects = useTrafficStore((s) => s.smartObjects)
  const campaignList = useTrafficStore((s) => s.campaignList)
  // Only the LIVING workspace holds a record in place — see liveRecordUsage for why the dead
  // (archived campaigns, boards outliving deleted campaigns) do not get a vote.
  const { unused } = splitAudiencesByUse(
    audiences,
    liveRecordUsage({ rows: allRows, boards: flowBoards, smartObjects, campaigns: campaignList }),
  )
  const [confirmSweep, setConfirmSweep] = useState(false)
  const runSweep = () => {
    // Live read, like every other write on this page: the confirm sat open while the store moved on.
    const live = useTrafficStore.getState()
    const split = splitAudiencesByUse(
      live.clientAudiences[brand] ?? [],
      liveRecordUsage({ rows: live.rows, boards: live.flowBoards, smartObjects: live.smartObjects, campaigns: live.campaignList }),
    )
    setClientAudiences(brand, split.used)
    setConfirmSweep(false)
    showToast(
      split.unused.length
        ? `Removed ${split.unused.length} unused audience${split.unused.length === 1 ? '' : 's'}. Everything your work references is untouched.`
        : 'Nothing to remove — every audience is referenced.',
    )
  }

  // Recommend the three INTERPRETIVE fields (message angle, funnel stage, conversion outcome) for one
  // audience from its observable facts + the brand objective, so a user doesn't author them blank.
  // Fill-when-empty: never clobbers a value the user already wrote. Maps the recommender's funnel KEY
  // to the sheet's label (audience.funnelStage is display-only, stored as a label).
  const recommendAngle = async (id: string) => {
    const a = (useTrafficStore.getState().clientAudiences[brand] ?? []).find((x) => x.id === id)
    if (!a) return
    showToast(`Recommending an angle for ${a.name}…`)
    const rec = brandRecords.find((b) => b.name === brand)
    const demographics = [a.ageRanges?.join('/'), a.incomeRanges?.join('/'), a.gender, (a.geos ?? []).join('/')]
      .filter(Boolean)
      .join(', ')
    const [drafted] = await draftAngle({
      brand,
      businessObjective: rec?.businessObjective,
      positioning: rec?.positioning,
      industry: rec?.industry,
      audiences: [{
        name: a.name,
        role: a.role,
        definition: a.definition,
        pains: a.pains,
        goalTags: a.goalTags,
        triggers: a.triggers,
        demographics: demographics || undefined,
      }],
    })
    if (!drafted) { showToast('Could not recommend an angle right now.'); return }
    const stageLabel = FUNNEL_STAGES.find((s) => s.stage === drafted.funnelStage)?.label ?? ''
    const live = useTrafficStore.getState().clientAudiences[brand] ?? []
    setClientAudiences(
      brand,
      live.map((x) =>
        x.id === id
          ? {
              ...x,
              messageAngle: x.messageAngle.trim() ? x.messageAngle : drafted.messageAngle,
              funnelStage: x.funnelStage?.trim() ? x.funnelStage : stageLabel,
              outcome: x.outcome?.trim() ? x.outcome : drafted.outcome,
            }
          : x,
      ),
    )
    showToast(`Angle recommended for ${a.name}. ${drafted.rationale}`)
  }

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
    <>
    {confirmSweep && (
      <>
        <div className="drawer-scrim" onClick={() => setConfirmSweep(false)} />
        <div className="confirm-modal" role="dialog" aria-label="Remove unused audiences">
          <strong className="confirm-title">
            Remove {unused.length} unused audience{unused.length === 1 ? '' : 's'}?
          </strong>
          <p className="confirm-text">
            None of these are referenced by any asset, board, smart object or campaign — most were
            minted automatically during generation. Everything your work points at stays. Removed
            for good; there is no archive for audiences.
          </p>
          {/* The names ARE the decision, so they are on the dialog rather than behind it. */}
          <p className="confirm-text" style={{ maxHeight: 180, overflowY: 'auto' }}>
            {unused.map((a) => a.name || 'Untitled').join(' · ')}
          </p>
          <div className="confirm-foot">
            <button className="btn sm" onClick={() => setConfirmSweep(false)}>
              Cancel
            </button>
            <span className="spacer" />
            <button className="btn sm danger" onClick={runSweep}>
              Remove {unused.length}
            </button>
          </div>
        </div>
      </>
    )}
    <RecordsTable
      title="Audiences"
      term="audience"
      icon={ICON}
      columns={SEGMENT_COLUMNS}
      fields={SEGMENT_FIELDS}
      statuses={[]}
      rows={rows}
      noun={['audience', 'audiences']}
      rowAction={{ label: 'Recommend angle', run: (r) => void recommendAngle(r.id) }}
      headerAction={[
        // Only offered while there is something to sweep: a standing "Clean up (0)" would be a
        // button that exists to be disabled.
        ...(unused.length ? [{ label: `Clean up unused (${unused.length})`, run: () => setConfirmSweep(true) }] : []),
        { label: 'Guided', run: openAudienceWizard },
      ]}
      onAdd={() => {
        // Read the live array (not the render closure) so a paste that creates several rows in one
        // pass appends each one instead of clobbering the last. Return the id so paste can fill it.
        const a = newAudience({ name: 'New audience' })
        const cur = useTrafficStore.getState().clientAudiences[brand] ?? []
        setClientAudiences(brand, [...cur, a])
        return a.id
      }}
      onUpdate={(id, patch) => {
        const cur = useTrafficStore.getState().clientAudiences[brand] ?? []
        setClientAudiences(brand, cur.map((a) => (a.id === id ? patchAudience(a, patch) : a)))
      }}
      onDelete={(id) => {
        const cur = useTrafficStore.getState().clientAudiences[brand] ?? []
        setClientAudiences(brand, cur.filter((a) => a.id !== id))
      }}
      relatedSlot={(seg) => {
        const norm = (seg.name ?? '').trim().toLowerCase()
        const inSegment = norm
          ? companies.filter((c) => (c.audienceSegment ?? '').trim().toLowerCase() === norm)
          : []
        return (
          <RelatedList
            title="Companies"
            empty="No companies tagged to this audience yet. Set a company's Audience segment to match it."
            items={inSegment.map((c) => ({
              id: c.id,
              name: c.name,
              sub: c.segment,
              onOpen: () => {
                jumpToRecord(c.id, 'records')
              },
            }))}
          />
        )
      }}
    />
    </>
  )
}
