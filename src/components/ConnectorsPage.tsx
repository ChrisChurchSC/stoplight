import { useEffect, useState } from 'react'
import { getActiveWorkspaceId } from '../lib/session'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { siGoogleanalytics, siGooglesearchconsole, siYoutube, siResend } from 'simple-icons'

/**
 * Connectors: the integrations page. Shows only the connectors that are actually wired today:
 * Google (one sign-in covers GA4 + Search Console + YouTube analytics) and Resend. Live status comes
 * from the connection_status RPC; connecting runs the real OAuth / key flow in startConnect.
 */

type Connector = { name: string; desc: string; color: string; light?: boolean; connected?: boolean }
type Group = { label: string; blurb: string; items: Connector[] }

const GROUPS: Group[] = [
  {
    label: 'Analytics',
    blurb: 'One Google sign-in covers all three',
    items: [
      { name: 'Google Analytics', desc: 'Sessions & conversions into Insights', color: '#E8710A' },
      { name: 'Search Console', desc: 'SEO impressions & clicks', color: '#4285F4' },
      { name: 'YouTube', desc: 'Views, watch time & subscribers', color: '#FF0000' },
    ],
  },
  {
    label: 'Email',
    blurb: 'Send transactional & product email',
    items: [{ name: 'Resend', desc: 'Send transactional & product email', color: '#000000' }],
  },
]

const monogram = (name: string) => (name[0] ?? '?').toUpperCase()

const Chevron = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

type SI = { path: string; hex: string }
// Brand marks from simple-icons; anything missing falls back to a monogram tile.
const ICONS: Record<string, SI> = {
  'Google Analytics': siGoogleanalytics, 'Search Console': siGooglesearchconsole, YouTube: siYoutube, Resend: siResend,
}
// No "Recommended" badges: these are the only connectors, so the label would be noise.
const RECOMMENDED = new Set<string>()

// Which page rows are backed by a REAL, wired connection. One Google OAuth covers GA4 + Search
// Console + YouTube, so all three map to the 'google' provider; Resend is its own.
const PROVIDER: Record<string, 'google' | 'resend'> = {
  'Google Analytics': 'google',
  'Search Console': 'google',
  YouTube: 'google',
  Resend: 'resend',
}

function LogoTile({ c }: { c: Connector }) {
  const ic = ICONS[c.name]
  const base: React.CSSProperties = { width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', flex: '0 0 auto' }
  if (ic) {
    return (
      <span style={{ ...base, background: 'var(--surface, #fff)', border: '1px solid var(--border)' }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill={'#' + ic.hex} aria-hidden="true"><path d={ic.path} /></svg>
      </span>
    )
  }
  return <span style={{ ...base, background: c.color, color: c.light ? '#1a2023' : '#fff', fontWeight: 800, fontSize: 15 }}>{monogram(c.name)}</span>
}

function Row({ c, first, rec, connected, canConnect, onConnect }: { c: Connector; first: boolean; rec?: boolean; connected: boolean; canConnect: boolean; onConnect: () => void }) {
  const wired = c.name in PROVIDER
  // A row that cannot connect says so by looking unavailable, rather than clicking to nothing.
  const inert = wired && !canConnect && !connected
  return (
    <button
      onClick={onConnect}
      disabled={inert}
      title={inert ? 'Connecting needs a signed-in workspace. Use the deployed app.' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 16px',
        background: 'transparent', border: 'none', borderTop: first ? 'none' : '1px dashed var(--border)',
        cursor: inert ? 'not-allowed' : 'pointer', font: 'inherit', textAlign: 'left',
        opacity: inert ? 0.55 : 1,
      }}
    >
      <LogoTile c={c} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text, #1a2023)' }}>
          {c.name}
          {rec && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--accent, #0e6d84)', background: 'color-mix(in srgb, var(--accent, #0e6d84) 12%, transparent)', borderRadius: 6, padding: '2px 6px' }}>Recommended</span>}
        </span>
        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-muted, #5a6b72)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.desc}</span>
      </span>
      {connected ? (
        // Status, not a call to action: a calm green pill with a check.
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--green, #30a46c)', background: 'color-mix(in srgb, var(--green, #30a46c) 14%, transparent)', borderRadius: 999, padding: '3px 10px 3px 8px', flex: '0 0 auto' }}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          Connected
        </span>
      ) : wired ? (
        // Action: a filled accent pill that clearly invites a click.
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent, #ff6347)', background: 'var(--accent-soft, #ffe8e2)', borderRadius: 999, padding: '5px 14px', flex: '0 0 auto' }}>Connect</span>
      ) : (
        <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted, #5a6b72)', flex: '0 0 auto' }}>Connect</span>
      )}
      <span style={{ display: 'grid', placeItems: 'center', width: 16, color: 'var(--text-faint, #8a969b)', flex: '0 0 auto' }}><Chevron /></span>
    </button>
  )
}

const SERVER = 'mcp/breadcrumbs-server.mjs'
const CODE_CMD = 'claude mcp add breadcrumbs -- node "$(pwd)/mcp/breadcrumbs-server.mjs"'

export function ConnectorsPage() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(id)
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500)
  }

  // Real connection status for this workspace (Google + Resend), read from the floor-safe RPC.
  const [wsId, setWsId] = useState<string | null>(null)
  const [connected, setConnected] = useState<Set<string>>(new Set())
  // Resend connect modal: paste a key, verify it against Resend, then store only if it works.
  const [resendOpen, setResendOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      const ws = await getActiveWorkspaceId()
      if (!alive) return
      setWsId(ws)
      if (ws && isSupabaseConfigured && supabase) {
        try {
          const { data } = await supabase.rpc('connection_status', { ws })
          if (alive && Array.isArray(data)) setConnected(new Set((data as { provider: string }[]).map((r) => r.provider)))
        } catch {
          /* migration not applied yet — everything reads disconnected */
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const startConnect = (name: string) => {
    const p = PROVIDER[name]
    if (!p || !wsId) return
    if (p === 'google') {
      window.location.href = `/api/google-connect?workspace=${encodeURIComponent(wsId)}`
      return
    }
    if (p === 'resend') {
      setKeyInput('')
      setConnectError(null)
      setResendOpen(true)
    }
  }

  // Verify the pasted key server-side, then store it. The endpoint only returns ok:true once Resend
  // has accepted the key, so a bad key surfaces an error here instead of a false "Connected".
  const submitResend = async () => {
    const key = keyInput.trim()
    if (!key || !wsId) return
    setVerifying(true)
    setConnectError(null)
    try {
      const r = await fetch('/api/connect-resend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspace: wsId, key }),
      })
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (r.ok && body.ok) {
        setConnected((s) => new Set(s).add('resend'))
        setResendOpen(false)
      } else {
        setConnectError(body.error || 'Could not verify that key.')
      }
    } catch {
      setConnectError('Network error. Try again.')
    } finally {
      setVerifying(false)
    }
  }

  const cardStyle: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden', boxShadow: '0 1px 2px rgba(16,24,40,.04)' }
  const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-faint, #8a969b)', margin: '28px 2px 10px' }

  return (
    <div className="page">
      <div className="page-body" style={{ maxWidth: 860, margin: '0 auto', width: '100%', padding: '36px 24px 80px' }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, margin: '0 0 4px', color: 'var(--text, #1a2023)' }}>Connectors</h1>
        <p style={{ fontSize: 15, color: 'var(--text-muted, #5a6b72)', margin: 0 }}>Connect your accounts so real performance flows into Insights and Reports.</p>

        {/* Connecting needs a signed-in workspace to store the credential against, and the connect
            endpoints only exist in the deployed environment. Without one, every Connect button was
            an inert no-op (startConnect returns early on a null workspace), which reads as broken
            rather than unavailable. Say which it is. */}
        {!wsId && (
          <div
            style={{
              marginTop: 18, padding: '12px 14px', borderRadius: 12,
              border: '1px solid var(--border)', background: 'var(--hover, #eef2f3)',
              fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-muted, #5a6b72)',
            }}
          >
            <strong style={{ color: 'var(--text, #1a2023)' }}>Connecting is unavailable here.</strong>{' '}
            Connectors store credentials against your signed-in workspace, and this session does not have
            one. Use the deployed app to connect an account. Everything else on this page is still
            browsable.
          </div>
        )}

        {GROUPS.map((g) => (
          <div key={g.label}>
            <div style={sectionLabel}>{g.label} <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--text-faint,#8a969b)' }}>· {g.blurb}</span></div>
            <div style={cardStyle}>
              {g.items.map((c, i) => {
                const prov = PROVIDER[c.name]
                const isConn = !!c.connected || (prov ? connected.has(prov) : false)
                return <Row key={c.name} c={c} first={i === 0} rec={RECOMMENDED.has(c.name)} connected={isConn} canConnect={!!wsId} onConnect={() => startConnect(c.name)} />
              })}
            </div>
          </div>
        ))}

        {/* MCP */}
        <div style={sectionLabel}>MCP</div>
        <div style={{ ...cardStyle, padding: '22px 20px' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 10px', color: 'var(--text,#1a2023)' }}>Drive the whole app from your AI tools</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted,#5a6b72)', margin: '0 0 16px' }}>
            Add the Breadcrumbs MCP server to Claude and set up brands, generate assets, and run campaigns from chat.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--hover,#eef2f3)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', maxWidth: 520 }}>
            <code style={{ flex: 1, fontSize: 13, color: 'var(--text,#1a2023)' }}>{SERVER}</code>
            <button onClick={() => copy('server', SERVER)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: 'var(--accent,#0e6d84)', fontWeight: 600 }}>{copied === 'server' ? '✓ Copied' : 'Copy'}</button>
          </div>
          <ol style={{ margin: '16px 0 0', paddingLeft: 18, fontSize: 14, color: 'var(--text-muted,#5a6b72)', lineHeight: 1.9 }}>
            <li>In your terminal (from the repo): <code style={{ background: 'var(--hover,#eef2f3)', borderRadius: 6, padding: '1px 6px', fontSize: 12.5 }}>{CODE_CMD}</code>
              <button onClick={() => copy('cmd', CODE_CMD)} style={{ marginLeft: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--accent,#0e6d84)' }}>{copied === 'cmd' ? '✓' : 'copy'}</button>
            </li>
            <li>Keep a tab open at <code style={{ background: 'var(--hover,#eef2f3)', borderRadius: 6, padding: '1px 6px', fontSize: 12.5 }}>localhost:5173</code>.</li>
            <li>Ask Claude to set up a brand, generate assets, or run a flow.</li>
          </ol>
        </div>
      </div>

      {resendOpen && (
        <div
          onClick={() => { if (!verifying) setResendOpen(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(16,24,40,.35)', display: 'grid', placeItems: 'center', padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 440, background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 20px 60px rgba(16,24,40,.28)', padding: 22 }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: 'var(--text, #1a2023)' }}>Connect Resend</h2>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted, #5a6b72)', margin: '0 0 14px' }}>Paste a full-access API key. We check it with Resend before saving, so a bad key never shows as connected.</p>
            <input
              type="password"
              autoFocus
              value={keyInput}
              onChange={(e) => { setKeyInput(e.target.value); if (connectError) setConnectError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !verifying) void submitResend() }}
              placeholder="re_..."
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, fontFamily: 'ui-monospace, SFMono-Regular, monospace', padding: '10px 12px', borderRadius: 10, border: `1px solid ${connectError ? 'var(--accent, #ff6347)' : 'var(--border)'}`, background: 'var(--hover, #f7f9fa)', color: 'var(--text, #1a2023)', outline: 'none' }}
            />
            {connectError && <div style={{ fontSize: 12.5, color: 'var(--accent, #ff6347)', margin: '8px 2px 0' }}>{connectError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setResendOpen(false)} disabled={verifying} style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-muted, #5a6b72)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 14px', cursor: verifying ? 'default' : 'pointer' }}>Cancel</button>
              <button onClick={() => void submitResend()} disabled={verifying || !keyInput.trim()} style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', background: 'var(--accent, #ff6347)', border: 'none', borderRadius: 9, padding: '8px 16px', cursor: verifying || !keyInput.trim() ? 'default' : 'pointer', opacity: verifying || !keyInput.trim() ? 0.6 : 1 }}>{verifying ? 'Verifying…' : 'Verify & connect'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
