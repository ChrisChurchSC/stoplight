import { useState } from 'react'
import {
  siBuffer, siMeta, siX, siTiktok, siYoutube, siPinterest, siGoogleads, siGoogleanalytics,
  siGooglesearchconsole, siWebflow, siWordpress, siFramer, siShopify, siMailchimp, siHubspot,
  siFigma, siGoogledrive, siDropbox, siZapier, siMake,
  siGhost, siSanity, siResend, siFormspree, siMixpanel,
} from 'simple-icons'

/**
 * Connectors — the integrations page. Grouped by the job each does in the create → publish →
 * measure loop (Publishing, Paid ads, CMS, Email, Analytics, CRM, Assets, Automation), plus the
 * API keys and the MCP connect card. Presentational for now: rows show status + a Connect affordance;
 * wiring real OAuth is per-connector work.
 */

type Connector = { name: string; desc: string; color: string; light?: boolean; connected?: boolean }
type Group = { label: string; blurb: string; items: Connector[] }

const GROUPS: Group[] = [
  {
    label: 'Publishing',
    blurb: 'Where generated posts ship',
    items: [
      { name: 'Buffer', desc: 'Schedule and publish generated posts', color: '#2C4BFF', connected: true },
      { name: 'Meta', desc: 'Publish to Instagram & Facebook', color: '#0866FF' },
      { name: 'LinkedIn', desc: 'Publish company posts & documents', color: '#0A66C2' },
      { name: 'X', desc: 'Publish posts and threads', color: '#111111' },
      { name: 'TikTok', desc: 'Publish videos and photo posts', color: '#FE2C55' },
      { name: 'YouTube', desc: 'Publish videos & community posts', color: '#FF0000' },
      { name: 'Pinterest', desc: 'Publish pins', color: '#E60023' },
    ],
  },
  {
    label: 'Paid ads',
    blurb: 'Push creative, import live ads, pull spend',
    items: [
      { name: 'Meta Ads', desc: 'Ad creative, live ads & spend', color: '#0866FF' },
      { name: 'Google Ads', desc: 'Search / PMax creative & performance', color: '#4285F4' },
      { name: 'LinkedIn Ads', desc: 'B2B ad creative & metrics', color: '#0A66C2' },
      { name: 'TikTok Ads', desc: 'Video ad creative & metrics', color: '#FE2C55' },
    ],
  },
  {
    label: 'CMS & web',
    blurb: 'Where SEO / landing-page flows publish',
    items: [
      { name: 'Webflow', desc: 'Publish landing & SEO pages', color: '#4353FF' },
      { name: 'WordPress', desc: 'Publish articles & pages', color: '#21759B' },
      { name: 'Ghost', desc: 'Publish articles & newsletters', color: '#15171A' },
      { name: 'Sanity', desc: 'Publish to your headless CMS', color: '#F03E2F' },
      { name: 'Framer', desc: 'Publish landing pages', color: '#0055FF' },
      { name: 'Shopify', desc: 'Publish product & collection pages', color: '#95BF47' },
    ],
  },
  {
    label: 'Email & lifecycle',
    blurb: 'Where lifecycle flows send',
    items: [
      { name: 'Klaviyo', desc: 'Send lifecycle & campaign emails', color: '#232323' },
      { name: 'Mailchimp', desc: 'Send campaigns & newsletters', color: '#FFE01B', light: true },
      { name: 'Customer.io', desc: 'Trigger lifecycle journeys', color: '#7131FF' },
      { name: 'Resend', desc: 'Send transactional & product email', color: '#000000' },
      { name: 'Braze', desc: 'Cross-channel lifecycle messaging', color: '#801ED7' },
    ],
  },
  {
    label: 'Analytics',
    blurb: 'Closes the loop — feeds Insights & attribution',
    items: [
      { name: 'Google Analytics', desc: 'Sessions & conversions into Insights', color: '#E8710A' },
      { name: 'Mixpanel', desc: 'Product & conversion events', color: '#7856FF' },
      { name: 'Search Console', desc: 'SEO impressions & clicks', color: '#4285F4' },
      { name: 'Meta Insights', desc: 'Organic social performance', color: '#0866FF' },
    ],
  },
  {
    label: 'Data pipeline',
    blurb: 'Aggregate marketing data across every source',
    items: [
      { name: 'Supermetrics', desc: 'Pull marketing data into sheets, BI & warehouses', color: '#E6398A' },
      { name: 'Funnel', desc: 'Collect & normalize spend across channels', color: '#FF5A36' },
      { name: 'Fivetran', desc: 'Sync sources to your warehouse', color: '#0073FF' },
      { name: 'Segment', desc: 'Customer data platform & event pipeline', color: '#4FB58B' },
      { name: 'Summer.io', desc: 'Aggregate & model marketing data', color: '#F5A623', light: true },
    ],
  },
  {
    label: 'CRM',
    blurb: 'Accounts & contacts for ABM (Companies / People)',
    items: [
      { name: 'HubSpot', desc: 'Sync accounts, contacts & pipeline', color: '#FF7A59' },
      { name: 'Salesforce', desc: 'Sync accounts & opportunities', color: '#00A1E0' },
      { name: 'Attio', desc: 'Sync companies & people', color: '#111111', connected: true },
      { name: 'Pipedrive', desc: 'Sync deals & contacts', color: '#017737' },
    ],
  },
  {
    label: 'Assets & design',
    blurb: 'Pull brand assets, push creative',
    items: [
      { name: 'Figma', desc: 'Pull brand assets & designs', color: '#F24E1E' },
      { name: 'Canva', desc: 'Pull & push creative', color: '#00C4CC' },
      { name: 'Google Drive', desc: 'Pull brand files & assets', color: '#1FA463', connected: true },
      { name: 'Dropbox', desc: 'Pull brand files & assets', color: '#0061FF' },
    ],
  },
  {
    label: 'Notifications & approvals',
    blurb: 'Where the team gets pinged — ship alerts, approvals, digests',
    items: [
      { name: 'Slack', desc: 'Approvals, ship alerts & digests', color: '#4A154B' },
      { name: 'Microsoft Teams', desc: 'Approvals & alerts in Teams', color: '#6264A7' },
    ],
  },
  {
    label: 'Automation',
    blurb: 'Glue for the long tail',
    items: [
      { name: 'Formspree', desc: 'Capture form & landing-page leads', color: '#E5122E' },
      { name: 'Zapier', desc: 'Connect to thousands of apps', color: '#FF4A00' },
      { name: 'Make', desc: 'Build custom automations', color: '#6D00CC' },
    ],
  },
]

const monogram = (name: string) => (name[0] ?? '?').toUpperCase()

const Chevron = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

// LinkedIn was pulled from simple-icons on trademark request, so supply its mark.
const LINKEDIN_PATH =
  'M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z'

type SI = { path: string; hex: string }
const LI: SI = { path: LINKEDIN_PATH, hex: '0A66C2' }
// Real brand marks from simple-icons; anything missing there falls back to a monogram tile.
const ICONS: Record<string, SI> = {
  Buffer: siBuffer, Meta: siMeta, LinkedIn: LI, X: siX, TikTok: siTiktok, YouTube: siYoutube, Pinterest: siPinterest,
  'Meta Ads': siMeta, 'Google Ads': siGoogleads, 'LinkedIn Ads': LI, 'TikTok Ads': siTiktok,
  Webflow: siWebflow, WordPress: siWordpress, Ghost: siGhost, Sanity: siSanity, Framer: siFramer, Shopify: siShopify,
  Mailchimp: siMailchimp, Resend: siResend,
  'Google Analytics': siGoogleanalytics, Mixpanel: siMixpanel, 'Search Console': siGooglesearchconsole, 'Meta Insights': siMeta,
  HubSpot: siHubspot,
  Figma: siFigma, 'Google Drive': siGoogledrive, Dropbox: siDropbox,
  Formspree: siFormspree, Zapier: siZapier, Make: siMake,
}
// The picks worth suggesting first — the ones that close the create → publish → measure loop.
const RECOMMENDED = new Set(['Buffer', 'Meta', 'LinkedIn', 'Meta Ads', 'Google Ads', 'Webflow', 'WordPress', 'Klaviyo', 'Mailchimp', 'Google Analytics', 'Search Console', 'Supermetrics', 'HubSpot', 'Attio', 'Slack', 'Figma', 'Google Drive', 'Zapier'])

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

function Row({ c, first, rec }: { c: Connector; first: boolean; rec?: boolean }) {
  return (
    <button
      onClick={() => { /* per-connector OAuth wiring is a follow-up */ }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 16px',
        background: 'transparent', border: 'none', borderTop: first ? 'none' : '1px dashed var(--border)',
        cursor: 'pointer', font: 'inherit', textAlign: 'left',
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
      {c.connected
        ? <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent, #0e6d84)', flex: '0 0 auto' }}>Connected</span>
        : <span style={{ fontSize: 13, color: 'var(--text-muted, #5a6b72)', flex: '0 0 auto' }}>Connect</span>}
      <span style={{ display: 'grid', placeItems: 'center', width: 16, color: 'var(--text-faint, #8a969b)', flex: '0 0 auto' }}><Chevron /></span>
    </button>
  )
}

const SERVER = 'mcp/hyperfocus-server.mjs'
const CODE_CMD = 'claude mcp add hyperfocus -- node "$(pwd)/mcp/hyperfocus-server.mjs"'

export function ConnectorsPage() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(id)
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500)
  }

  const cardStyle: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden', boxShadow: '0 1px 2px rgba(16,24,40,.04)' }
  const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-faint, #8a969b)', margin: '28px 2px 10px' }

  return (
    <div className="page">
      <div className="page-body" style={{ maxWidth: 860, margin: '0 auto', width: '100%', padding: '36px 24px 80px' }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, margin: '0 0 4px', color: 'var(--text, #1a2023)' }}>Connectors</h1>
        <p style={{ fontSize: 15, color: 'var(--text-muted, #5a6b72)', margin: 0 }}>Connect your marketing stack — publish content, sync records, and pull performance back in.</p>

        {GROUPS.map((g) => (
          <div key={g.label}>
            <div style={sectionLabel}>{g.label} <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--text-faint,#8a969b)' }}>· {g.blurb}</span></div>
            <div style={cardStyle}>
              {g.items.map((c, i) => <Row key={c.name} c={c} first={i === 0} rec={RECOMMENDED.has(c.name)} />)}
            </div>
          </div>
        ))}

        {/* API */}
        <div style={sectionLabel}>API</div>
        <div style={cardStyle}>
          <button onClick={() => { /* keys UI */ }} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', flex: '0 0 auto', background: 'var(--hover,#eef2f3)', color: 'var(--text-muted,#5a6b72)', fontWeight: 700, fontSize: 13 }}>{'</>'}</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text,#1a2023)' }}>Personal API keys</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-muted,#5a6b72)' }}>Manage keys for programmatic access</span>
            </span>
            <span style={{ display: 'grid', placeItems: 'center', width: 16, color: 'var(--text-faint,#8a969b)' }}><Chevron /></span>
          </button>
          <button onClick={() => { /* keys UI */ }} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', borderTop: '1px dashed var(--border)', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', flex: '0 0 auto', background: 'var(--hover,#eef2f3)', color: 'var(--text-muted,#5a6b72)' }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 14.5 14.5 9.5" /><path d="M11 6.5 12 5.5a3.5 3.5 0 0 1 5 5l-1 1" /><path d="M13 17.5l-1 1a3.5 3.5 0 0 1-5-5l1-1" /></svg>
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text,#1a2023)' }}>Workspace API keys <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted,#5a6b72)', background: 'var(--hover,#eef2f3)', borderRadius: 6, padding: '1px 6px', marginLeft: 4 }}>Admins only</span></span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-muted,#5a6b72)' }}>Admin-managed keys with workspace API access</span>
            </span>
            <span style={{ display: 'grid', placeItems: 'center', width: 16, color: 'var(--text-faint,#8a969b)' }}><Chevron /></span>
          </button>
        </div>

        {/* MCP */}
        <div style={sectionLabel}>MCP</div>
        <div style={{ ...cardStyle, padding: '22px 20px' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 10px', color: 'var(--text,#1a2023)' }}>Drive the whole app from your AI tools</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted,#5a6b72)', margin: '0 0 16px' }}>
            Add the Hyperfocus MCP server to Claude and set up brands, generate assets, and run campaigns from chat.
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
    </div>
  )
}
