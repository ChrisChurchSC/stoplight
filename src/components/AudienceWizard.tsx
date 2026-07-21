import { useState } from 'react'
import { newAudience, type AudienceType } from '../domain/audiences'
import { rtbsForCampaign } from '../domain/rtb'
import { FUNNEL_STAGES } from '../domain/funnel'
import { OUTCOMES } from '../domain/outcomes'
import { draftAngle } from '../adapters/ask/draftAngle'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import { AudienceFields } from './AudienceFields'

type Step = 1 | 2 | 3 | 4

/**
 * Guided add-audience flow. Four steps build a detailed persona: who they are
 * (role, demographics, firmographics), what they need (pains, goals, triggers),
 * the RECOMMENDED positioning (message angle + funnel stage + outcome, inferred
 * so the user reviews rather than authors it blank), and how to reach + convince
 * them (channels, proof, strategy). Saves a new audience under the active client.
 */
export function AudienceWizard() {
  const open = useTrafficStore((s) => s.audienceWizardOpen)
  const close = useTrafficStore((s) => s.closeAudienceWizard)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const brandRecords = useTrafficStore((s) => s.brandRecords)
  const setIcpOpen = useTrafficStore((s) => s.setIcpOpen)
  const icp = useTrafficStore((s) => s.icp)
  const rows = useTrafficStore((s) => s.rows)

  const [step, setStep] = useState<Step>(1)
  const [draft, setDraft] = useState<AudienceType>(() => newAudience())
  const [objective, setObjective] = useState('')
  const [rec, setRec] = useState<{ rationale: string; confidence: string; busy: boolean; done: boolean }>({
    rationale: '',
    confidence: '',
    busy: false,
    done: false,
  })
  const patch = (p: Partial<AudienceType>) => setDraft((d) => ({ ...d, ...p }))

  if (!open) return null
  const client = clientFilter !== 'all' ? clientFilter : ''
  const businessModel = client ? clientProfiles[client]?.businessModel : undefined
  const brandRec = brandRecords.find((b) => b.name === client)
  const brandObjective = brandRec?.businessObjective ?? ''

  const scoped = rows.filter((r) =>
    rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter: 'all' }),
  )
  const campaigns = [...new Set(scoped.map((r) => (r.campaign ?? '').trim()).filter(Boolean))]
  const rtbPool = [
    ...new Map(campaigns.flatMap((c) => rtbsForCampaign(c)).map((r) => [r.id, r])).values(),
  ]

  const demographicSummary = [
    draft.ageRanges?.join('/'),
    draft.incomeRanges?.join('/'),
    draft.gender,
    (draft.geos ?? []).join('/'),
  ]
    .filter(Boolean)
    .join(', ')

  // Recommend the interpretive fields from the observable facts collected so far + the objective.
  // Inside the wizard we overwrite the (still-blank) fields; they're shown editable before Save.
  const runRecommend = async (force: boolean) => {
    setRec((r) => ({ ...r, busy: true }))
    const [d] = await draftAngle({
      brand: client,
      businessObjective: (objective || brandObjective) || undefined,
      positioning: brandRec?.positioning,
      industry: brandRec?.industry,
      audiences: [
        {
          name: draft.name || 'This audience',
          role: draft.role,
          definition: draft.definition,
          pains: draft.pains,
          goalTags: draft.goalTags,
          triggers: draft.triggers,
          demographics: demographicSummary || undefined,
        },
      ],
    })
    if (!d) {
      setRec((r) => ({ ...r, busy: false }))
      return
    }
    const stageLabel = FUNNEL_STAGES.find((s) => s.stage === d.funnelStage)?.label ?? ''
    // Apply against the LATEST draft: the auto-run keeps anything the user typed during the (slow)
    // call (fill-when-empty); the manual "Re-recommend" forces an overwrite.
    setDraft((cur) => ({
      ...cur,
      messageAngle: force || !cur.messageAngle.trim() ? d.messageAngle : cur.messageAngle,
      funnelStage: force || !(cur.funnelStage ?? '').trim() ? stageLabel : cur.funnelStage,
      outcome: force || !(cur.outcome ?? '').trim() ? d.outcome : cur.outcome,
    }))
    setRec({ rationale: d.rationale, confidence: d.confidence, busy: false, done: true })
  }

  const goPositioning = () => {
    setStep(3)
    // Auto-recommend once on first entry when there's enough signal; the user can re-recommend or edit.
    if (!rec.done && !rec.busy && draft.name.trim()) void runRecommend(false)
  }

  const reset = () => {
    setStep(1)
    setDraft(newAudience())
    setObjective('')
    setRec({ rationale: '', confidence: '', busy: false, done: false })
  }
  const onClose = () => {
    reset()
    close()
  }
  const canSave = draft.name.trim().length > 0
  const save = () => {
    if (!client || !canSave) return
    const existing = clientAudiences[client] ?? []
    setClientAudiences(client, [...existing, { ...draft, name: draft.name.trim() }])
    reset()
    close()
    setIcpOpen(true)
  }

  const stepCls = (n: Step) => `wiz-step${step === n ? ' active' : step > n ? ' done' : ''}`

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="wiz wiz-tall" role="dialog" aria-label={`Add audience to ${client}`}>
        <div className="wiz-head">
          <div className="wiz-steps">
            <span className="wiz-step wiz-step-client">{client || 'New audience'}</span>
            <span className="wiz-step-sep">›</span>
            <span className={stepCls(1)}>1 · Who</span>
            <span className="wiz-step-sep">›</span>
            <span className={stepCls(2)}>2 · Needs</span>
            <span className="wiz-step-sep">›</span>
            <span className={stepCls(3)}>3 · Positioning</span>
            <span className="wiz-step-sep">›</span>
            <span className={stepCls(4)}>4 · Reach &amp; proof</span>
          </div>
          <button className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>

        {step === 1 && (
          <div className="wiz-body">
            <label className="wiz-label">Audience name</label>
            <input
              className="wiz-input"
              autoFocus
              value={draft.name}
              placeholder="e.g. Enterprise Ops leaders"
              onChange={(e) => patch({ name: e.target.value })}
            />
            {businessModel && (
              <div className="wiz-aud-model">
                {/B2C|D2C/i.test(businessModel)
                  ? `${businessModel}: demographics lead, firmographics optional.`
                  : `${businessModel}: firmographics lead, demographics optional.`}
              </div>
            )}
            <AudienceFields value={draft} patch={patch} section="identity" businessModel={businessModel} />
            <div className="wiz-foot">
              <span className="wiz-hint">A specific person inside the ICP.</span>
              <span className="spacer" />
              <button className="btn sm primary" disabled={!canSave} onClick={() => setStep(2)}>
                Next: needs
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wiz-body">
            <AudienceFields value={draft} patch={patch} section="needs" icpPains={icp?.pains} hideAngle />
            <div className="wiz-foot">
              <button className="btn ghost sm" onClick={() => setStep(1)}>
                ‹ Back
              </button>
              <span className="spacer" />
              <button className="btn sm primary" onClick={goPositioning}>
                Next: positioning
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wiz-body">
            <label className="wiz-label">Business objective (optional)</label>
            <input
              className="wiz-input"
              value={objective}
              placeholder={brandObjective || 'What should this audience drive for the business?'}
              onChange={(e) => setObjective(e.target.value)}
            />
            <div className="wiz-rec-head">
              <span className="wiz-hint">Recommended from this audience and your objective. Edit anything.</span>
              <button className="btn ghost sm" disabled={rec.busy} onClick={() => void runRecommend(true)}>
                {rec.busy ? 'Thinking…' : rec.done ? 'Re-recommend' : 'Recommend'}
              </button>
            </div>
            {demographicSummary && <div className="wiz-aud-model">Who: {demographicSummary}</div>}
            <label className="wiz-label">Message angle</label>
            <textarea
              className="wiz-input wiz-textarea"
              value={draft.messageAngle}
              placeholder="How the promise is framed for this buyer's pains and language."
              onChange={(e) => patch({ messageAngle: e.target.value })}
            />
            <div className="wiz-grid2">
              <label className="wiz-field">
                <span className="wiz-label">Funnel stage</span>
                <select
                  className="wiz-input"
                  value={draft.funnelStage ?? ''}
                  onChange={(e) => patch({ funnelStage: e.target.value })}
                >
                  <option value="">—</option>
                  {FUNNEL_STAGES.map((s) => (
                    <option key={s.stage} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wiz-field">
                <span className="wiz-label">Conversion outcome</span>
                <input
                  className="wiz-input"
                  list="wiz-outcomes"
                  value={draft.outcome ?? ''}
                  placeholder="e.g. Sign up"
                  onChange={(e) => patch({ outcome: e.target.value })}
                />
                <datalist id="wiz-outcomes">
                  {OUTCOMES.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </label>
            </div>
            {rec.done && rec.rationale && (
              <div className="wiz-rec-why">
                <strong>Why:</strong> {rec.rationale}
                {rec.confidence && <span className="wiz-rec-conf"> ({rec.confidence} confidence)</span>}
              </div>
            )}
            <div className="wiz-foot">
              <button className="btn ghost sm" onClick={() => setStep(2)}>
                ‹ Back
              </button>
              <span className="spacer" />
              <button className="btn sm primary" onClick={() => setStep(4)}>
                Next: reach &amp; proof
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="wiz-body">
            <AudienceFields value={draft} patch={patch} section="reach" rtbPool={rtbPool} />
            <div className="wiz-foot">
              <button className="btn ghost sm" onClick={() => setStep(3)}>
                ‹ Back
              </button>
              <span className="spacer" />
              <button className="btn sm primary" disabled={!canSave} onClick={save}>
                ＋ Add audience
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
