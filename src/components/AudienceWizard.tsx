import { useState } from 'react'
import { newAudience, type AudienceType } from '../domain/audiences'
import { rtbsForCampaign } from '../domain/rtb'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import { AudienceFields } from './AudienceFields'

type Step = 1 | 2 | 3

/**
 * Guided add-audience flow. Three steps build a detailed persona: who they are
 * (role, demographics, firmographics), what they need (pains, goals, triggers,
 * angle), and how to reach + convince them (channels, proof, strategy). All
 * selector-driven; saves a new audience type under the active client.
 */
export function AudienceWizard() {
  const open = useTrafficStore((s) => s.audienceWizardOpen)
  const close = useTrafficStore((s) => s.closeAudienceWizard)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const setIcpOpen = useTrafficStore((s) => s.setIcpOpen)
  const icp = useTrafficStore((s) => s.icp)
  const rows = useTrafficStore((s) => s.rows)

  const [step, setStep] = useState<Step>(1)
  const [draft, setDraft] = useState<AudienceType>(() => newAudience())
  const patch = (p: Partial<AudienceType>) => setDraft((d) => ({ ...d, ...p }))

  if (!open) return null
  const client = clientFilter !== 'all' ? clientFilter : ''
  const businessModel = client ? clientProfiles[client]?.businessModel : undefined

  const scoped = rows.filter((r) =>
    rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter: 'all' }),
  )
  const campaigns = [...new Set(scoped.map((r) => (r.campaign ?? '').trim()).filter(Boolean))]
  const rtbPool = [
    ...new Map(campaigns.flatMap((c) => rtbsForCampaign(c)).map((r) => [r.id, r])).values(),
  ]

  const reset = () => {
    setStep(1)
    setDraft(newAudience())
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
            <span className={stepCls(3)}>3 · Reach &amp; proof</span>
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
            <AudienceFields
              value={draft}
              patch={patch}
              section="identity"
              businessModel={businessModel}
            />
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
            <AudienceFields value={draft} patch={patch} section="needs" icpPains={icp?.pains} />
            <div className="wiz-foot">
              <button className="btn ghost sm" onClick={() => setStep(1)}>
                ‹ Back
              </button>
              <span className="spacer" />
              <button className="btn sm primary" onClick={() => setStep(3)}>
                Next: reach &amp; proof
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wiz-body">
            <AudienceFields value={draft} patch={patch} section="reach" rtbPool={rtbPool} />
            <div className="wiz-foot">
              <button className="btn ghost sm" onClick={() => setStep(2)}>
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
