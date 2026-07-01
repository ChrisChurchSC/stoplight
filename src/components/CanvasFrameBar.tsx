import { useRef, useState } from 'react'
import { isBrandless } from '../domain/brand'
import { GTM_STRATEGIES } from '../domain/strategies'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The canvas frame — Brand, Subject, Strategy — lives in the top bar, because each one
 * governs the WHOLE canvas (the brand is the coherence baseline, the subject is what
 * every asset is about, the strategy is the playbook every lane follows). They were
 * once root cards on the canvas; up here they stay in view and out of the work surface.
 * Brand also carries its inspectable baseline (voice / proof in force, and from where).
 */
type Menu = 'brand' | 'subject' | 'strategy' | null

export function CanvasFrameBar() {
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const clientList = useTrafficStore((s) => s.clientList)
  const brandSystems = useTrafficStore((s) => s.brandSystems)
  const setCampaignClient = useTrafficStore((s) => s.setCampaignClient)
  const setCampaignSubject = useTrafficStore((s) => s.setCampaignSubject)
  const setCampaignStrategy = useTrafficStore((s) => s.setCampaignStrategy)
  const brandBaselineFor = useTrafficStore((s) => s.brandBaselineFor)
  const promoteBrand = useTrafficStore((s) => s.promoteBrand)
  // Re-read so the baseline stays live as the library / tree changes.
  useTrafficStore((s) => s.brandMeta)
  const [menu, setMenu] = useState<Menu>(null)
  const subjectRef = useRef<HTMLInputElement>(null)

  // Only inside an open canvas (a campaign). At brand-home the BrandTabs are shown instead.
  if (campaignFilter === 'all' || clientFilter === 'all') return null
  const campaign = campaignFilter
  const campObj = campaignList.find((c) => c.name === campaign)

  const brandless = isBrandless(clientFilter)
  const baseline = brandless ? null : brandBaselineFor(clientFilter)

  const subjectText = campObj?.subject?.trim() || 'Set a subject'
  const strat = (campObj?.strategy ?? '').trim()
  const stratPlan = GTM_STRATEGIES.find(
    (s) => s.key === strat.toLowerCase() || s.name.toLowerCase() === strat.toLowerCase(),
  )
  const strategyName = stratPlan?.name ?? (strat || 'Set a strategy')

  const close = () => setMenu(null)
  const toggle = (m: Menu) => setMenu((cur) => (cur === m ? null : m))

  // Reusable subjects: approved library masters + subjects already on this brand's
  // campaigns, deduped (pulling a library subject onto a campaign is the instance side).
  const libSubjects = (brandSystems[clientFilter]?.subjects ?? []).filter((s) => s.approved !== false).map((s) => s.text.trim())
  const campSubjects = campaignList.map((c) => c.subject?.trim() ?? '')
  const reuseSubjects = [...new Set([...libSubjects, ...campSubjects].filter(Boolean))]

  const relationLabel: Record<string, string> = { self: 'this brand', ancestor: 'inherited', shared: 'shared in', 'co-brand': 'co-brand' }

  return (
    <div className="cfb">
      {menu && <div className="cfb-scrim" onClick={close} />}

      {/* Brand — the coherence baseline. */}
      <div className="cfb-seg">
        <button className={`cfb-ctrl${brandless ? ' cfb-warn' : ''}`} onClick={() => toggle('brand')}>
          <span className="cfb-tag">Brand</span>
          {brandless ? (
            <span className="cfb-val cfb-val-warn">⚠ None bound</span>
          ) : (
            <>
              <span className="cfb-val">{clientFilter}</span>
              {baseline?.draft && <span className="cfb-draft">draft</span>}
            </>
          )}
          <span className="cfb-caret">▾</span>
        </button>
        {menu === 'brand' && (
          <div className="cfb-pop">
            <div className="cfb-pop-head">{brandless ? 'Bind a brand' : 'Swap the brand'}</div>
            {clientList.filter((c) => c.trim()).map((c) => (
              <button
                key={c}
                className={`cfb-opt${c === clientFilter ? ' on' : ''}`}
                onClick={() => { if (c !== clientFilter) setCampaignClient(campaign, c); close() }}
              >
                <span>▤ {c}</span>
                <span className="cfb-opt-mark">{c === clientFilter ? '✓ current' : 'Use'}</span>
              </button>
            ))}
            {baseline && (
              <div className="cfb-baseline">
                <div className="cfb-pop-head">Coherence baseline</div>
                <div className="cfb-brow"><span>Voice</span><span>{baseline.voice || 'not set'}</span></div>
                <div className="cfb-brow"><span>Proof</span><span>{baseline.proofCount}</span></div>
                <div className="cfb-brow"><span>Audiences</span><span>{baseline.audienceCount}</span></div>
                <div className="cfb-srcs">
                  {baseline.sources.map((s) => (
                    <div key={s.brand} className="cfb-src">
                      <span>{s.brand}</span>
                      <span className={`cfb-rel rel-${s.relation}`}>{relationLabel[s.relation] ?? s.relation}</span>
                    </div>
                  ))}
                </div>
                <div className="cfb-note">Generation and the coherence check read only these.</div>
                {baseline.draft && (
                  <button
                    className="btn sm primary cfb-promote"
                    onClick={() => {
                      const name = window.prompt('Promote this draft to a brand named:', clientFilter)
                      if (name && name.trim()) { promoteBrand(clientFilter, name.trim()); close() }
                    }}
                  >
                    Promote to a real brand
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <span className="cfb-div">›</span>

      {/* Subject — what every asset on the canvas is about. */}
      <div className="cfb-seg">
        <button className="cfb-ctrl" onClick={() => toggle('subject')}>
          <span className="cfb-tag">Subject</span>
          <span className="cfb-val">{subjectText}</span>
          <span className="cfb-caret">▾</span>
        </button>
        {menu === 'subject' && (
          <div className="cfb-pop">
            <div className="cfb-pop-head">Set the subject</div>
            <div className="cfb-sub-add">
              <input
                ref={subjectRef}
                className="cfb-input"
                placeholder="What it's about…"
                defaultValue={campObj?.subject ?? ''}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = e.currentTarget.value.trim()
                    if (v) { setCampaignSubject(campaign, v); close() }
                  }
                }}
              />
              <button
                className="cfb-set"
                onClick={() => {
                  const v = subjectRef.current?.value.trim()
                  if (v) { setCampaignSubject(campaign, v); close() }
                }}
              >
                Set
              </button>
            </div>
            {reuseSubjects.length > 0 && (
              <>
                <div className="cfb-pop-head">Or reuse one</div>
                {reuseSubjects.map((s) => (
                  <button key={s} className="cfb-opt" onClick={() => { setCampaignSubject(campaign, s); close() }}>
                    <span>✦ {s}</span>
                    <span className="cfb-opt-mark">Use</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <span className="cfb-div">›</span>

      {/* Strategy — the GTM playbook every lane follows. */}
      <div className="cfb-seg">
        <button className="cfb-ctrl" onClick={() => toggle('strategy')}>
          <span className="cfb-tag">Strategy</span>
          <span className="cfb-val">{strategyName}</span>
          <span className="cfb-playbook">Playbook ▾</span>
        </button>
        {menu === 'strategy' && (
          <div className="cfb-pop cfb-pop-wide">
            <div className="cfb-pop-head">Strategy playbook</div>
            {GTM_STRATEGIES.map((s) => {
              const active = s.name.toLowerCase() === strat.toLowerCase() || s.key === strat.toLowerCase()
              return (
                <button
                  key={s.key}
                  className={`cfb-opt${active ? ' on' : ''}`}
                  onClick={() => { if (!active) setCampaignStrategy(campaign, s.name); close() }}
                >
                  <span className="cfb-strat-name">{s.name}{active && ' ✓'}</span>
                  <span className="cfb-strat-seq">{s.sequence}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
