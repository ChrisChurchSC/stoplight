import { useEffect, useState } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The brand-info editor inside a brand folder — who the brand is, what it offers,
 * how it sounds. Backed by the client profile (the same facts intake + site
 * ingestion fill in), so what you add here is the standing context the brand's
 * canvases and messaging system draw from.
 */

interface InfoField {
  key: string
  label: string
  type?: 'textarea'
  /** A list field — one item per line, stored as string[]. */
  list?: boolean
  placeholder?: string
}
const FIELDS: InfoField[] = [
  { key: 'oneLiner', label: 'One-liner', placeholder: 'What the brand does, in one line' },
  { key: 'website', label: 'Website', placeholder: 'example.com' },
  { key: 'industry', label: 'Industry' },
  { key: 'founded', label: 'Founded' },
  { key: 'headquarters', label: 'Headquarters' },
  { key: 'traction', label: 'Traction', placeholder: 'e.g. 2M downloads' },
  { key: 'mission', label: 'Mission', type: 'textarea' },
  { key: 'voice', label: 'Brand voice', type: 'textarea', placeholder: 'e.g. Plain, technical, no hype' },
  { key: 'products', label: 'Products / offerings', type: 'textarea', list: true, placeholder: 'One per line' },
  { key: 'differentiators', label: 'Differentiators', type: 'textarea', list: true, placeholder: 'One per line' },
  { key: 'values', label: 'Values', type: 'textarea', list: true, placeholder: 'One per line' },
]

type Info = Record<string, string>

export function BrandInfo({ brand }: { brand: string }) {
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)

  const [info, setInfo] = useState<Info>({})
  const [dirty, setDirty] = useState(false)

  // Seed from the stored profile when the brand changes (list fields → newlines).
  useEffect(() => {
    const p = (clientProfiles[brand] ?? {}) as Record<string, unknown>
    const next: Info = {}
    for (const f of FIELDS) {
      const v = p[f.key]
      next[f.key] = f.list ? ((v as string[] | undefined) ?? []).join('\n') : ((v as string | undefined) ?? '')
    }
    setInfo(next)
    setDirty(false)
    // Re-seed only when the brand changes — not on every profile write (avoids
    // clobbering in-progress edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand])

  const set = (k: string, v: string) => {
    setInfo((prev) => ({ ...prev, [k]: v }))
    setDirty(true)
  }

  const save = () => {
    const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
    const patch: Record<string, unknown> = {}
    for (const f of FIELDS) patch[f.key] = f.list ? lines(info[f.key] ?? '') : (info[f.key] ?? '').trim()
    setClientProfile(brand, patch)
    setDirty(false)
  }

  return (
    <div className="brand-info">
      <div className="library-add">
        {FIELDS.map((f) => (
          <label className={`library-field${f.type === 'textarea' ? ' brand-info-wide' : ''}`} key={f.key}>
            <span className="library-field-label">{f.label}</span>
            {f.type === 'textarea' ? (
              <textarea
                className="library-input"
                rows={f.list ? 4 : 2}
                placeholder={f.placeholder}
                value={info[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
              />
            ) : (
              <input
                className="library-input"
                placeholder={f.placeholder}
                value={info[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
          </label>
        ))}
        <button className="btn primary sm library-add-btn" onClick={save} disabled={!dirty}>
          {dirty ? '✓ Save brand info' : 'Saved'}
        </button>
      </div>
    </div>
  )
}
