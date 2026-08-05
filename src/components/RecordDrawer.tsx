import { Fragment, useRef, useState, type ReactNode } from 'react'
import { optionsAreSentences, recordTint, type RecordField } from '../domain/records'
import { makeObjectReference, type ObjectReference } from '../domain/objectReference'
import { DOC_ACCEPT, readCardDoc } from '../lib/cardDoc'
import { BufferedInput, BufferedTextarea } from './BufferedInput'

/** Split a colors field value ("#FAF, #3EC") into individual swatches. */
const parseColors = (v: string): string[] => v.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)

/**
 * THE DOCUMENT A RECORD IS, shown where the record is edited.
 *
 * A .md handed to a card on the canvas is written onto the object the card names, so it is true of
 * that object on every campaign. That is only an honest claim if the object visibly holds it: a
 * document you can attach in one place and cannot find, replace or remove in the other is a fact
 * about your library that your library will not show you.
 *
 * NOT A FIELD, which is why it renders here rather than through the fields loop. A brief runs to
 * thousands of words, and a record's fields are a stack of one-line inputs and a spreadsheet of
 * cells; putting it through either would give every row a wall of prose where the line that tells
 * them apart should be. It is shown as stored, marks and all, for the reason the canvas panel
 * states: this is character-for-character what the copy writer receives.
 */
function RecordDocument({
  reference,
  onChange,
}: {
  reference?: ObjectReference
  onChange: (ref: ObjectReference | undefined) => void
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const read = async (file: File) => {
    try {
      const doc = await readCardDoc(file)
      setNote(null)
      onChange(makeObjectReference(doc.name, doc.text, Date.now()))
    } catch (e) {
      setNote((e as Error)?.message ?? 'Could not read that file.')
    }
  }
  return (
    <>
      <div className="rd-group">Document</div>
      <div className="rd-doc">
        {reference ? (
          <>
            <div className="rd-doc-head">
              <span className="rd-doc-name">{reference.name}</span>
              <span className="rd-doc-size">
                {reference.text.length.toLocaleString()} characters
                {reference.truncated && <em className="rd-doc-cut"> · cut to fit the writer</em>}
              </span>
              <button className="rd-doc-x" onClick={() => onChange(undefined)} aria-label="Remove this document">
                ✕
              </button>
            </div>
            <div className="rd-doc-body">{reference.text}</div>
          </>
        ) : (
          <p className="rd-doc-empty">
            No document. Upload one and it becomes what the copy writer reads about this record,
            whole, on every campaign that uses it.
          </p>
        )}
        <button className="rd-doc-up" onClick={() => fileRef.current?.click()}>
          {reference ? 'Replace it' : 'Upload a .md'}
        </button>
        {note && <span className="rd-doc-note">{note}</span>}
        <input
          ref={fileRef}
          type="file"
          accept={DOC_ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            // Reset first: picking the same file twice in a row fires no change event otherwise.
            e.target.value = ''
            if (f) void read(f)
          }}
        />
      </div>
    </>
  )
}

/**
 * A record's detail panel — a right-side sheet showing every attribute of one record
 * (a superset of the table columns), each edited inline. Same store actions as the
 * table, so edits here and in the grid stay in sync. Generic over the record type.
 */
export function RecordDrawer<T extends { id: string }>({
  record,
  fields,
  statuses,
  fieldOptions,
  onUpdate,
  onDelete,
  onClose,
  related,
}: {
  record: T
  fields: RecordField[]
  statuses: string[]
  /** Options for `ref`-kind fields, keyed by field key (e.g. the brand's segment names). */
  fieldOptions?: Record<string, string[]>
  onUpdate: (id: string, patch: Partial<T>) => void
  onDelete: (id: string) => void
  onClose: () => void
  /** Related records surfaced at the bottom (e.g. the people at a company). */
  related?: ReactNode
}) {
  const val = (k: string) => ((record as Record<string, unknown>)[k] ?? '').toString()
  const set = (k: string, v: string) => onUpdate(record.id, { [k]: v } as Partial<T>)
  const name = val('name')

  return (
    <>
      <div className="rd-scrim" onClick={onClose} />
      <aside className="rd" role="dialog" aria-label={`${name} details`}>
        <header className="rd-head">
          <span className="rd-ava" style={{ background: recordTint(name) }}>
            {(name.trim()[0] || '?').toUpperCase()}
          </span>
          <BufferedInput className="rd-name" value={name} onCommit={(v) => set('name', v)} placeholder="Name" />
          <button className="rd-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="rd-fields">
          {fields
            .filter((f) => f.key !== 'name')
            .map((f, i, arr) => {
              const v = val(f.key)
              const showHeader = !!f.group && f.group !== (i > 0 ? arr[i - 1].group : undefined)
              const block = f.kind === 'multiline' || f.kind === 'colors'
              return (
                <Fragment key={f.key}>
                  {showHeader && <div className="rd-group">{f.group}</div>}
                <div className={`rd-field${block ? ' rd-field-block' : ''}`}>
                  <label className="rd-label">{f.label}</label>
                  {f.kind === 'multiline' ? (
                    <BufferedTextarea className="rd-input rd-textarea" value={v} onCommit={(nv) => set(f.key, nv)} rows={3} placeholder="Empty" />
                  ) : f.kind === 'colors' ? (
                    <div className="rd-colors">
                      {parseColors(v).length > 0 && (
                        <div className="rd-swatches">
                          {parseColors(v).map((c, j) => (
                            <span key={j} className="rd-swatch" style={{ background: c }} title={c} />
                          ))}
                        </div>
                      )}
                      <BufferedInput className="rd-input" value={v} onCommit={(nv) => set(f.key, nv)} placeholder="#FAF6F0, #3ECBA0" />
                    </div>
                  ) : f.kind === 'status' ? (
                    <select className="rd-input rd-select" style={{ color: v ? recordTint(v) : undefined }} value={v} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">—</option>
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : f.kind === 'ref' ? (
                    <select className="rd-input rd-select" style={{ color: v ? recordTint(v) : undefined }} value={v} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">—</option>
                      {(fieldOptions?.[f.key] ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                      {v && !(fieldOptions?.[f.key] ?? []).includes(v) && <option value={v}>{v}</option>}
                    </select>
                  ) : f.kind === 'url' ? (
                    <div className="rd-url">
                      <BufferedInput className="rd-input rd-cell-url" value={v} onCommit={(nv) => set(f.key, nv)} placeholder="Empty" />
                      {v && (
                        <a className="rd-url-go" href={`https://${v.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" title="Open">
                          ↗
                        </a>
                      )}
                    </div>
                  ) : f.options ? (
                    <select className={`rd-input rd-select${optionsAreSentences(f.options) ? ' as-written' : ''}`} style={{ color: v ? recordTint(v) : undefined }} value={v} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">—</option>
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                      {v && !f.options.includes(v) && <option value={v}>{v}</option>}
                    </select>
                  ) : (
                    <BufferedInput className="rd-input" value={v} onCommit={(nv) => set(f.key, nv)} placeholder="Empty" />
                  )}
                </div>
                </Fragment>
              )
            })}
          <RecordDocument
            reference={(record as { reference?: ObjectReference }).reference}
            /* The drawer is generic over every record type and only guarantees an `id`; `reference`
               is declared on each of the record types it is actually opened for, and on none of the
               few it is not. A cast is the honest shape of that: the alternative is a constraint
               forcing a document field onto types that have no use for one. */
            onChange={(ref) => onUpdate(record.id, { reference: ref } as unknown as Partial<T>)}
          />
          {related}
        </div>

        <footer className="rd-foot">
          <button
            className="rd-del"
            onClick={() => {
              onDelete(record.id)
              onClose()
            }}
          >
            Delete
          </button>
        </footer>
      </aside>
    </>
  )
}
