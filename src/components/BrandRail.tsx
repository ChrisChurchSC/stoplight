import { useEffect, useState } from 'react'
import { can } from '../domain/access'
import { recordTint } from '../domain/records'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * BrandRail — the far-left vertical switcher (Slack/Linear style). Each brand is a tile; the active
 * one is ringed. "All brands" (grid) is the portfolio view, "+" creates a brand, and the foot holds
 * workspace-level actions (team, settings, account). It's the scope control: clicking a brand sets
 * clientFilter, which the rest of the app filters by.
 */

const TILE = 34
const RailIco = ({ children, size = 18 }: { children: React.ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

const initials = (name: string) =>
  (name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || name[0] || '?').toUpperCase()

const tileBase: React.CSSProperties = {
  width: TILE, height: TILE, borderRadius: 13, display: 'grid', placeItems: 'center',
  flex: '0 0 auto', cursor: 'pointer', border: 'none', padding: 0, transition: 'box-shadow .12s, transform .12s',
}
const ring = (active: boolean): React.CSSProperties =>
  active ? { boxShadow: '0 0 0 2px var(--surface), 0 0 0 4px var(--accent, #0e6d84)' } : { boxShadow: '0 1px 2px rgba(16,24,40,.08)' }

export function BrandRail() {
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setPage = useTrafficStore((s) => s.setPage)
  const openInvite = useTrafficStore((s) => s.openInvite)
  const role = useTrafficStore((s) => s.role)
  const brandRecords = useTrafficStore((s) => s.brandRecords)
  const brands = brandRecords.filter((b) => b.name.trim() && b.name !== 'New brand')
  const is = (v: string) => clientFilter === v

  // No portfolio "all" view — the rail is brand-to-brand only, so land on a real brand.
  useEffect(() => {
    if (clientFilter === 'all' && brands.length) setClientFilter(brands[0].name)
  }, [clientFilter, brands, setClientFilter])

  // A short transition overlay when switching scope, so the change reads as "loading this brand".
  const [switching, setSwitching] = useState<string | null>(null)
  // The account/settings dropdown anchored to the "C" avatar at the foot.
  const [acctOpen, setAcctOpen] = useState(false)
  const go = (scope: string, label: string) => {
    if (clientFilter === scope) return
    setClientFilter(scope)
    setSwitching(label)
    window.setTimeout(() => setSwitching(null), 550)
  }

  const footBtn: React.CSSProperties = {
    width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', flex: '0 0 auto',
    cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--text-muted, #5a6b72)',
  }

  return (
    <>
    <div style={{ width: 50, flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '10px 0', borderRight: '1px solid var(--border)', background: 'var(--surface-2, #f7f4f8)', minHeight: 0, overflowY: 'auto' }}>
      {brands.map((b) => (
        <button key={b.id} title={b.name} onClick={() => go(b.name, b.name)} style={{ ...tileBase, background: recordTint(b.name), color: '#fff', ...ring(is(b.name)) }}>
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '.01em' }}>{initials(b.name)}</span>
        </button>
      ))}

      <button title="Create brand" onClick={() => setPage('brands')} style={{ ...tileBase, background: 'transparent', border: '1.5px dashed var(--border-strong, #cdd5d9)', color: 'var(--text-faint, #8a969b)', boxShadow: 'none' }}>
        <RailIco><path d="M12 5v14M5 12h14" /></RailIco>
      </button>

      <div style={{ flex: 1 }} />

      <button title="Invite a teammate" onClick={openInvite} style={footBtn}>
        <RailIco size={20}><circle cx="9" cy="8" r="3" /><path d="M4 20a5 5 0 0 1 10 0" /><path d="M19 8v6M22 11h-6" /></RailIco>
      </button>
      <button title="Account & settings" aria-haspopup="menu" aria-expanded={acctOpen} onClick={() => setAcctOpen((o) => !o)} style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', flex: '0 0 auto', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text, #1a2023)', fontWeight: 700, fontSize: 13, boxShadow: acctOpen ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent, #0e6d84)' : undefined }}>
        C
      </button>
    </div>

    {acctOpen && (
      <>
        <div onClick={() => setAcctOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
        <div role="menu" style={{ position: 'fixed', left: 58, bottom: 12, zIndex: 61, width: 236, padding: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 10px 30px rgba(16,24,40,.16), 0 2px 6px rgba(16,24,40,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px' }}>
            <span style={{ width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'var(--accent, #0e6d84)', color: '#fff', fontWeight: 800, fontSize: 12, flex: '0 0 auto' }}>C</span>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>Chris</span>
          </div>
          <div className="hsb-ws-sep" />
          <button className="hsb-ws-mi" role="menuitem" onClick={() => { setPage('account'); setAcctOpen(false) }}>
            <span className="hsb-ws-mi-ic"><RailIco><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></RailIco></span>
            Account settings
          </button>
          <button className="hsb-ws-mi" role="menuitem" onClick={() => { openInvite(); setAcctOpen(false) }}>
            <span className="hsb-ws-mi-ic"><RailIco><circle cx="9" cy="8" r="3" /><path d="M4 20a5 5 0 0 1 10 0" /><path d="M19 8v6M22 11h-6" /></RailIco></span>
            Invite a teammate
          </button>
          <button className="hsb-ws-mi" role="menuitem" onClick={() => { setPage('connectors'); setAcctOpen(false) }}>
            <span className="hsb-ws-mi-ic"><RailIco><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></RailIco></span>
            Apps and integrations
          </button>
          {can(role, 'billing') && (
            <button className="hsb-ws-mi" role="menuitem" onClick={() => { setPage('billing'); setAcctOpen(false) }}>
              <span className="hsb-ws-mi-ic"><RailIco><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></RailIco></span>
              Billing
            </button>
          )}
          <div className="hsb-ws-sep" />
          <button className="hsb-ws-mi" role="menuitem" onClick={() => setAcctOpen(false)}>
            <span className="hsb-ws-mi-ic"><RailIco><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></RailIco></span>
            Sign out
          </button>
        </div>
      </>
    )}

    {switching && (
      <>
        <style>{`@keyframes bmr-spin{to{transform:rotate(360deg)}}@keyframes bmr-fade{from{opacity:0}to{opacity:1}}`}</style>
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'color-mix(in srgb, var(--surface, #fff) 80%, transparent)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'bmr-fade .12s ease' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent, #0e6d84)', animation: 'bmr-spin .7s linear infinite' }} />
            <div style={{ fontSize: 14, color: 'var(--text-muted, #5a6b72)' }}>Switching to <strong style={{ color: 'var(--text, #1a2023)' }}>{switching}</strong></div>
          </div>
        </div>
      </>
    )}
    </>
  )
}
