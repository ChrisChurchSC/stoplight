import { Fragment, type ReactNode } from 'react'
import type { BrandRecord } from '../domain/brandRecord'
import { recordTint, type RecordField } from '../domain/records'
import { BufferedInput, BufferedTextarea } from './BufferedInput'
import { RecordsChat } from './RecordsChat'
import { SheetTabs } from './SheetTabs'

/**
 * The single-brand view — the Brand page is scoped by the rail to ONE brand, so it's not a list of
 * many records but a table ABOUT that one brand: each attribute is a row (Field | Value), grouped
 * into the same pink section bands (Overview / Strategic Foundation / …) the record tables use, and
 * rendered with the same rec-* table styling — same header, sub-row, card framing, accent bands,
 * borders and hover — so it reads as the exact same page design as Segments/Companies/etc. The
 * brand's name is the page title, not a cell. "All brands" falls back to the multi-row table.
 */
export function BrandTable({
  brand,
  fields,
  statuses,
  icon,
  onUpdate,
}: {
  brand: BrandRecord
  fields: RecordField[]
  statuses: string[]
  icon: ReactNode
  onUpdate: (id: string, patch: Partial<BrandRecord>) => void
}) {
  const val = (k: string) => ((brand as unknown as Record<string, unknown>)[k] ?? '').toString()
  const set = (k: string, v: string) => onUpdate(brand.id, { [k]: v } as Partial<BrandRecord>)
  const name = val('name')

  // The header carries only the brand name (the page identity, like "Segments"); every attribute —
  // including status — is a Field | Value row so the body matches the other record tables exactly.
  const bodyFields = fields.filter((f) => f.key !== 'name')

  return (
    <div className="rec-with-chat">
      <RecordsChat
        recordType="Brand"
        noun={['brand', 'brands']}
        brand={name}
        fields={fields}
        statuses={statuses}
        rows={[brand] as unknown as ({ id: string } & Record<string, unknown>)[]}
        onAdd={() => undefined}
        onUpdate={onUpdate as unknown as (id: string, patch: Partial<Record<string, unknown>>) => void}
        onDelete={() => undefined}
      />
      <div className="rec">
        <header className="rec-head">
          <div className="rec-title">
            <span className="rec-title-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                {icon}
              </svg>
            </span>
            <BufferedInput className="brand-title-name" value={name} onCommit={(v) => set('name', v)} placeholder="Brand name" />
          </div>
        </header>

        <div className="rec-sub">
          <span className="rec-sub-count">Communications strategy</span>
        </div>

        <div className="rec-table-wrap">
          <table className="rec-table grouped brand-1up" style={{ minWidth: 560 }}>
            <colgroup>
              <col style={{ width: 220 }} />
              <col />
            </colgroup>
            <tbody>
              {bodyFields.map((f, i, arr) => {
                const v = val(f.key)
                const showBand = !!f.group && f.group !== (i > 0 ? arr[i - 1].group : undefined)
                return (
                  <Fragment key={f.key}>
                    {showBand && (
                      <tr className="brand-band-row">
                        <td className="brand-band" colSpan={2}>{f.group}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="rec-td brand-1up-key">{f.label}</td>
                      <td className="rec-td brand-1up-val">
                        {f.kind === 'multiline' ? (
                          <BufferedTextarea className="rec-cell brand-1up-textarea" value={v} onCommit={(nv) => set(f.key, nv)} rows={2} placeholder="—" />
                        ) : f.kind === 'status' ? (
                          <select
                            className="rec-status"
                            style={{ color: v ? recordTint(v) : undefined }}
                            value={v}
                            onChange={(e) => set(f.key, e.target.value)}
                          >
                            <option value="">—</option>
                            {statuses.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        ) : f.kind === 'url' ? (
                          <div className="rec-url">
                            <BufferedInput className="rec-cell rec-cell-url" value={v} onCommit={(nv) => set(f.key, nv)} placeholder="—" />
                            {v && (
                              <a className="rec-url-go" href={`https://${v.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" title="Open">↗</a>
                            )}
                          </div>
                        ) : (
                          <BufferedInput className="rec-cell" value={v} onCommit={(nv) => set(f.key, nv)} placeholder="—" />
                        )}
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <SheetTabs />
      </div>
    </div>
  )
}
