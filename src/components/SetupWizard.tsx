import { useState } from 'react'
import type { WorkspaceSetup } from '../adapters/setup/setupGenerator'
import { KIND_ORDER, channelsByKind } from '../domain/channels'
import { GTM_STRATEGIES, mediaSharePct } from '../domain/strategies'
import type { ChannelId } from '../domain/types'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

type Step = 'input' | 'generating' | 'review'

export function SetupWizard() {
  const open = useTrafficStore((s) => s.setupOpen)
  const close = useTrafficStore((s) => s.closeSetup)
  const setPage = useTrafficStore((s) => s.setPage)
  const generateSetup = useTrafficStore((s) => s.generateSetup)
  const provisionWorkspace = useTrafficStore((s) => s.provisionWorkspace)

  const [step, setStep] = useState<Step>('input')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [setup, setSetup] = useState<WorkspaceSetup | null>(null)
  const [confirmed, setConfirmed] = useState({ brand: false, icp: false, channels: false })
  const [provisioning, setProvisioning] = useState(false)

  if (!open) return null

  const reset = () => {
    setStep('input')
    setSetup(null)
    setConfirmed({ brand: false, icp: false, channels: false })
    setProvisioning(false)
  }
  const onClose = () => {
    close()
    reset()
    setUrl('')
    setNotes('')
  }

  const generate = async () => {
    setStep('generating')
    const s = await generateSetup({ url: url.trim(), notes: notes.trim() || undefined })
    setSetup(s)
    setStep('review')
  }

  const patchBrand = (k: keyof WorkspaceSetup['brand'], v: string) =>
    setSetup((s) => s && { ...s, brand: { ...s.brand, [k]: v } })
  const patchIcp = (k: 'name' | 'segment' | 'summary', v: string) =>
    setSetup((s) => s && { ...s, icp: { ...s.icp, [k]: v } })
  const setPains = (v: string) =>
    setSetup((s) => s && { ...s, icp: { ...s.icp, pains: v.split(',').map((p) => p.trim()).filter(Boolean) } })
  const patchCampaign = (k: keyof WorkspaceSetup['campaign'], v: string | number) =>
    setSetup((s) => s && { ...s, campaign: { ...s.campaign, [k]: v } })
  const toggleChannel = (id: ChannelId) =>
    setSetup(
      (s) =>
        s && {
          ...s,
          channelMix: s.channelMix.includes(id)
            ? s.channelMix.filter((c) => c !== id)
            : [...s.channelMix, id],
        },
    )

  const provision = async () => {
    if (!setup) return
    setProvisioning(true)
    await provisionWorkspace(setup)
    onClose()
  }

  const allConfirmed = confirmed.brand && confirmed.icp && confirmed.channels
  const strat = setup ? GTM_STRATEGIES.find((s) => s.key === setup.strategy) : undefined
  const mediaShare = strat ? mediaSharePct(strat) ?? 50 : 50
  const mediaBudget = setup ? Math.round((setup.campaign.overallBudget * mediaShare) / 100) : 0

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="wiz setup-wiz" role="dialog" aria-label="Set up with Claude">
        <div className="wiz-head">
          <span className="setup-badge">✦ Set up with Claude</span>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>

        {step === 'input' && (
          <div className="wiz-body">
            <div className="setup-intro">
              <h3>Let Claude stand up your workspace</h3>
              <p className="wiz-hint">
                Point Claude at your site. It reads your brand, infers your ICP and proof, picks your
                channel mix and a first campaign. You confirm everything before it's committed.
              </p>
            </div>

            <label className="wiz-label">Company website</label>
            <input
              className="wiz-input"
              value={url}
              placeholder="acme.com"
              autoFocus
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && url.trim() && generate()}
            />

            <label className="wiz-label">Anything Claude should know? (optional)</label>
            <textarea
              className="wiz-input wiz-textarea"
              value={notes}
              placeholder="e.g. we sell to RevOps teams, avoid hype, our wedge is time-to-value"
              onChange={(e) => setNotes(e.target.value)}
            />

            <div className="setup-sources">
              Connect Claude, Attio, and your ad platforms on{' '}
              <button
                className="wiz-link"
                onClick={() => {
                  onClose()
                  setPage('connectors')
                }}
              >
                Connectors
              </button>{' '}
              so Claude can pull more. Optional.
            </div>

            <div className="wiz-foot">
              <span className="wiz-hint">Nothing is committed until you review and confirm.</span>
              <span className="spacer" />
              <button className="btn primary" disabled={!url.trim()} onClick={generate}>
                ✦ Generate setup →
              </button>
            </div>
          </div>
        )}

        {step === 'generating' && (
          <div className="wiz-body setup-generating">
            <div className="setup-spinner">✦</div>
            <div className="setup-gen-title">Reading {url || 'your site'}…</div>
            <div className="wiz-hint">
              Claude is learning your brand voice, inferring your ICP and proof, and proposing a channel
              mix and first campaign.
            </div>
          </div>
        )}

        {step === 'review' && setup && (
          <div className="wiz-body">
            <p className="wiz-hint setup-review-intro">
              Here's the proposed workspace. Edit anything, then confirm the highlighted items.
            </p>

            {/* ---- Brand & voice (confirm) ---- */}
            <SectionHead
              label="Brand & voice"
              confirm={confirmed.brand}
              onConfirm={(v) => setConfirmed((c) => ({ ...c, brand: v }))}
            />
            <div className="wiz-grid2">
              <label className="wiz-field">
                <span className="wiz-label">Company</span>
                <input className="wiz-input" value={setup.brand.name} onChange={(e) => patchBrand('name', e.target.value)} />
              </label>
              <label className="wiz-field">
                <span className="wiz-label">Website</span>
                <input className="wiz-input" value={setup.brand.website} onChange={(e) => patchBrand('website', e.target.value)} />
              </label>
            </div>
            <label className="wiz-label">Industry</label>
            <input className="wiz-input" value={setup.brand.industry} onChange={(e) => patchBrand('industry', e.target.value)} />
            <label className="wiz-label">Brand voice</label>
            <textarea className="wiz-input wiz-textarea" value={setup.brand.voice} onChange={(e) => patchBrand('voice', e.target.value)} />

            {/* ---- ICP (confirm) ---- */}
            <SectionHead
              label="Ideal customer (ICP)"
              confirm={confirmed.icp}
              onConfirm={(v) => setConfirmed((c) => ({ ...c, icp: v }))}
            />
            <div className="wiz-grid2">
              <label className="wiz-field">
                <span className="wiz-label">Buyer / segment</span>
                <input className="wiz-input" value={setup.icp.name} onChange={(e) => patchIcp('name', e.target.value)} />
              </label>
              <label className="wiz-field">
                <span className="wiz-label">Fit tag</span>
                <input className="wiz-input" value={setup.icp.segment ?? ''} onChange={(e) => patchIcp('segment', e.target.value)} />
              </label>
            </div>
            <label className="wiz-label">Summary</label>
            <textarea className="wiz-input wiz-textarea" value={setup.icp.summary} onChange={(e) => patchIcp('summary', e.target.value)} />
            <label className="wiz-label">Pains (comma-separated)</label>
            <input className="wiz-input" value={setup.icp.pains.join(', ')} onChange={(e) => setPains(e.target.value)} />
            {setup.icp.firmographics.length > 0 && (
              <div className="setup-chips">
                {setup.icp.firmographics.map((f) => (
                  <span key={f.label} className="setup-chip">
                    <span className="setup-chip-k">{f.label}</span>
                    {f.value}
                  </span>
                ))}
              </div>
            )}

            {/* ---- Channel mix (confirm) ---- */}
            <SectionHead
              label="Channel mix"
              confirm={confirmed.channels}
              onConfirm={(v) => setConfirmed((c) => ({ ...c, channels: v }))}
            />
            <div className="setup-channels">
              {KIND_ORDER.map((section) => (
                <div key={section.kind} className="setup-channel-group">
                  <div className="setup-channel-kind">{section.label}</div>
                  <div className="setup-channel-list">
                    {channelsByKind(section.kind).map((c) => {
                      const on = setup.channelMix.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          className={`setup-channel${on ? ' on' : ''}`}
                          onClick={() => toggleChannel(c.id)}
                        >
                          <ChannelIcon channel={c.id} size={13} />
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* ---- Proof ---- */}
            <div className="wiz-label setup-section-plain">Proof points (RTBs)</div>
            <div className="setup-rtbs">
              {setup.rtbs.map((r) => (
                <div key={r.id} className="setup-rtb">
                  <span className="setup-rtb-label">{r.label}</span>
                  <span className="setup-rtb-detail">{r.detail}</span>
                </div>
              ))}
            </div>

            {/* ---- First campaign ---- */}
            <div className="wiz-label setup-section-plain">First campaign</div>
            <div className="wiz-grid2">
              <label className="wiz-field">
                <span className="wiz-label">Strategy</span>
                <select
                  className="wiz-input"
                  value={setup.strategy}
                  onChange={(e) => setSetup((s) => s && { ...s, strategy: e.target.value })}
                >
                  {GTM_STRATEGIES.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wiz-field">
                <span className="wiz-label">Duration</span>
                <select
                  className="wiz-input"
                  value={setup.campaign.durationWeeks}
                  onChange={(e) => patchCampaign('durationWeeks', Number(e.target.value))}
                >
                  <option value={4}>4 weeks</option>
                  <option value={8}>8 weeks</option>
                  <option value={12}>12 weeks</option>
                  <option value={26}>6 months</option>
                </select>
              </label>
            </div>
            <label className="wiz-label">Campaign name</label>
            <input className="wiz-input" value={setup.campaign.name} onChange={(e) => patchCampaign('name', e.target.value)} />
            <label className="wiz-label">Overall budget</label>
            <div className="wiz-budget-input">
              <span>$</span>
              <input
                value={setup.campaign.overallBudget || ''}
                inputMode="numeric"
                placeholder="Overall budget"
                onChange={(e) => patchCampaign('overallBudget', Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
              />
            </div>
            {setup.campaign.overallBudget > 0 && (
              <div className="setup-budget-split">
                ${mediaBudget.toLocaleString()} media ({mediaShare}%) · $
                {(setup.campaign.overallBudget - mediaBudget).toLocaleString()} content & production
              </div>
            )}

            {/* ---- Auto-set ---- */}
            <div className="setup-autoset">
              <span className="setup-autoset-ico">✓</span>
              UTM schema, format specs, and the pre-flight gates (ICP, spec, tracking, budget) are set to
              sensible defaults. Editable anytime.
            </div>

            <div className="wiz-foot">
              <button className="btn sm" onClick={() => setStep('input')}>
                ← Back
              </button>
              <span className="wiz-hint">
                {allConfirmed ? 'Ready to provision.' : 'Confirm brand, ICP, and channels to continue.'}
              </span>
              <span className="spacer" />
              <button className="btn primary" disabled={!allConfirmed || provisioning} onClick={provision}>
                {provisioning ? 'Provisioning…' : 'Provision workspace ↓'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function SectionHead({
  label,
  confirm,
  onConfirm,
}: {
  label: string
  confirm: boolean
  onConfirm: (v: boolean) => void
}) {
  return (
    <div className="setup-section">
      <span className="setup-section-label">{label}</span>
      <label className={`setup-confirm${confirm ? ' on' : ''}`}>
        <input type="checkbox" checked={confirm} onChange={(e) => onConfirm(e.target.checked)} />
        {confirm ? '✓ Confirmed' : 'Confirm'}
      </label>
    </div>
  )
}
