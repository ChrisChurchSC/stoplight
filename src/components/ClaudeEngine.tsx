import { useTrafficStore } from '../store/useTrafficStore'

const SOURCES = ['Upload', 'Clay', 'Sanity']
const CHANNELS = ['Resend', 'Meta', 'LinkedIn', 'YouTube']

const TOOL_LABEL: Record<string, string> = {
  read_cms: 'Read CMS · Sanity',
  enrich_lead: 'Enrich lead · Clay',
  publish_email: 'Publish email · Resend',
  publish_social: 'Publish social · Buffer',
}

function summarizeOut(o: unknown): string {
  const x = (o ?? {}) as Record<string, unknown>
  if (x.connector) return `→ ${x.connector}${x.staged === 'mock' ? ' (mock)' : x.staged === 'direct' ? ' (direct)' : ''} ✓`
  if (x.source) return `← ${x.source}`
  if (x.company) return `${x.company} · fit ${x.fit}`
  return '✓'
}

/**
 * The Claude engine — the center of the architecture, made literal. HyperFocus
 * invokes it; Claude reads from the sources and publishes to the channels by
 * calling tools (the connectors). The panel shows the flow and logs the exact
 * tool calls Claude makes, with a direct-adapter fallback when there's no key.
 */
export function ClaudeEngine() {
  const open = useTrafficStore((s) => s.engineOpen)
  const close = useTrafficStore((s) => s.closeEngine)
  const running = useTrafficStore((s) => s.engineRunning)
  const actions = useTrafficStore((s) => s.engineActions)
  const summary = useTrafficStore((s) => s.engineSummary)
  const live = useTrafficStore((s) => s.engineLive)
  const runEngine = useTrafficStore((s) => s.runEngine)
  const clientFilter = useTrafficStore((s) => s.clientFilter)

  if (!open) return null
  const noClient = clientFilter === 'all'

  return (
    <>
      <div className="eng-scrim" onClick={close} />
      <div className="eng" role="dialog" aria-label="Claude engine">
        <div className="eng-head">
          <div>
            <div className="eng-title">✦ Claude engine</div>
            <div className="eng-sub">
              The cockpit invokes it; it reads from your sources and publishes to your channels by calling tools.
            </div>
          </div>
          <button className="eng-x" onClick={close}>
            ✕
          </button>
        </div>

        <div className="eng-flow">
          <div className="eng-col">
            <div className="eng-col-label">Sources</div>
            {SOURCES.map((s) => (
              <div key={s} className="eng-node">
                {s}
              </div>
            ))}
          </div>
          <div className="eng-arrow">→</div>
          <div className="eng-core">
            <span className="eng-core-name">✦ Claude</span>
            <span className="eng-core-sub">reads · drafts · checks · publishes</span>
          </div>
          <div className="eng-arrow">→</div>
          <div className="eng-col">
            <div className="eng-col-label">Channels</div>
            {CHANNELS.map((c) => (
              <div key={c} className="eng-node">
                {c}
              </div>
            ))}
          </div>
        </div>

        <div className="eng-actions-bar">
          <button className="btn sm" disabled={running || noClient} onClick={() => runEngine('read')}>
            ↡ Read from sources
          </button>
          <button className="btn sm primary" disabled={running || noClient} onClick={() => runEngine('publish')}>
            ↟ Publish approved
          </button>
          {noClient && <span className="eng-hint">Pick a client to run the engine.</span>}
        </div>

        {(running || actions.length > 0 || summary) && (
          <div className="eng-log">
            {running && <div className="eng-running">Claude is working…</div>}
            {actions.map((a, i) => (
              <div key={i} className="eng-act">
                <span className="eng-act-tool">{TOOL_LABEL[a.tool] ?? a.tool}</span>
                <span className="eng-act-target">
                  {String(a.input.assetName ?? a.input.name ?? a.input.client ?? '')}
                </span>
                <span className="spacer" />
                <span className="eng-act-out">{summarizeOut(a.output)}</span>
              </div>
            ))}
            {summary && !running && (
              <div className="eng-summary">
                <span className={`eng-badge ${live ? 'live' : 'off'}`}>{live ? '✦ Claude' : 'offline'}</span>
                {summary}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
