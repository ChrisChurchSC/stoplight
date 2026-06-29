import type { Rtb } from '../domain/rtb'

/**
 * The brand's standing persuasion toolkit: the proof library (every RTB across
 * its campaigns, deduped) and the calls to action it actually uses. Both are
 * Foundation-level assets every campaign draws from — proof carries an
 * at-a-glance engagement chip per RTB; CTAs show the recurring intents the brand
 * drives to (and how many posts end in a dead end with no CTA at all).
 */
interface Props {
  proof: Rtb[]
  perfByRtb: ReadonlyMap<string, { avg: number; posts: number }>
  fmtEng: (n: number) => string
  ctas: { label: string; count: number }[]
  deadEnds: number
}

export function ProofLibrary({ proof, perfByRtb, fmtEng, ctas, deadEnds }: Props) {
  return (
    <section className="fnd-panel fnd-prooflib">
      <div className="fnd-panel-head">
        <h2 className="fnd-panel-title">Proof &amp; CTAs</h2>
        <span className="fnd-count">
          {proof.length} RTB{proof.length === 1 ? '' : 's'} · {ctas.length} CTA{ctas.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="fnd-pl-body">
        {/* Proof library — the standing RTBs. */}
        <div className="fnd-pl-proof">
          <div className="fnd-sub-label">Proof library</div>
          {proof.length ? (
            <ul className="fnd-rtbs">
              {proof.map((r) => {
                const p = perfByRtb.get(r.id)
                return (
                  <li key={r.id} className="fnd-rtb">
                    <span className="fnd-rtb-label">
                      {r.label}
                      {p ? (
                        <span className="fnd-rtb-perf" title={`${p.posts} posts carry this proof`}>
                          {fmtEng(p.avg)} avg eng
                        </span>
                      ) : null}
                    </span>
                    <span className="fnd-rtb-detail">{r.detail}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="fnd-empty">No proof points yet — they fill in from ingestion + campaigns.</p>
          )}
        </div>

        {/* Calls to action — the intents the brand drives to. */}
        <div className="fnd-pl-ctas">
          <div className="fnd-sub-label">Calls to action</div>
          {ctas.length || deadEnds ? (
            <ul className="fnd-ctas">
              {ctas.map((c) => (
                <li key={c.label} className="fnd-cta">
                  <span>{c.label}</span>
                  <span className="fnd-count">{c.count}</span>
                </li>
              ))}
              {deadEnds > 0 && (
                <li className="fnd-cta dead">
                  <span>No CTA (dead end)</span>
                  <span className="fnd-count">{deadEnds}</span>
                </li>
              )}
            </ul>
          ) : (
            <p className="fnd-empty">No CTAs yet — they fill in as the brand's content is ingested.</p>
          )}
        </div>
      </div>
    </section>
  )
}
