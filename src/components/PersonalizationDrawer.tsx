import { useEffect, useMemo, useState } from 'react'
import { clientForCampaign } from '../domain/clients'
import { conditionSentence } from '../domain/conditions'
import { FANOUT_DIMENSIONS, dimensionValues } from '../domain/fanout'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Personalization cards — the canvas gesture. Add a dimension card (Audience,
 * Location, Journey, …) and it fans the campaign's base into one variant per value of
 * that dimension, with values from the brand's library. The panel shows the resulting
 * variant COUNT before you commit (never fans silently), lets you fan across a subset
 * (selective), and prune specific combinations (matrix). On Apply it fans + generates,
 * then runs the coherence check so only the breaking variants surface. Each variant
 * carries its lineage, so stacking cards multiplies and outcomes attribute correctly.
 */
export function PersonalizationDrawer() {
  const open = useTrafficStore((s) => s.personalizeOpen)
  const setOpen = useTrafficStore((s) => s.setPersonalizeOpen)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const rows = useTrafficStore((s) => s.rows)
  const brandSystems = useTrafficStore((s) => s.brandSystems)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const fanOutPreview = useTrafficStore((s) => s.fanOutPreview)
  const fanOut = useTrafficStore((s) => s.fanOut)
  const runCoherenceCheck = useTrafficStore((s) => s.runCoherenceCheck)
  const campaignConditions = useTrafficStore((s) => s.campaignConditions)
  const proposeConditions = useTrafficStore((s) => s.proposeConditions)
  const setConditionStatus = useTrafficStore((s) => s.setConditionStatus)

  const campaign = campaignFilter !== 'all' ? campaignFilter : ''
  const client = clientFilter !== 'all' ? clientFilter : clientForCampaign(campaign)

  const [dim, setDim] = useState('audience')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [proposing, setProposing] = useState(false)

  const base = useMemo(() => rows.filter((r) => (r.campaign ?? '').trim() === campaign.trim()), [rows, campaign])
  const libValues = useMemo(
    () => dimensionValues(dim, brandSystems[client], clientProfiles[client]),
    [dim, brandSystems, clientProfiles, client],
  )
  const manualValues = useMemo(() => extra.split(',').map((s) => s.trim()).filter(Boolean), [extra])
  const values = libValues.length ? libValues : manualValues
  const valuesSig = values.join('|')

  // Default to fanning across all values when the dimension (or its values) changes.
  useEffect(() => {
    setSelected(new Set(values))
    setExcluded(new Set())
    setResult(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dim, valuesSig])

  const chosen = values.filter((v) => selected.has(v))

  // Cards already applied = the lineage dimensions present in the campaign's variants.
  const appliedDims = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const r of base) for (const [k, v] of Object.entries(r.lineage ?? {})) (m.get(k) ?? m.set(k, new Set()).get(k)!).add(v)
    return m
  }, [base])

  // Matrix pruning crosses the new values with the prior fanned dimension's values.
  const prior = [...appliedDims.entries()].filter(([k]) => k !== dim).sort((a, b) => b[1].size - a[1].size)[0]
  const priorDim = prior?.[0]
  const priorVals = prior ? [...prior[1]] : []
  const showMatrix = !!priorDim && priorVals.length * chosen.length > 0 && priorVals.length * chosen.length <= 60

  const exclude = useMemo(() => {
    const out: Record<string, string>[] = []
    if (showMatrix && priorDim)
      for (const pv of priorVals) for (const nv of chosen) if (excluded.has(`${pv}||${nv}`)) out.push({ [priorDim]: pv, [dim]: nv })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excluded, showMatrix, priorDim, priorVals.join('|'), chosen.join('|'), dim])

  const plan = campaign && chosen.length ? fanOutPreview(campaign, dim, chosen, exclude) : null
  const dimMeta = FANOUT_DIMENSIONS.find((d) => d.key === dim)
  const conditions = campaign ? campaignConditions[campaign] ?? [] : []

  if (!open) return null

  const toggleVal = (v: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(v) ? next.delete(v) : next.add(v)
      return next
    })
  const toggleCell = (pv: string, nv: string) =>
    setExcluded((prev) => {
      const k = `${pv}||${nv}`
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })

  const propose = () => {
    if (!campaign || proposing) return
    setProposing(true)
    try {
      proposeConditions(campaign)
    } finally {
      setProposing(false)
    }
  }

  const apply = async () => {
    if (!campaign || !plan || plan.variantCount === 0 || busy) return
    setBusy(true)
    setResult(null)
    try {
      const r = await fanOut(campaign, dim, chosen, { exclude })
      await runCoherenceCheck()
      const breaks = useTrafficStore.getState().claudeBreaks ?? []
      setResult(`${r.variantCount} variants created · ${breaks.length} break${breaks.length === 1 ? '' : 's'} found — review in the Breaks queue.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="drawer-scrim" onClick={() => setOpen(false)} />
      <aside className="drawer pz-drawer">
        <div className="drawer-head">
          <strong>⧉ Personalize</strong>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>

        {!campaign ? (
          <div className="drawer-body">
            <div className="pz-empty">Open a campaign to add personalization cards.</div>
          </div>
        ) : (
          <>
            <div className="drawer-body">
              {appliedDims.size > 0 && (
                <div className="pz-section">
                  <div className="pz-label">Cards on this campaign</div>
                  <div className="pz-chips">
                    {[...appliedDims.entries()].map(([k, v]) => (
                      <span key={k} className="pz-chip applied">
                        {FANOUT_DIMENSIONS.find((d) => d.key === k)?.label ?? k}
                        <span className="pz-chip-n">{v.size}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="pz-section">
                <div className="pz-label">Add a card</div>
                <div className="pz-chips">
                  {FANOUT_DIMENSIONS.map((d) => (
                    <button
                      key={d.key}
                      className={`pz-chip pick${d.key === dim ? ' active' : ''}`}
                      title={d.source}
                      onClick={() => setDim(d.key)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pz-section">
                <div className="pz-label">
                  {dimMeta?.label} values <span className="pz-src">{dimMeta?.source}</span>
                </div>
                {values.length === 0 ? (
                  <div className="pz-manual">
                    <div className="pz-hint">No {dim} values in the library. Add them in About, or type a few:</div>
                    <input
                      className="library-input"
                      placeholder="e.g. Asbury, Belmar, Manasquan"
                      value={extra}
                      onChange={(e) => setExtra(e.target.value)}
                    />
                  </div>
                ) : (
                  <>
                    <div className="pz-vals">
                      {values.map((v) => (
                        <label key={v} className={`pz-val${selected.has(v) ? ' on' : ''}`}>
                          <input type="checkbox" checked={selected.has(v)} onChange={() => toggleVal(v)} />
                          {v}
                        </label>
                      ))}
                    </div>
                    <div className="pz-vals-actions">
                      <button className="btn ghost sm" onClick={() => setSelected(new Set(values))}>
                        All
                      </button>
                      <button className="btn ghost sm" onClick={() => setSelected(new Set())}>
                        None
                      </button>
                    </div>
                  </>
                )}
              </div>

              {showMatrix && priorDim && (
                <div className="pz-section">
                  <div className="pz-label">
                    Prune combinations <span className="pz-src">{`${priorDim} × ${dim}`}</span>
                  </div>
                  <div className="pz-matrix" style={{ gridTemplateColumns: `auto repeat(${chosen.length}, 1fr)` }}>
                    <div className="pz-mh" />
                    {chosen.map((nv) => (
                      <div key={nv} className="pz-mh">
                        {nv}
                      </div>
                    ))}
                    {priorVals.map((pv) => (
                      <FragmentRow key={pv} pv={pv} chosen={chosen} excluded={excluded} toggleCell={toggleCell} />
                    ))}
                  </div>
                  <div className="pz-hint">Uncheck a cell to skip that combination.</div>
                </div>
              )}

              <div className="pz-section">
                <div className="pz-label">
                  Conditional logic <span className="pz-src">proposed, you approve</span>
                </div>
                {conditions.length === 0 ? (
                  <div className="pz-cond-empty">
                    <div className="pz-hint">
                      Let the brand’s library suggest if/then rules — “if audience is X, lead with their proof”,
                      “if lifecycle is lapsed, use the win-back CTA”. You approve each before it shapes copy.
                    </div>
                  </div>
                ) : (
                  <div className="pz-conds">
                    {conditions.map((c) => (
                      <div key={c.id} className={`pz-cond ${c.status}`}>
                        <div className="pz-cond-text">{conditionSentence(c)}</div>
                        {c.rationale && <div className="pz-cond-why">{c.rationale}</div>}
                        <div className="pz-cond-actions">
                          <button
                            className={`btn ghost xs${c.status === 'approved' ? ' on' : ''}`}
                            onClick={() => setConditionStatus(campaign, c.id, c.status === 'approved' ? 'proposed' : 'approved')}
                          >
                            {c.status === 'approved' ? '✓ Approved' : 'Approve'}
                          </button>
                          <button
                            className={`btn ghost xs${c.status === 'rejected' ? ' on' : ''}`}
                            onClick={() => setConditionStatus(campaign, c.id, c.status === 'rejected' ? 'proposed' : 'rejected')}
                          >
                            {c.status === 'rejected' ? 'Dismissed' : 'Dismiss'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn ghost sm" disabled={proposing} onClick={propose}>
                  {proposing ? 'Proposing…' : conditions.length ? 'Re-propose conditions' : 'Propose conditions'}
                </button>
              </div>
            </div>

            <div className="drawer-foot pz-foot">
              <div className="pz-count">
                {plan ? (
                  <>
                    <strong>{plan.variantCount}</strong> variants
                    <span className="pz-count-sub">
                      {plan.baseCount} base × {chosen.length} value{chosen.length === 1 ? '' : 's'}
                      {plan.pruned ? `, ${plan.pruned} pruned` : ''}
                    </span>
                  </>
                ) : (
                  <span className="pz-count-sub">Pick at least one value</span>
                )}
              </div>
              <button className="btn sm primary" disabled={!plan || plan.variantCount === 0 || busy} onClick={apply}>
                {busy ? 'Fanning…' : `Fan out ${plan ? plan.variantCount : ''}`.trim()}
              </button>
            </div>
            {result && <div className="pz-result">{result}</div>}
          </>
        )}
      </aside>
    </>
  )
}

function FragmentRow({
  pv,
  chosen,
  excluded,
  toggleCell,
}: {
  pv: string
  chosen: string[]
  excluded: Set<string>
  toggleCell: (pv: string, nv: string) => void
}) {
  return (
    <>
      <div className="pz-mr">{pv}</div>
      {chosen.map((nv) => (
        <label key={nv} className="pz-cell">
          <input type="checkbox" checked={!excluded.has(`${pv}||${nv}`)} onChange={() => toggleCell(pv, nv)} />
        </label>
      ))}
    </>
  )
}
