import { useState } from 'react'
import { newAudience, type AudienceType } from '../domain/audiences'
import { GTM_STRATEGIES, mediaSharePct, type GtmStrategy } from '../domain/strategies'
import { STRATEGY_ASSETS, type Deliverable } from '../domain/strategyAssets'
import { CHANNELS } from '../domain/channels'
import { typeLabel } from '../domain/channelAssetTypes'
import {
  BRAND_VOICES,
  BUSINESS_MODELS,
  COMPANY_SIZES,
  FUNDING_STAGES,
  INDUSTRIES,
  REGIONS,
  REVENUE_RANGES,
} from '../domain/taxonomy'
import {
  REFRESH_CADENCES,
  SEASONAL_WINDOWS,
  TIMINGS,
  TIMING_BY_KEY,
  TRIGGER_EVENTS,
  TRIGGER_KINDS,
  type CampaignTiming,
  type TriggerKind,
} from '../domain/timing'
import {
  BUDGET_TIERS,
  OBJECTIVES,
  recommendStrategy,
  type BudgetTier,
  type Objective,
} from '../domain/guidedStrategy'
import { useTrafficStore } from '../store/useTrafficStore'
import { AudienceFields } from './AudienceFields'
import { Dropdown, Segmented } from './forms'

/** Monthly content production tiers we sell against, with guidance on when each fits. */
const VOLUME_TIERS = [
  {
    n: 15,
    tag: 'Starter',
    desc: 'One or two core channels, steady always-on presence. Best for lean teams, a tight budget, or testing a new motion before scaling.',
  },
  {
    n: 30,
    tag: 'Growth',
    desc: 'Balanced multi-channel cadence with room to nurture and retarget. The default for most campaigns building consistent pipeline.',
  },
  {
    n: 45,
    tag: 'Saturation',
    desc: 'High-tempo, full-funnel output across many channels and audiences. For aggressive growth, competitive markets, or a category push.',
  },
]

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
  const addClient = useTrafficStore((s) => s.addClient)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)
  const addCampaign = useTrafficStore((s) => s.addCampaign)
  const seedCampaignAssets = useTrafficStore((s) => s.seedCampaignAssets)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)

  const campaignOnly = !!client
  const [step, setStep] = useState<1 | 2 | 3 | 4>(campaignOnly ? 2 : 1)
  const [name, setName] = useState(client ?? '')
  const [website, setWebsite] = useState('')
  const [industry, setIndustry] = useState('')
  const [voice, setVoice] = useState('')
  const [businessModel, setBusinessModel] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [revenue, setRevenue] = useState('')
  const [funding, setFunding] = useState('')
  const [region, setRegion] = useState('')
  const [strategy, setStrategy] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [objective, setObjective] = useState('')
  // Guided strategy selection (plain-language, budget-aware). Manual picker is the escape hatch.
  const [guidedObjective, setGuidedObjective] = useState<Objective | ''>('')
  const [budgetTier, setBudgetTier] = useState<BudgetTier | ''>('')
  const [manualStrategy, setManualStrategy] = useState(false)
  // Target audience for the campaign — required before the plan.
  const [audienceDraft, setAudienceDraft] = useState<AudienceType>(() => newAudience())
  const patchAudience = (p: Partial<AudienceType>) => setAudienceDraft((d) => ({ ...d, ...p }))
  const audienceName = audienceDraft.name
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [durationWeeks, setDurationWeeks] = useState(8)
  const [overallBudget, setOverallBudget] = useState('')
  const [monthlyVolume, setMonthlyVolume] = useState(30)
  // Timing dimension — drives when/how the campaign ships.
  const [timing, setTiming] = useState<CampaignTiming>('one-off')
  const [seasonalWindow, setSeasonalWindow] = useState('')
  const [refreshWeeks, setRefreshWeeks] = useState(4)
  const [triggerKind, setTriggerKind] = useState<TriggerKind>('behavior')
  const [triggerEvent, setTriggerEvent] = useState('')
  const chooseTiming = (t: CampaignTiming) => {
    setTiming(t)
    // Always-on / triggered have no fixed flight; one-off / seasonal do.
    if (t === 'always-on' || t === 'triggered') setDurationWeeks(0)
    else if (durationWeeks === 0) setDurationWeeks(8)
  }
  const datedTiming = timing === 'one-off' || timing === 'seasonal'

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

  // Content/people-led motions run longer; set a sensible default flight.
  const LONG_HORIZON = new Set(['content-seo', 'community', 'lifecycle', 'bowtie', 'local-takeover'])

  const chooseStrategy = (s: GtmStrategy) => {
    setStrategy(s.key)
    if (!campaignName.trim()) setCampaignName(`${s.name} — ${name || 'Campaign'}`)
    // Pre-select all of the strategy's recommended assets (editable below).
    setSelected(new Set((STRATEGY_ASSETS[s.key] ?? []).map((_, i) => i)))
    if (!objective.trim()) setObjective(s.bestFor)
    setDurationWeeks(LONG_HORIZON.has(s.key) ? 12 : 8)
  }

  // The budget-aware recommendation from the plain-language answers, and the
  // one-click confirm that translates it into the strategy + timing model.
  const guidedRec =
    guidedObjective && budgetTier
      ? recommendStrategy({ objective: guidedObjective, budgetTier, businessModel })
      : null
  const useRecommendation = () => {
    if (!guidedRec) return
    const s = GTM_STRATEGIES.find((x) => x.key === guidedRec.strategyKey)
    if (s) chooseStrategy(s)
    chooseTiming(guidedRec.timing)
  }

  const create = () => {
    const client = name.trim()
    if (!client || !strategy || !campaignName.trim() || !audienceName.trim()) return
    const strategyName = selectedStrategy?.name ?? strategy
    const campaign = campaignName.trim()
    const budgetNum = mediaBudgetNum
    const endDate =
      durationWeeks > 0
        ? new Date(Date.now() + durationWeeks * 7 * 86_400_000).toISOString().slice(0, 10)
        : undefined
    const oneTimeAssets = chosen.filter((d) => d.brand).length
    addClient(client)
    if (website.trim() || industry || voice || businessModel || companySize || revenue || funding || region)
      setClientProfile(client, {
        website: website.trim() || undefined,
        industry: industry || undefined,
        voice: voice || undefined,
        businessModel: businessModel || undefined,
        companySize: companySize || undefined,
        revenue: revenue || undefined,
        funding: funding || undefined,
        region: region || undefined,
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
      timing,
      seasonalWindow: timing === 'seasonal' ? seasonalWindow || undefined : undefined,
      seasonalCycle: timing === 'seasonal' ? 1 : undefined,
      refreshWeeks: timing === 'always-on' ? refreshWeeks : undefined,
      triggerKind: timing === 'triggered' ? triggerKind : undefined,
      triggerEvent: timing === 'triggered' ? triggerEvent || undefined : undefined,
    })
    // Save the campaign's target audience. It inherits the campaign strategy and
    // flows into the messaging + outcome map as the "who" this campaign targets.
    const existingAudiences = clientAudiences[client] ?? []
    setClientAudiences(client, [
      ...existingAudiences,
      { ...audienceDraft, name: audienceName.trim(), strategy: audienceDraft.strategy || strategy },
    ])
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
                <span className={`wiz-step${step === 3 ? ' active' : step > 3 ? ' done' : ''}`}>2 · Audience</span>
                <span className="wiz-step-sep">›</span>
                <span className={`wiz-step${step === 4 ? ' active' : ''}`}>3 · Plan</span>
              </>
            ) : (
              <>
                <span className={`wiz-step${step === 1 ? ' active' : ' done'}`}>1 · Profile</span>
                <span className="wiz-step-sep">›</span>
                <span className={`wiz-step${step === 2 ? ' active' : step > 2 ? ' done' : ''}`}>2 · Strategy</span>
                <span className="wiz-step-sep">›</span>
                <span className={`wiz-step${step === 3 ? ' active' : step > 3 ? ' done' : ''}`}>3 · Audience</span>
                <span className="wiz-step-sep">›</span>
                <span className={`wiz-step${step === 4 ? ' active' : ''}`}>4 · Plan</span>
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

            <label className="wiz-label">Business model</label>
            <Segmented options={BUSINESS_MODELS} value={businessModel} onChange={setBusinessModel} />

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
                <Dropdown options={INDUSTRIES} value={industry} onChange={setIndustry} />
              </label>
            </div>

            <div className="wiz-grid2">
              <label className="wiz-field">
                <span className="wiz-label">Company size</span>
                <Dropdown options={COMPANY_SIZES} value={companySize} onChange={setCompanySize} placeholder="Employees" />
              </label>
              <label className="wiz-field">
                <span className="wiz-label">Annual revenue</span>
                <Dropdown options={REVENUE_RANGES} value={revenue} onChange={setRevenue} />
              </label>
            </div>

            <div className="wiz-grid2">
              <label className="wiz-field">
                <span className="wiz-label">Funding stage</span>
                <Dropdown options={FUNDING_STAGES} value={funding} onChange={setFunding} />
              </label>
              <label className="wiz-field">
                <span className="wiz-label">Primary region</span>
                <Dropdown options={REGIONS} value={region} onChange={setRegion} />
              </label>
            </div>

            <label className="wiz-label">Brand voice</label>
            <Dropdown options={BRAND_VOICES} value={voice} onChange={setVoice} placeholder="Pick a tone" />

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
            {!manualStrategy ? (
              <>
                <label className="wiz-label">What are you trying to do?</label>
                <div className="gs-options">
                  {OBJECTIVES.map((o) => (
                    <button
                      key={o.key}
                      className={`gs-opt${guidedObjective === o.key ? ' on' : ''}`}
                      onClick={() => setGuidedObjective(o.key)}
                    >
                      <span className="gs-opt-label">{o.label}</span>
                      <span className="gs-opt-sub">{o.sub}</span>
                    </button>
                  ))}
                </div>

                <label className="wiz-label">What's your monthly budget range?</label>
                <div className="gs-budget">
                  {BUDGET_TIERS.map((t) => (
                    <button
                      key={t.key}
                      className={`gs-budget-opt${budgetTier === t.key ? ' on' : ''}`}
                      onClick={() => setBudgetTier(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {guidedRec && (
                  <div className="gs-rec">
                    <div className="gs-rec-tag">✦ Recommended</div>
                    <div className="gs-rec-name">{guidedRec.strategyName}</div>
                    <p className="gs-rec-why">{guidedRec.rationale}</p>
                    {guidedRec.steer && <p className="gs-rec-steer">↳ {guidedRec.steer}</p>}
                    <button
                      className={`gs-rec-use${strategy === guidedRec.strategyKey ? ' done' : ''}`}
                      onClick={useRecommendation}
                    >
                      {strategy === guidedRec.strategyKey ? '✓ Using this' : '✓ Use this recommendation'}
                    </button>
                  </div>
                )}

                <button className="wiz-link gs-manual-link" onClick={() => setManualStrategy(true)}>
                  Prefer to choose yourself? Set the strategy manually →
                </button>
              </>
            ) : (
              <>
                <div className="gs-manual-head">
                  <label className="wiz-label">Select campaign strategy</label>
                  <button className="wiz-link" onClick={() => setManualStrategy(false)}>
                    ← Back to guided
                  </button>
                </div>
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
              </>
            )}
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

            {selectedStrategy && (
              <>
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
              </>
            )}

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
                Next: Audience →
              </button>
            </div>
          </div>
        ) : step === 3 ? (
          <div className="wiz-body">
            <label className="wiz-label">Target audience</label>
            <span className="wiz-hint">
              Who is this campaign for? Every campaign targets a specific buyer — define them so the
              messaging, proof, and outcome tracking all line up behind one persona.
            </span>
            <input
              className="wiz-input"
              value={audienceName}
              placeholder="Audience name — e.g. Enterprise Ops leaders"
              onChange={(e) => patchAudience({ name: e.target.value })}
              autoFocus
            />
            <AudienceFields
              value={audienceDraft}
              patch={patchAudience}
              section="identity"
              businessModel={businessModel}
            />
            <AudienceFields
              value={audienceDraft}
              patch={patchAudience}
              section="needs"
              icpPains={icp?.pains}
            />

            <div className="wiz-foot">
              <button className="btn sm" onClick={() => setStep(2)}>
                ← Back
              </button>
              <span className="wiz-hint">Channels, proof, and strategy come from the plan + ICP drawer.</span>
              <span className="spacer" />
              <button
                className="btn primary"
                disabled={!audienceName.trim()}
                onClick={() => setStep(4)}
              >
                Next: Plan →
              </button>
            </div>
          </div>
        ) : (
          <div className="wiz-body">
            <label className="wiz-label">Timing</label>
            <div className="wiz-timing">
              {TIMINGS.map((t) => (
                <button
                  key={t.key}
                  className={`wiz-timing-opt${timing === t.key ? ' on' : ''}`}
                  onClick={() => chooseTiming(t.key)}
                >
                  <span className="wiz-timing-ico">{t.icon}</span>
                  <span className="wiz-timing-name">
                    {t.label}
                    {!t.built && <em> · scaffold</em>}
                  </span>
                  <span className="wiz-timing-blurb">{t.blurb}</span>
                </button>
              ))}
            </div>
            <div className="wiz-volume-note">{TIMING_BY_KEY[timing].scheduling}</div>

            {timing === 'seasonal' && (
              <>
                <label className="wiz-label">Seasonal window</label>
                <Dropdown
                  options={SEASONAL_WINDOWS}
                  value={seasonalWindow}
                  onChange={setSeasonalWindow}
                  placeholder="Pick a recurring window"
                />
              </>
            )}
            {timing === 'always-on' && (
              <>
                <label className="wiz-label">Creative refresh cadence</label>
                <select
                  className="wiz-input"
                  value={refreshWeeks}
                  onChange={(e) => setRefreshWeeks(Number(e.target.value))}
                >
                  {REFRESH_CADENCES.map((c) => (
                    <option key={c.weeks} value={c.weeks}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <div className="wiz-volume-note">
                  Creative auto-rotates on this cadence so the campaign never goes stale.
                </div>
              </>
            )}
            {timing === 'triggered' && (
              <>
                <label className="wiz-label">Trigger kind</label>
                <Segmented
                  options={TRIGGER_KINDS.map((k) => k.label)}
                  value={TRIGGER_KINDS.find((k) => k.key === triggerKind)?.label ?? ''}
                  onChange={(label) => {
                    const k = TRIGGER_KINDS.find((x) => x.label === label)
                    if (k) setTriggerKind(k.key)
                    setTriggerEvent('')
                  }}
                />
                <label className="wiz-label">Event</label>
                <Dropdown
                  options={TRIGGER_EVENTS[triggerKind]}
                  value={triggerEvent}
                  onChange={setTriggerEvent}
                  placeholder="Pick an event"
                />
                <div className="wiz-volume-note">
                  ⚡ Triggered is scaffolded — selectable now; event wiring lands later. Assets get built
                  and coherence-checked, then held until the trigger is connected.
                </div>
              </>
            )}

            {datedTiming && (
              <>
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
              </>
            )}

            {contentChosen.length > 0 && (
              <>
                <label className="wiz-label">Monthly content volume</label>
                <div className="wiz-volume">
                  {VOLUME_TIERS.map((t) => (
                    <button
                      key={t.n}
                      className={`wiz-volume-tier${monthlyVolume === t.n ? ' on' : ''}`}
                      onClick={() => setMonthlyVolume(t.n)}
                    >
                      <span className="wiz-volume-top">
                        <b>{t.n}</b>
                        <span className="wiz-volume-unit">assets / mo</span>
                        <span className="wiz-volume-tag">{t.tag}</span>
                      </span>
                      <span className="wiz-volume-desc">{t.desc}</span>
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
              <button className="btn sm" onClick={() => setStep(3)}>
                ← Back
              </button>
              <span className="wiz-hint">
                {totalPieces} piece{totalPieces === 1 ? '' : 's'} on the calendar
                {durationWeeks ? ` over ${durationWeeks} wks` : ' (rolling month)'}
              </span>
              <span className="spacer" />
              <button
                className="btn primary"
                disabled={!strategy || !campaignName.trim() || !audienceName.trim()}
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
