import { useState } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'

interface Props {
  onClose: () => void
}

const STRATEGIES: { key: string; name: string; desc: string }[] = [
  { key: 'demand-gen', name: 'Demand Gen', desc: 'Fill pipeline with high-intent leads.' },
  { key: 'launch', name: 'Product Launch', desc: 'Awareness + signups for a new release.' },
  { key: 'awareness', name: 'Brand Awareness', desc: 'Top-of-funnel reach and recall.' },
  { key: 'nurture', name: 'Lead Nurture', desc: 'Move existing leads down-funnel.' },
  { key: 'retargeting', name: 'Retargeting', desc: 'Re-engage warm audiences.' },
]

export function NewClientWizard({ onClose }: Props) {
  const icp = useTrafficStore((s) => s.icp)
  const loadIcp = useTrafficStore((s) => s.loadIcp)
  const addClient = useTrafficStore((s) => s.addClient)
  const addCampaign = useTrafficStore((s) => s.addCampaign)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)

  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [pullingIcp, setPullingIcp] = useState(false)
  const [icpPulled, setIcpPulled] = useState(false)
  const [strategy, setStrategy] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [objective, setObjective] = useState('')

  const pullIcp = async () => {
    setPullingIcp(true)
    try {
      await loadIcp()
      setIcpPulled(true)
    } finally {
      setPullingIcp(false)
    }
  }

  const chooseStrategy = (s: { key: string; name: string }) => {
    setStrategy(s.key)
    if (!campaignName.trim()) setCampaignName(`${s.name} — ${name || 'Campaign'}`)
  }

  const create = () => {
    const client = name.trim()
    if (!client || !strategy || !campaignName.trim()) return
    const strategyName = STRATEGIES.find((x) => x.key === strategy)?.name ?? strategy
    addClient(client)
    addCampaign({ name: campaignName.trim(), client, strategy: strategyName, objective: objective.trim() || undefined })
    setClientFilter(client)
    setCampaignFilter(campaignName.trim())
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
              {STRATEGIES.map((s) => (
                <button
                  key={s.key}
                  className={`wiz-strategy${strategy === s.key ? ' on' : ''}`}
                  onClick={() => chooseStrategy(s)}
                >
                  <span className="wiz-strategy-name">{s.name}</span>
                  <span className="wiz-strategy-desc">{s.desc}</span>
                </button>
              ))}
            </div>

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
              <button className="btn sm" onClick={() => setStep(1)}>
                ← Back
              </button>
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
