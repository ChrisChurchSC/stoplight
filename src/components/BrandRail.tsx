import { useEffect, useState } from 'react'
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
  const brandRecords = useTrafficStore((s) => s.brandRecords)
  const brands = brandRecords.filter((b) => b.name.trim() && b.name !== 'New brand')
  const is = (v: string) => clientFilter === v

  // No portfolio "all" view — the rail is brand-to-brand only, so land on a real brand.
  useEffect(() => {
    if (clientFilter === 'all' && brands.length) setClientFilter(brands[0].name)
  }, [clientFilter, brands, setClientFilter])

  // A short transition overlay when switching scope, so the change reads as "loading this brand".
  const [switching, setSwitching] = useState<string | null>(null)
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
      <button title="Settings" onClick={() => setPage('account')} style={footBtn}>
        <RailIco size={20}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.6v2.6M12 18.8v2.6M4 7.6l2.2 1.3M17.8 15.1l2.2 1.3M4 16.4l2.2-1.3M17.8 8.9 20 7.6" /></RailIco>
      </button>
      <button title="Account" onClick={() => setPage('account')} style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', flex: '0 0 auto', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text, #1a2023)', fontWeight: 700, fontSize: 13 }}>
        C
      </button>
    </div>

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
