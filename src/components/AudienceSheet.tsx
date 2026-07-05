import { useEffect } from 'react'
import { newAudience, type AudienceType } from '../domain/audiences'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Audience Sheet — the audience segment section as a spreadsheet: one row per
 * segment, one column per thing that makes it specific (definition, tier, pains,
 * objections, triggers, angle, lead proof, CTA, anti-message, channels, stage,
 * examples, list). Every cell is editable and writes straight back to the
 * audience in the brand system, so the segment is a full spec, not a name.
 */

type Col = { key: keyof AudienceType; label: string; kind: 'text' | 'list'; wide?: boolean }
const COLUMNS: Col[] = [
  { key: 'name', label: 'Segment', kind: 'text' },
  { key: 'definition', label: 'Definition', kind: 'text', wide: true },
  { key: 'tier', label: 'Tier / capacity', kind: 'text' },
  { key: 'pains', label: 'Pains', kind: 'list', wide: true },
  { key: 'objections', label: 'Objections', kind: 'text', wide: true },
  { key: 'triggers', label: 'Triggers', kind: 'list' },
  { key: 'messageAngle', label: 'Angle', kind: 'text', wide: true },
  { key: 'leadProof', label: 'Lead proof (ranked)', kind: 'list', wide: true },
  { key: 'outcome', label: 'CTA / outcome', kind: 'text' },
  { key: 'antiMessage', label: 'Don’t say', kind: 'text', wide: true },
  { key: 'channels', label: 'Channels', kind: 'list' },
  { key: 'funnelStage', label: 'Stage', kind: 'text' },
  { key: 'examples', label: 'Examples', kind: 'list' },
  { key: 'listRef', label: 'List', kind: 'text' },
]

const cellValue = (a: AudienceType, c: Col): string => {
  const v = a[c.key]
  if (c.kind === 'list') return Array.isArray(v) ? v.join(', ') : ''
  return typeof v === 'string' ? v : ''
}
const parseCell = (raw: string, kind: Col['kind']): string | string[] =>
  kind === 'list' ? raw.split(',').map((s) => s.trim()).filter(Boolean) : raw.trim()

export function AudienceSheet({ brand }: { brand: string }) {
  const audiences = useTrafficStore((s) => s.brandSystems[brand]?.audiences ?? [])
  const setMessagingBrand = useTrafficStore((s) => s.setMessagingBrand)
  const addLibraryItem = useTrafficStore((s) => s.addLibraryItem)
  const removeLibraryItem = useTrafficStore((s) => s.removeLibraryItem)
  const updateLibraryItem = useTrafficStore((s) => s.updateLibraryItem)

  // Edits patch the ACTIVE messaging brand's library, so point it at this brand.
  useEffect(() => {
    setMessagingBrand(brand)
  }, [brand, setMessagingBrand])

  const save = (id: string, c: Col, raw: string) => {
    updateLibraryItem('audiences', id, { [c.key]: parseCell(raw, c.kind) })
  }

  return (
    <div className="aud-sheet-wrap">
      <div className="aud-sheet-head">
        <div>
          <h3>Audience segments</h3>
          <span className="aud-sheet-sub">
            One row per segment, one column per thing that makes it specific. Edit any cell; it saves to the segment.
          </span>
        </div>
        <button className="aud-sheet-add" onClick={() => addLibraryItem('audiences', newAudience({ name: 'New segment' }))}>
          + Segment
        </button>
      </div>

      <div className="aud-sheet-scroll">
        <table className="aud-sheet">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={String(c.key)} className={`${c.key === 'name' ? 'stick' : ''}${c.wide ? ' wide' : ''}`}>
                  {c.label}
                </th>
              ))}
              <th className="aud-sheet-x" />
            </tr>
          </thead>
          <tbody>
            {audiences.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="aud-sheet-empty">
                  No segments yet. Add one, or ask Claude to discover them from your data.
                </td>
              </tr>
            ) : (
              audiences.map((a) => (
                <tr key={a.id}>
                  {COLUMNS.map((c) => (
                    <td key={String(c.key)} className={`${c.key === 'name' ? 'stick' : ''}${c.wide ? ' wide' : ''}`}>
                      <textarea
                        className="aud-cell"
                        defaultValue={cellValue(a, c)}
                        rows={1}
                        placeholder="—"
                        onBlur={(e) => save(a.id, c, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="aud-sheet-x">
                    <button className="aud-sheet-del" title="Remove segment" onClick={() => removeLibraryItem('audiences', a.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="aud-sheet-foot">
        Segment messaging lives on the audience: any asset you tag to a segment inherits its angle and lead proof. The
        list itself stays in your CRM; the “List” cell is the pointer.
      </p>
    </div>
  )
}
