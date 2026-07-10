import { useEffect, useState } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The brand's visual identity — colors, type, logo, art direction. Backed by the
 * client profile (colors / fonts / logo / imageryStyle), same save pattern as the
 * About tab. The piece the messaging-focused settings tabs were missing.
 */
const parseColors = (v: string): string[] => v.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

export function BrandVisual({ brand }: { brand: string }) {
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)

  const [colors, setColors] = useState('')
  const [fonts, setFonts] = useState('')
  const [logo, setLogo] = useState('')
  const [imagery, setImagery] = useState('')
  const [dirty, setDirty] = useState(false)

  // Seed from the stored profile when the brand changes.
  useEffect(() => {
    const p = clientProfiles[brand] ?? {}
    setColors((p.colors ?? []).join(', '))
    setFonts((p.fonts ?? []).join('\n'))
    setLogo(p.logo ?? '')
    setImagery(p.imageryStyle ?? '')
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand])

  const mark = (fn: (v: string) => void) => (v: string) => { fn(v); setDirty(true) }

  const save = () => {
    setClientProfile(brand, {
      colors: parseColors(colors),
      fonts: lines(fonts),
      logo: logo.trim(),
      imageryStyle: imagery.trim(),
    })
    setDirty(false)
  }

  const swatches = parseColors(colors)

  return (
    <div className="brand-info">
      <div className="library-add">
        <label className="library-field brand-info-wide">
          <span className="library-field-label">Colors</span>
          {swatches.length > 0 && (
            <div className="brand-swatches">
              {swatches.map((c, i) => (
                <span key={i} className="brand-swatch" style={{ background: c }} title={c} />
              ))}
            </div>
          )}
          <input className="library-input" placeholder="#FAF6F0, #3ECBA0, #1C2340" value={colors} onChange={(e) => mark(setColors)(e.target.value)} />
        </label>
        <label className="library-field">
          <span className="library-field-label">Logo URL</span>
          <input className="library-input" placeholder="https://…/logo.svg" value={logo} onChange={(e) => mark(setLogo)(e.target.value)} />
        </label>
        <label className="library-field brand-info-wide">
          <span className="library-field-label">Fonts</span>
          <textarea className="library-input" rows={3} placeholder="One per line" value={fonts} onChange={(e) => mark(setFonts)(e.target.value)} />
        </label>
        <label className="library-field brand-info-wide">
          <span className="library-field-label">Imagery style</span>
          <textarea className="library-input" rows={3} placeholder="Art-direction notes" value={imagery} onChange={(e) => mark(setImagery)(e.target.value)} />
        </label>
      </div>
      <div className={`brand-savebar${dirty ? ' dirty' : ''}`}>
        <span className="brand-savebar-status">{dirty ? '● Unsaved changes' : '✓ All changes saved'}</span>
        <button className="btn primary sm" onClick={save} disabled={!dirty}>
          {dirty ? 'Save visual identity' : 'Saved'}
        </button>
      </div>
    </div>
  )
}
