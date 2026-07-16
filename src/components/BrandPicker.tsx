import { recordTint } from '../domain/records'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * BrandPicker — the on-page brand chooser for pages that are brand-scoped (Library, Insights,
 * Channels, Priorities, Brand system). When no brand is selected, these used to dead-end with
 * "pick a brand in the sidebar"; this makes the choice right where you are instead.
 */
export function BrandPicker({ verb }: { verb: string }) {
  const brandRecords = useTrafficStore((s) => s.brandRecords)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const brands = brandRecords.filter((b) => b.name.trim() && b.name !== 'New brand')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 24px' }}>
      <div style={{ fontSize: 14, color: 'var(--text-muted, #5a6b72)' }}>Choose a brand to {verb}</div>
      {brands.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint, #8a969b)' }}>No brands yet — add one under Foundation → Brands.</div>
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {brands.map((b) => {
            const pfp = b.pfp
            return (
            <button
              key={b.id}
              onClick={() => setClientFilter(b.name)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)',
                cursor: 'pointer', font: 'inherit', boxShadow: '0 1px 2px rgba(16,24,40,.05)',
              }}
            >
              <span style={{ width: 26, height: 26, borderRadius: 7, overflow: 'hidden', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 13, background: pfp ? 'var(--surface)' : recordTint(b.name) }}>
                {pfp
                  ? <img src={pfp} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (b.name[0]?.toUpperCase() ?? '?')}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #1a2023)' }}>{b.name}</span>
            </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
