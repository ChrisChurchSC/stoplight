import { useState } from 'react'
import { GTM_STRATEGIES, mediaSharePct, type GtmStrategy } from '../domain/strategies'
import { STRATEGY_ASSETS } from '../domain/strategyAssets'
import { CHANNELS } from '../domain/channels'
import { typeLabel } from '../domain/channelAssetTypes'
import { useTrafficStore } from '../store/useTrafficStore'

interface Props {
  onClose: () => void
}

export function NewClientWizard({ onClose }: Props) {
  const icp = useTrafficStore((s) => s.icp)
  const loadIcp = useTrafficStore((s) => s.loadIcp)
  const addClient = useTrafficStore((s) => s.addClient)
  const addCampaign = useTrafficStore((s) => s.addCampaign)
  const seedCampaignAssets = useTrafficStore((s) => s.seedCampaignAssets)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)

  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [pullingIcp, setPullingIcp] = useState(false)
  const [icpPulled, setIcpPulled] = useState(false)
  const [strategy, setStrategy] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [objective, setObjective] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [durationWeeks, setDurationWeeks] = useState(8)
  const [budget, setBudget] = useState('')

  const deliverables = strategy ? STRATEGY_ASSETS[strategy] ?? [] : []
  const chosen = deliverables.filter((_, i) => selected.has(i))
  const months = durationWeeks > 0 ? Math.max(1, Math.round(durationWeeks / 4)) : 1
  const paidChosen = chosen.filter((d) => CHANNELS[d.channel].kind === 'paid')
  // Paid = one flight each; brand assets built once; content repeats monthly.
  const totalPieces = chosen.reduce((n, d) => {
    if (CHANNELS[d.channel].kind === 'paid' || d.brand) return n + 1
    return n + d.perMonth * months
  }, 0)
  const cadenceOf = (d: (typeof chosen)[number]) =>
    CHANNELS[d.channel].kind === 'paid'
      ? { count: 'Flight', sub: 'for the flight' }
      : d.brand
        ? { count: '1', sub: 'brand asset' }
        : { count: `${d.perMonth}/mo`, sub: 'monthly' }
  const needsBudget = paidChosen.length > 0
  const selectedStrategy = GTM_STRATEGIES.find((x) => x.key === strategy)
  const mediaPct = selectedStrategy ? mediaSharePct(selectedStrategy) : null
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
    const budgetNum = needsBudget ? Number(budget) || 0 : 0
    const endDate =
      durationWeeks > 0
        ? new Date(Date.now() + durationWeeks * 7 * 86_400_000).toISOString().slice(0, 10)
        : undefined
    const oneTimeAssets = chosen.filter((d) => d.brand).length
    const contentPerMonth = chosen
      .filter((d) => CHANNELS[d.channel].kind !== 'paid' && !d.brand)
      .reduce((n, d) => n + d.perMonth, 0)
    addClient(client)
    addCampaign({
      name: campaign,
      client,
      strategy: strategyName,
      objective: objective.trim() || undefined,
      durationWeeks: durationWeeks || undefined,
      mediaBudget: budgetNum || undefined,
      contentPerMonth: contentPerMonth || undefined,
      oneTimeAssets: oneTimeAssets || undefined,
    })
    void seedCampaignAssets(campaign, chosen, { mediaBudget: budgetNum, flightWeeks: durationWeeks, endDate })
    setClientFilter(client)
    setCampaignFilter(campaign)
    onClose()
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="wiz" role="dialog" aria-label="Add new client">
        <div className="wiz-head">
          <div className="wiz-steps">
            <span className={`wiz-step${step === 1 ? ' active' : ' done'}`}>1 · Client</span>
            <span className="wiz-step-sep">›</span>
            <span className={`wiz-step${step === 2 ? ' active' : ''}`}>2 · Campaign</span>
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
                  Re-pull from Clay
                </button>
              </div>
            ) : (
              <button className="wiz-icp-btn" onClick={pullIcp} disabled={pullingIcp}>
                {pullingIcp ? 'Pulling from Clay…' : '⊕ Add ICP via Clay'}
              </button>
            )}

            <div className="wiz-foot">
              <span className="wiz-hint">ICP is optional — you can add it later.</span>
              <span className="spacer" />
              <button className="btn primary" disabled={!name.trim()} onClick={() => setStep(2)}>
                Next: Campaign →
              </button>
            </div>
          </div>
        ) : (
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

            <label className="wiz-label">Objective (optional)</label>
            <textarea
              className="wiz-input wiz-textarea"
              value={objective}
              placeholder="What should this campaign achieve?"
              onChange={(e) => setObjective(e.target.value)}
            />

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
                <label className="wiz-label">Media budget</label>
                {needsBudget ? (
                  <div className="wiz-budget on">
                    <div className="wiz-budget-rec">
                      ✓ Recommended —{' '}
                      {mediaPct != null
                        ? `${selectedStrategy.name} runs ~${mediaPct}% paid media`
                        : `${selectedStrategy.name} runs paid media`}
                      . Paid channels here: {paidChosen.map((d) => CHANNELS[d.channel].label).join(', ')}.
                    </div>
                    <div className="wiz-budget-input">
                      <span>$</span>
                      <input
                        value={budget}
                        inputMode="numeric"
                        placeholder={`Total media budget${durationWeeks ? ` over ${durationWeeks} wks` : ''} (optional)`}
                        onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ''))}
                      />
                    </div>
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
              <button className="btn sm" onClick={() => setStep(1)}>
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
