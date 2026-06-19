import { useState } from 'react'
import { newAudience } from '../domain/audiences'
import { CHANNEL_LIST } from '../domain/channels'
import type { ChannelId } from '../domain/types'
import { rtbsForCampaign } from '../domain/rtb'
import { GTM_STRATEGIES } from '../domain/strategies'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

type Step = 1 | 2 | 3

/**
 * Guided add-audience flow. Three steps build a persona under the active client's
 * ICP: who they are (name, role, angle), what they need (pains, goals, objections),
 * and how to reach + convince them (channels, proof emphasis, strategy). Saves a
 * new audience type; later editing lives in the ICP drawer.
 */
export function AudienceWizard() {
  const open = useTrafficStore((s) => s.audienceWizardOpen)
  const close = useTrafficStore((s) => s.closeAudienceWizard)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const setIcpOpen = useTrafficStore((s) => s.setIcpOpen)
  const icp = useTrafficStore((s) => s.icp)
  const rows = useTrafficStore((s) => s.rows)

  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [angle, setAngle] = useState('')
  const [pains, setPains] = useState<string[]>([])
  const [painDraft, setPainDraft] = useState('')
  const [goals, setGoals] = useState('')
  const [objections, setObjections] = useState('')
  const [channels, setChannels] = useState<ChannelId[]>([])
  const [rtbEmphasis, setRtbEmphasis] = useState<string[]>([])
  const [strategy, setStrategy] = useState('')

  if (!open) return null
  const client = clientFilter !== 'all' ? clientFilter : ''

  // Proof pool: RTBs across the client's campaigns, deduped by id.
  const scoped = rows.filter((r) =>
    rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter: 'all' }),
  )
  const campaigns = [...new Set(scoped.map((r) => (r.campaign ?? '').trim()).filter(Boolean))]
  const rtbPool = [
    ...new Map(campaigns.flatMap((c) => rtbsForCampaign(c)).map((r) => [r.id, r])).values(),
  ]
  // Pain vocabulary: the ICP's pains as quick toggles, plus any custom ones added.
  const painSuggestions = [...new Set([...(icp?.pains ?? []), ...pains])]

  const reset = () => {
    setStep(1)
    setName('')
    setRole('')
    setAngle('')
    setPains([])
    setPainDraft('')
    setGoals('')
    setObjections('')
    setChannels([])
    setRtbEmphasis([])
    setStrategy('')
  }
  const onClose = () => {
    reset()
    close()
  }
  const togglePain = (p: string) =>
    setPains((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
  const addPainDraft = () => {
    const p = painDraft.trim()
    if (p && !pains.includes(p)) setPains((prev) => [...prev, p])
    setPainDraft('')
  }
  const toggleChannel = (id: ChannelId) =>
    setChannels((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const toggleRtb = (id: string) =>
    setRtbEmphasis((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const canSave = name.trim().length > 0
  const save = () => {
    if (!client || !canSave) return
    const existing = clientAudiences[client] ?? []
    setClientAudiences(client, [
      ...existing,
      newAudience({
        name: name.trim(),
        role: role.trim(),
        messageAngle: angle.trim(),
        pains,
        goals: goals.trim(),
        objections: objections.trim(),
        channels,
        rtbEmphasis,
        strategy,
      }),
    ])
    reset()
    close()
    setIcpOpen(true)
  }

  const stepCls = (n: Step) => `wiz-step${step === n ? ' active' : step > n ? ' done' : ''}`

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="wiz" role="dialog" aria-label={`Add audience to ${client}`}>
        <div className="wiz-head">
          <div className="wiz-steps">
            <span className="wiz-step wiz-step-client">{client || 'New audience'}</span>
            <span className="wiz-step-sep">›</span>
            <span className={stepCls(1)}>1 · Persona</span>
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
              value={name}
              placeholder="e.g. Enterprise Ops leaders"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) setStep(2)
              }}
            />

            <label className="wiz-label">Role / title</label>
            <input
              className="wiz-input"
              value={role}
              placeholder="e.g. VP / Director of Operations"
              onChange={(e) => setRole(e.target.value)}
            />

            <label className="wiz-label">Message angle</label>
            <textarea
              className="wiz-input wiz-textarea"
              value={angle}
              placeholder="How the promise is framed for this buyer's pains and language."
              onChange={(e) => setAngle(e.target.value)}
            />

            <div className="wiz-foot">
              <span className="wiz-hint">A specific person inside the ICP, with their own angle.</span>
              <span className="spacer" />
              <button className="btn sm primary" disabled={!canSave} onClick={() => setStep(2)}>
                Next: needs
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wiz-body">
            <label className="wiz-label">Pains</label>
            {painSuggestions.length > 0 && (
              <div className="aud-rtbs">
                {painSuggestions.map((p) => (
                  <button
                    key={p}
                    className={`rtb-chip${pains.includes(p) ? ' on' : ''}`}
                    onClick={() => togglePain(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            <input
              className="wiz-input"
              value={painDraft}
              placeholder="Add a pain, press Enter"
              onChange={(e) => setPainDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addPainDraft()
                }
              }}
            />

            <label className="wiz-label">Goals</label>
            <textarea
              className="wiz-input wiz-textarea"
              value={goals}
              placeholder="What this persona is trying to achieve — the outcome they're buying."
              onChange={(e) => setGoals(e.target.value)}
            />

            <label className="wiz-label">Objections</label>
            <textarea
              className="wiz-input wiz-textarea"
              value={objections}
              placeholder="What makes them hesitate — objections to disarm in the messaging."
              onChange={(e) => setObjections(e.target.value)}
            />

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
            <label className="wiz-label">Channels to reach them</label>
            <div className="aud-rtbs">
              {CHANNEL_LIST.map((c) => (
                <button
                  key={c.id}
                  className={`rtb-chip${channels.includes(c.id) ? ' on' : ''}`}
                  onClick={() => toggleChannel(c.id)}
                  title={c.label}
                >
                  <ChannelIcon channel={c.id} size={12} />
                  {c.label}
                </button>
              ))}
            </div>

            <label className="wiz-label">Proof emphasis</label>
            {rtbPool.length === 0 ? (
              <p className="wiz-hint">
                No RTBs in this client's campaigns yet. You can add proof emphasis later in the ICP
                drawer.
              </p>
            ) : (
              <div className="aud-rtbs">
                {rtbPool.map((rtb) => (
                  <button
                    key={rtb.id}
                    className={`rtb-chip${rtbEmphasis.includes(rtb.id) ? ' on' : ''}`}
                    title={rtb.detail}
                    onClick={() => toggleRtb(rtb.id)}
                  >
                    {rtb.label}
                  </button>
                ))}
              </div>
            )}

            <label className="wiz-label">Strategy</label>
            <select
              className="wiz-input"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
            >
              <option value="">No strategy yet…</option>
              {GTM_STRATEGIES.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.name}
                </option>
              ))}
            </select>

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
