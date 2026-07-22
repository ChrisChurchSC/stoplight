import { Fragment, useRef, useState } from 'react'
import type { BrandRecord } from '../domain/brandRecord'
import { recordTint, type RecordField } from '../domain/records'
import { imageToDataUrl } from '../lib/image'
import { BufferedInput, BufferedTextarea } from './BufferedInput'
import { RecordsChat } from './RecordsChat'

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
  onUpdate,
  onDelete,
  deleteNote,
}: {
  brand: BrandRecord
  fields: RecordField[]
  statuses: string[]
  onUpdate: (id: string, patch: Partial<BrandRecord>) => void
  onDelete?: (id: string) => void
  /** Spells out what else the delete takes with it, e.g. "3 campaigns and 24 assets". */
  deleteNote?: string
}) {
  const val = (k: string) => ((brand as unknown as Record<string, unknown>)[k] ?? '').toString()
  const set = (k: string, v: string) => onUpdate(brand.id, { [k]: v } as Partial<BrandRecord>)
  const name = val('name')
  const pfp = val('pfp')
  const [pfpHover, setPfpHover] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const nameWrapRef = useRef<HTMLSpanElement>(null)

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
            <span
              onMouseEnter={() => setPfpHover(true)}
              onMouseLeave={() => setPfpHover(false)}
              style={{ position: 'relative', flex: '0 0 auto', display: 'inline-flex' }}
            >
              <label
                title={pfp ? 'Change profile picture' : 'Add a profile picture'}
                style={{ position: 'relative', width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', display: 'grid', placeItems: 'center', cursor: 'pointer', background: pfp ? 'var(--surface)' : recordTint(name || '?'), color: '#fff', fontWeight: 700, fontSize: 20, border: '1px solid var(--border)' }}
              >
                {pfp
                  ? <img src={pfp} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (name.trim()[0] ?? '?').toUpperCase()}
                {/* Camera overlay on hover — implies the avatar is clickable to change the picture. */}
                <span
                  aria-hidden="true"
                  style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,24,40,.5)', color: '#fff', opacity: pfpHover ? 1 : 0, transition: 'opacity .12s', pointerEvents: 'none' }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                </span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void imageToDataUrl(f).then((url) => set('pfp', url)).catch(() => {}); e.currentTarget.value = '' }}
                />
              </label>
              {/* Little × to delete the picture — appears on hover only when one is set. */}
              {pfp && pfpHover && (
                <button
                  type="button"
                  title="Remove picture"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); set('pfp', '') }}
                  style={{ position: 'absolute', top: -5, right: -5, width: 17, height: 17, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 10, lineHeight: 1, padding: 0, boxShadow: '0 1px 3px rgba(16,24,40,.25)', zIndex: 2 }}
                >
                  ✕
                </button>
              )}
            </span>
            <span ref={nameWrapRef} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <BufferedInput className="brand-title-name" value={name} onCommit={(v) => set('name', v)} placeholder="Brand name" />
              <button
                type="button"
                title="Edit name"
                onClick={() => nameWrapRef.current?.querySelector<HTMLInputElement>('input.brand-title-name')?.focus()}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-faint, #8a969b)', display: 'grid', placeItems: 'center', padding: 2, flex: '0 0 auto' }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </span>
            {/* Delete the brand — right-aligned, two-step confirm so it isn't a one-click mistake. */}
            {onDelete && (
              <span style={{ marginLeft: 'auto', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {confirmDelete ? (
                  <>
                    <span style={{ fontSize: 13, color: 'var(--text-muted, #5a6b72)' }}>
                      Delete this brand{deleteNote ? `, and ${deleteNote}` : ''}?
                    </span>
                    <button
                      type="button"
                      onClick={() => onDelete(brand.id)}
                      style={{ border: 'none', borderRadius: 7, cursor: 'pointer', background: 'var(--danger, #d64545)', color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '5px 11px' }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      style={{ border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, fontSize: 12.5, padding: '5px 11px' }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    title="Delete brand"
                    onClick={() => setConfirmDelete(true)}
                    style={{ border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text-muted, #5a6b72)', display: 'grid', placeItems: 'center', padding: 6, borderRadius: 8, flex: '0 0 auto' }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                )}
              </span>
            )}
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
                        ) : f.options ? (
                          <select className="rec-status" value={v} onChange={(e) => set(f.key, e.target.value)}>
                            <option value="">—</option>
                            {v && !f.options.includes(v) && <option value={v}>{v}</option>}
                            {f.options.map((o) => (
                              <option key={o} value={o}>{o}</option>
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
      </div>
    </div>
  )
}
