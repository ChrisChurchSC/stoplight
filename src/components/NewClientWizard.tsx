import { useState } from 'react'
import { GTM_STRATEGIES, mediaSharePct, type GtmStrategy } from '../domain/strategies'
import { STRATEGY_ASSETS, type Deliverable } from '../domain/strategyAssets'
import { CHANNELS } from '../domain/channels'
import { typeLabel } from '../domain/channelAssetTypes'
import { useTrafficStore } from '../store/useTrafficStore'

/** Monthly content production tiers we sell against. */
const VOLUME_TIERS = [15, 30, 45]

/** Spread a monthly target across content pieces, weighted by each piece's
 *  natural cadence, using largest-remainder rounding so the parts sum to the
 *  target. Every selected piece keeps at least 1/mo. */
function apportion(weights: number[], target: number): number[] {
  const n = weights.length
  if (n === 0) return []
  const sum = weights.reduce((a, b) => a + b, 0) || n
  const ideal = weights.map((w) => ((w || 1) / sum) * target)
  const out = ideal.map((x) => Math.max(1, Math.floor(x)))
  const frac = ideal.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f)
  let used = out.reduce((a, b) => a + b, 0)
  for (let g = 0; used < target; g++) {
    out[frac[g % n].i]++
    used++
  }
  // Trim any overshoot from the min-1 floor, taking from the largest first.
  const byVal = out.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v)
  for (let h = 0; used > target && h < n * 8; h++) {
    const idx = byVal[h % n].i
    if (out[idx] > 1) {
      out[idx]--
      used--
    }
  }
  return out
}

interface Props {
  onClose: () => void
  /** When set, the wizard adds a campaign to this existing client: the Profile
   *  step is skipped and the flow is just Strategy → Plan. */
  client?: string
}

export function NewClientWizard({ onClose, client }: Props) {
  const icp = useTrafficStore((s) => s.icp)
  const loadIcp = useTrafficStore((s) => s.loadIcp)
  const addClient = useTrafficStore((s) => s.addClient)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)
  const addCampaign = useTrafficStore((s) => s.addCampaign)
  const seedCampaignAssets = useTrafficStore((s) => s.seedCampaignAssets)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)

  const campaignOnly = !!client
  const [step, setStep] = useState<1 | 2 | 3>(campaignOnly ? 2 : 1)
  const [name, setName] = useState(client ?? '')
  const [website, setWebsite] = useState('')
  const [industry, setIndustry] = useState('')
  const [voice, setVoice] = useState('')
  const [pullingIcp, setPullingIcp] = useState(false)
  const [icpPulled, setIcpPulled] = useState(false)
  const [strategy, setStrategy] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [objective, setObjective] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [durationWeeks, setDurationWeeks] = useState(8)
  const [overallBudget, setOverallBudget] = useState('')
  const [monthlyVolume, setMonthlyVolume] = useState(30)

  const isContent = (d: Deliverable) => CHANNELS[d.channel].kind !== 'paid' && !d.brand

  const deliverables = strategy ? STRATEGY_ASSETS[strategy] ?? [] : []
  const chosen = deliverables.filter((_, i) => selected.has(i))
  const months = durationWeeks > 0 ? Math.max(1, Math.round(durationWeeks / 4)) : 1
  const paidChosen = chosen.filter((d) => CHANNELS[d.channel].kind === 'paid')

  // We produce a fixed monthly volume (15 / 30 / 45). Spread that target across
  // the selected content pieces, weighted by each piece's natural cadence — so
  // toggling pieces redistributes the volume but keeps the monthly total fixed.
  const contentChosen = chosen.filter(isContent)
  const effPerMonth = new Map<Deliverable, number>()
  {
    const counts = apportion(contentChosen.map((d) => d.perMonth), monthlyVolume)
    contentChosen.forEach((d, i) => effPerMonth.set(d, counts[i]))
  }
  const pmOf = (d: Deliverable) => effPerMonth.get(d) ?? d.perMonth
  const scaledChosen = chosen.map((d) =>
    effPerMonth.has(d) ? { ...d, perMonth: effPerMonth.get(d)! } : d,
  )
  const contentPerMonth = [...effPerMonth.values()].reduce((a, b) => a + b, 0)

  // Paid = one flight each; brand assets built once; content repeats monthly.
  const totalPieces = scaledChosen.reduce((n, d) => {
    if (CHANNELS[d.channel].kind === 'paid' || d.brand) return n + 1
    return n + d.perMonth * months
  }, 0)
  const cadenceOf = (d: Deliverable) =>
    CHANNELS[d.channel].kind === 'paid'
      ? { count: 'Flight', sub: 'for the flight' }
      : d.brand
        ? { count: '1', sub: 'brand asset' }
        : { count: `${pmOf(d)}/mo`, sub: 'monthly' }
  const needsBudget = paidChosen.length > 0
  const selectedStrategy = GTM_STRATEGIES.find((x) => x.key === strategy)
  const mediaPct = selectedStrategy ? mediaSharePct(selectedStrategy) : null
  // The strategy's media share splits the overall budget into media vs content.
  const mediaShare = mediaPct ?? 50
  const overallNum = needsBudget ? Number(overallBudget) || 0 : 0
  const mediaBudgetNum = Math.round((overallNum * mediaShare) / 100)
  const contentBudgetNum = overallNum - mediaBudgetNum
  const dollars = (n: number) => `$${n.toLocaleString()}`
  const toggleAsset = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const pullIcp = async () => {
    setPullingIcp(true)
    try {
      await loadIcp()
      setIcpPulled(true)
    } finally {
      setPullingIcp(false)
    }
  }

  // Content/people-led motions run longer; set a sensible default flight.
  const LONG_HORIZON = new Set(['content-seo', 'community', 'lifecycle', 'bowtie'])

  const chooseStrategy = (s: GtmStrategy) => {
    setStrategy(s.key)
    if (!campaignName.trim()) setCampaignName(`${s.name} — ${name || 'Campaign'}`)
    // Pre-select all of the strategy's recommended assets (editable below).
    setSelected(new Set((STRATEGY_ASSETS[s.key] ?? []).map((_, i) => i)))
    if (!objective.trim()) setObjective(s.bestFor)
    setDurationWeeks(LONG_HORIZON.has(s.key) ? 12 : 8)
  }

  const create = () => {
    const client = name.trim()
    if (!client || !strategy || !campaignName.trim()) return
    const strategyName = selectedStrategy?.name ?? strategy
    const campaign = campaignName.trim()
    const budgetNum = mediaBudgetNum
    const endDate =
      durationWeeks > 0
        ? new Date(Date.now() + durationWeeks * 7 * 86_400_000).toISOString().slice(0, 10)
        : undefined
    const oneTimeAssets = chosen.filter((d) => d.brand).length
    addClient(client)
    if (website.trim() || industry.trim() || voice.trim())
      setClientProfile(client, {
        website: website.trim() || undefined,
        industry: industry.trim() || undefined,
        voice: voice.trim() || undefined,
      })
    addCampaign({
      name: campaign,
      client,
      strategy: strategyName,
      objective: objective.trim() || undefined,
      durationWeeks: durationWeeks || undefined,
      overallBudget: overallNum || undefined,
      mediaBudget: budgetNum || undefined,
      contentPerMonth: contentPerMonth || undefined,
      oneTimeAssets: oneTimeAssets || undefined,
    })
    void seedCampaignAssets(campaign, scaledChosen, {
      mediaBudget: budgetNum,
      flightWeeks: durationWeeks,
      endDate,
    })
    setClientFilter(client)
    setCampaignFilter(campaign)
    onClose()
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="wiz" role="dialog" aria-label={campaignOnly ? `Add campaign to ${client}` : 'Add new client'}>
        <div className="wiz-head">
          <div className="wiz-steps">
            {campaignOnly ? (
              <>
                <span className="wiz-step wiz-step-client">{client}</span>
                <span className="wiz-step-sep">›</span>
                <span className={`wiz-step${step === 2 ? ' active' : ' done'}`}>1 · Strategy</span>
                <span className="wiz-step-sep">›</span>
                <span className={`wiz-step${step === 3 ? ' active' : ''}`}>2 · Plan</span>
              </>
            ) : (
              <>
                <span className={`wiz-step${step === 1 ? ' active' : ' done'}`}>1 · Profile</span>
                <span className="wiz-step-sep">›</span>
                <span className={`wiz-step${step === 2 ? ' active' : step > 2 ? ' done' : ''}`}>2 · Strategy</span>
                <span className="wiz-step-sep">›</span>
                <span className={`wiz-step${step === 3 ? ' active' : ''}`}>3 · Plan</span>
              </>
            )}
          </div>
          <button className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>

        {step === 1 ? (
          <div className="wiz-body">
            <label className="wiz-label">Client name</label>
            <input
              className="wiz-input"
              value={name}
              placeholder="e.g. Initech"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && setStep(2)}
              autoFocus
            />

            <div className="wiz-grid2">
              <label className="wiz-field">
                <span className="wiz-label">Website</span>
                <input
                  className="wiz-input"
                  value={website}
                  placeholder="initech.com"
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
              <label className="wiz-field">
                <span className="wiz-label">Industry</span>
                <input
                  className="wiz-input"
                  value={industry}
                  placeholder="e.g. B2B SaaS"
                  onChange={(e) => setIndustry(e.target.value)}
                />
              </label>
            </div>

            <label className="wiz-label">Brand voice</label>
            <textarea
              className="wiz-input wiz-textarea"
              value={voice}
              placeholder="How should the copy sound? e.g. Plain, technical, no hype."
              onChange={(e) => setVoice(e.target.value)}
            />

            <label className="wiz-label">ICP</label>
            {icpPulled && icp ? (
              <div className="wiz-icp">
                <div className="wiz-icp-name">✓ {icp.name}</div>
                {icp.segment && <div className="wiz-icp-seg">{icp.segment}</div>}
                {icp.pains?.length > 0 && (
                  <ul className="wiz-icp-pains">
                    {icp.pains.slice(0, 3).map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                <button className="wiz-link" onClick={pullIcp} disabled={pullingIcp}>
                  Re-pull from Claude
                </button>
              </div>
            ) : (
              <button className="wiz-icp-btn" onClick={pullIcp} disabled={pullingIcp}>
                {pullingIcp ? 'Pulling…' : '⊕ Add ICP via Claude'}
              </button>
            )}

            <div className="wiz-foot">
              <span className="wiz-hint">Website, industry, voice, and ICP are optional.</span>
              <span className="spacer" />
              <button className="btn primary" disabled={!name.trim()} onClick={() => setStep(2)}>
                Next: Strategy →
              </button>
            </div>
          </div>
        ) : step === 2 ? (
          <div className="wiz-body">
            <label className="wiz-label">Select campaign strategy</label>
            <div className="wiz-strategies">
              {GTM_STRATEGIES.map((s) => (
                <button
                  key={s.key}
                  className={`wiz-strategy${strategy === s.key ? ' on' : ''}`}
                  onClick={() => chooseStrategy(s)}
                >
                  <span className="wiz-strategy-name">{s.name}</span>
                  <span className="wiz-strategy-desc">{s.bestFor}</span>
                </button>
              ))}
            </div>
            {selectedStrategy && (
              <div className="wiz-strategy-detail">
                <span>
                  <b>Stages</b> {selectedStrategy.sequence}
                </span>
                <span>
                  <b>Watch</b> {selectedStrategy.coreMetrics}
                </span>
                <span>
                  <b>Spend</b> {selectedStrategy.mediaContent}
                </span>
              </div>
            )}

            <label className="wiz-label">Campaign name</label>
            <input
              className="wiz-input"
              value={campaignName}
              placeholder="Campaign name"
              onChange={(e) => setCampaignName(e.target.value)}
            />

            <label className="wiz-label">Objective (optional)</label>
            <textarea
              className="wiz-input wiz-textarea"
              value={objective}
              placeholder="What should this campaign achieve?"
              onChange={(e) => setObjective(e.target.value)}
            />

            <div className="wiz-foot">
              {!campaignOnly && (
                <button className="btn sm" onClick={() => setStep(1)}>
                  ← Back
                </button>
              )}
              <span className="spacer" />
              <button
                className="btn primary"
                disabled={!strategy || !campaignName.trim()}
                onClick={() => setStep(3)}
              >
                Next: Plan →
              </button>
            </div>
          </div>
        ) : (
          <div className="wiz-body">
            <label className="wiz-label">Duration</label>
            <select
              className="wiz-input"
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(Number(e.target.value))}
            >
              <option value={2}>2 weeks</option>
              <option value={4}>4 weeks</option>
              <option value={8}>8 weeks</option>
              <option value={12}>12 weeks</option>
              <option value={26}>6 months</option>
              <option value={0}>Ongoing</option>
            </select>

            {contentChosen.length > 0 && (
              <>
                <label className="wiz-label">Monthly content volume</label>
                <div className="wiz-volume">
                  {VOLUME_TIERS.map((t) => (
                    <button
                      key={t}
                      className={`wiz-volume-tier${monthlyVolume === t ? ' on' : ''}`}
                      onClick={() => setMonthlyVolume(t)}
                    >
                      <b>{t}</b>
                      <span>assets / mo</span>
                    </button>
                  ))}
                </div>
                <div className="wiz-volume-note">
                  {contentPerMonth}/mo across {contentChosen.length} content piece
                  {contentChosen.length === 1 ? '' : 's'}, spread over {months} month
                  {months === 1 ? '' : 's'}.
                </div>
              </>
            )}

            {deliverables.length > 0 && (
              <>
                <label className="wiz-label">Assets to create ({selected.size})</label>
                <div className="wiz-assets">
                  {deliverables.map((d, i) => (
                    <label key={`${d.label}-${i}`} className={`wiz-asset${selected.has(i) ? ' on' : ''}`}>
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggleAsset(i)} />
                      <span className="wiz-asset-label">
                        {d.label}
                        <span className="wiz-asset-sub">
                          {CHANNELS[d.channel].label} · {typeLabel(d.channel, d.assetType)}
                        </span>
                      </span>
                      <span className="wiz-asset-cadence">
                        {cadenceOf(d).count}
                        <span className="wiz-asset-runtime">{cadenceOf(d).sub}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {selectedStrategy && (
              <>
                <label className="wiz-label">Overall budget</label>
                {needsBudget ? (
                  <div className="wiz-budget on">
                    <div className="wiz-budget-rec">
                      ✓ Enter the overall campaign budget — {selectedStrategy.name} runs ~{mediaShare}%
                      paid media, so we split it into media vs. content/production.
                    </div>
                    <div className="wiz-budget-input">
                      <span>$</span>
                      <input
                        value={overallBudget}
                        inputMode="numeric"
                        placeholder={`Overall budget${durationWeeks ? ` over ${durationWeeks} wks` : ''} (optional)`}
                        onChange={(e) => setOverallBudget(e.target.value.replace(/[^0-9]/g, ''))}
                      />
                    </div>
                    {overallNum > 0 && (
                      <div className="wiz-budget-split">
                        <span className="wiz-budget-part media">
                          {dollars(mediaBudgetNum)} media <em>{mediaShare}%</em>
                        </span>
                        <span className="wiz-budget-part content">
                          {dollars(contentBudgetNum)} content &amp; production <em>{100 - mediaShare}%</em>
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="wiz-budget">
                    <div className="wiz-budget-opt">
                      No paid channels in this plan — a media budget isn't needed
                      {mediaPct != null && mediaPct <= 20
                        ? `. ${selectedStrategy.name} is content/people-led (~${mediaPct}% paid)`
                        : ''}
                      .
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="wiz-foot">
              <button className="btn sm" onClick={() => setStep(2)}>
                ← Back
              </button>
              <span className="wiz-hint">
                {totalPieces} piece{totalPieces === 1 ? '' : 's'} on the calendar
                {durationWeeks ? ` over ${durationWeeks} wks` : ' (rolling month)'}
              </span>
              <span className="spacer" />
              <button
                className="btn primary"
                disabled={!strategy || !campaignName.trim()}
                onClick={create}
              >
                Create campaign ↓
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
