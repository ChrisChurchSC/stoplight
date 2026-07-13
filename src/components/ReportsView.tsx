import { useRef, useState } from 'react'
import { REPORT_KIND_LABEL } from '../domain/reports'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Reports — saved, Claude-generated write-ups over a brand's library. The narrative and
 * recommendations layer that sits above the live Signals data: Signals answers "what's
 * true right now", a Report is a dated synthesis you keep and share. Each report is
 * self-contained HTML, rendered in an isolated frame so it looks exactly as generated.
 */

const fmtWhen = (ms: number): string => {
  const d = new Date(ms)
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${d.getFullYear()}`
}

export function ReportsView({ scopeClient }: { scopeClient?: string }) {
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const reports = useTrafficStore((s) => s.reports)
  const deleteReport = useTrafficStore((s) => s.deleteReport)
  const addPinnedInsight = useTrafficStore((s) => s.addPinnedInsight)
  const openHomeChat = useTrafficStore((s) => s.openHomeChat)
  const [openId, setOpenId] = useState<string | null>(null)
  // Transient feedback under the report toolbar after a pin attempt.
  const [pinMsg, setPinMsg] = useState<string | null>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  // A brand may be in scope (sidebar / scopeClient), but it isn't required: with none selected we
  // show every brand's reports. Generation happens in the chat, which asks the brand there.
  const brand = scopeClient ?? (clientFilter !== 'all' ? clientFilter : null)
  const allBrands = !brand
  const list = (brand ? reports.filter((r) => r.client === brand) : reports).sort((a, b) => b.createdAt - a.createdAt)
  const open = openId ? list.find((r) => r.id === openId) : null

  // Pin the highlighted text out of the report. The report renders in a same-origin
  // srcDoc iframe, so its live selection is readable here.
  const pinSelection = () => {
    if (!open) return
    const text = (frameRef.current?.contentWindow?.getSelection?.()?.toString() ?? '').trim()
    if (!text) {
      setPinMsg('Select a line in the report first, then pin it.')
      return
    }
    addPinnedInsight({ client: open.client, text, sourceReportId: open.id, sourceTitle: open.title })
    frameRef.current?.contentWindow?.getSelection?.()?.removeAllRanges?.()
    setPinMsg('Pinned to the Overview ✓')
  }

  if (open) {
    return (
      <div className="mtx report-open">
        <div className="report-bar">
          <button className="report-back" onClick={() => { setOpenId(null); setPinMsg(null) }}>
            ← All reports
          </button>
          <div className="report-bar-title">
            <span className={`report-kind report-kind-${open.kind}`}>{REPORT_KIND_LABEL[open.kind]}</span>
            <span>{open.title}</span>
            <span className="report-bar-date">{fmtWhen(open.createdAt)}</span>
          </div>
          {pinMsg && <span className="report-pin-msg">{pinMsg}</span>}
          <button className="report-pin" title="Highlight a line in the report, then pin it to the Overview" onClick={pinSelection}>
            📌 Pin selection
          </button>
          <button
            className="report-del"
            title="Delete report"
            onClick={() => {
              deleteReport(open.id)
              setOpenId(null)
              setPinMsg(null)
            }}
          >
            Delete
          </button>
        </div>
        <iframe
          ref={frameRef}
          className="report-frame"
          title={open.title}
          srcDoc={open.html}
          sandbox="allow-same-origin allow-popups"
          onLoad={(e) => {
            const f = e.currentTarget
            try {
              const h = f.contentWindow?.document.documentElement.scrollHeight
              if (h) f.style.height = `${h + 24}px`
            } catch {
              /* cross-origin guard; srcDoc is same-origin so this normally succeeds */
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="mtx">
      <header className="mtx-head">
        <h2>{brand ? `${brand} · Reports` : 'Reports'}</h2>
        <span className="mtx-sub">
          {brand
            ? "Saved analyses over this brand's library. Insights is the live read; a report is a dated synthesis you keep."
            : 'Saved analyses across every brand. Generate one below and pick the brand in the conversation.'}
        </span>
      </header>

      <div className="report-new">
        <div className="report-new-copy">
          <span className="report-new-ico">✦</span>
          <div>
            <strong>Generate a report with Claude</strong>
            <span>
              Claude reads a brand's library and writes it up: coverage, segments, and recommendations. It asks which
              brand in the conversation{brand ? '' : ' (or start it here)'}, then saves the report here, dated.
            </span>
          </div>
        </div>
        <button className="report-new-btn" onClick={() => openHomeChat(brand ? `Generate a report for ${brand}` : 'Generate a report')}>
          ✦ Ask Claude
        </button>
      </div>

      {list.length === 0 ? (
        <div className="mtx-empty">
          No reports yet. Use “Generate a report with Claude” above and it lands here as a saved report.
        </div>
      ) : (
        <div className="report-list">
          {list.map((r) => (
            <article
              key={r.id}
              className="report-card"
              role="button"
              tabIndex={0}
              onClick={() => setOpenId(r.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpenId(r.id)
                }
              }}
            >
              <div className="report-card-top">
                <span className={`report-kind report-kind-${r.kind}`}>{REPORT_KIND_LABEL[r.kind]}</span>
                {allBrands && <span className="report-card-client">{r.client}</span>}
                <span className="report-card-date">{fmtWhen(r.createdAt)}</span>
              </div>
              <div className="report-card-title">{r.title}</div>
              {r.summary && <div className="report-card-sub">{r.summary}</div>}
              <div className="report-card-foot">
                <span className="report-card-open">Open report →</span>
                <button
                  className="report-card-del"
                  aria-label="Delete report"
                  title="Delete report"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteReport(r.id)
                  }}
                >
                  ✕
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mtx-foot">
        Reports are point-in-time. They capture the story and the recommendations, including the before/after
        rewrites that the live Insights read can't generate. Regenerate anytime the library moves.
      </div>
    </div>
  )
}
