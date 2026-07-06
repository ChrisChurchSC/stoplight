import { useState } from 'react'
import { aeoOpportunities, aeoSchema } from '../domain/aeo'

/**
 * AEO — answer-engine opportunities: the questions this brand already ranks for in Search
 * Console but doesn't answer in a citable way, each with a ready-to-publish answer brief
 * (the extractable answer, the proof behind it, the source asset, and the FAQ schema).
 * Turn the concept-query gap into a content backlog you can work straight through.
 */

const num = (n: number) => n.toLocaleString()

export function LibraryAEO({ brand }: { brand: string }) {
  const ops = aeoOpportunities(brand)
  const [schemaFor, setSchemaFor] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  if (!ops.length) {
    return (
      <div className="mtx-empty">
        No AEO opportunities yet. Connect Search Console and the questions this brand ranks for but doesn't answer
        show up here, each with a drafted answer.
      </div>
    )
  }

  const totalImpr = ops.reduce((s, o) => s + o.impressions, 0)
  const totalClicks = ops.reduce((s, o) => s + o.clicks, 0)

  const copy = (o: { id: string; answer: string }) => {
    void navigator.clipboard?.writeText(o.answer)
    setCopied(o.id)
    window.setTimeout(() => setCopied((c) => (c === o.id ? null : c)), 1400)
  }

  return (
    <div className="sig">
      <header className="mtx-head">
        <h2>AEO opportunities</h2>
        <span className="mtx-sub">
          Questions you rank for but don't answer, from Search Console. Publish these and you become the source
          answer engines cite.
        </span>
      </header>

      <div className="aeo-summary">
        <div className="aeo-stat">
          <div className="aeo-stat-v">{ops.length}</div>
          <div className="aeo-stat-l">questions you show up for</div>
        </div>
        <div className="aeo-stat">
          <div className="aeo-stat-v">{num(totalImpr)}</div>
          <div className="aeo-stat-l">monthly impressions across them</div>
        </div>
        <div className="aeo-stat warn">
          <div className="aeo-stat-v">{totalClicks}</div>
          <div className="aeo-stat-l">clicks captured — the gap</div>
        </div>
      </div>

      <div className="aeo-list">
        {ops.map((o) => (
          <section className="aeo-card" key={o.id}>
            <div className="aeo-card-head">
              <span className="aeo-q">{o.question}</span>
              <span className="aeo-cluster">{o.cluster}</span>
            </div>
            <div className="aeo-metrics">
              <span>
                <b>{num(o.impressions)}</b> impressions
              </span>
              <span className="aeo-dot">·</span>
              <span>
                position <b>{o.position.toFixed(1)}</b>
              </span>
              <span className="aeo-dot">·</span>
              <span className={o.clicks === 0 ? 'aeo-zero' : ''}>
                <b>{o.clicks}</b> clicks
              </span>
            </div>

            <div className="aeo-answer">
              <div className="aeo-answer-label">Answer · written to be lifted verbatim</div>
              <p className="aeo-answer-text">{o.answer}</p>
              <div className="aeo-answer-foot">
                <button className="aeo-btn" onClick={() => copy(o)}>
                  {copied === o.id ? '✓ Copied' : 'Copy answer'}
                </button>
                <button className="aeo-btn ghost" onClick={() => setSchemaFor((s) => (s === o.id ? null : o.id))}>
                  {schemaFor === o.id ? 'Hide FAQ schema' : 'FAQ schema'}
                </button>
              </div>
              {schemaFor === o.id && <pre className="aeo-schema">{aeoSchema(o)}</pre>}
            </div>

            <div className="aeo-support">
              {o.proof && (
                <span className="aeo-support-item">
                  <em>Proof</em> {o.proof}
                </span>
              )}
              {o.source && (
                <span className="aeo-support-item">
                  <em>Source</em> {o.source}
                </span>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="mtx-foot">
        Each brief pairs a real Search Console question with a drafted answer, its proof, and the source that backs
        it. Publish it as a question-headed page with the answer up top and the FAQ schema, and the answer engines
        pull it. The production version pulls the queries live and drafts each answer from your proof points and the
        relevant episode transcript.
      </div>
    </div>
  )
}
