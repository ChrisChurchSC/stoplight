import { useEffect, useMemo, useState } from 'react'
import { audienceProfile, proofProfile, profileLabel } from '../domain/assetProfile'
import { newAudience } from '../domain/audiences'
import { newDescriptor } from '../domain/descriptors'
import { clientForCampaign } from '../domain/clients'
import { isApproved, newLibraryCta, type LibraryKind } from '../domain/library'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'

const STAGES = ['awareness', 'consideration', 'conversion', 'retention']
const HOOK_KINDS = ['Pain', 'Stat', 'Question', 'Curiosity']

/** A detailed add-form field. These components shape every asset's messaging, so the
 *  forms capture real depth — not just a label. The first field is the required one. */
interface Field {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'select'
  options?: string[]
  placeholder?: string
}
const FORMS: Record<LibraryKind, Field[]> = {
  audiences: [
    { key: 'name', label: 'Audience name', placeholder: 'e.g. Mid-market Ops lead' },
    { key: 'role', label: 'Role / title', placeholder: 'e.g. VP of Operations' },
    { key: 'angle', label: 'Message angle', type: 'textarea', placeholder: 'How the promise is framed for this buyer' },
    { key: 'pains', label: 'Key pains', type: 'textarea', placeholder: 'One per line' },
    { key: 'voice', label: 'Voice / tone', placeholder: 'Comma-separated, e.g. Precise, Plainspoken' },
  ],
  rtbs: [
    { key: 'label', label: 'Claim', placeholder: 'e.g. Live in a week' },
    { key: 'detail', label: 'Evidence / substantiation', type: 'textarea', placeholder: 'What backs the claim' },
    { key: 'metric', label: 'Metric', placeholder: 'e.g. 40% faster (optional)' },
    { key: 'source', label: 'Source', placeholder: 'e.g. Acme case study (optional)' },
  ],
  ctas: [
    { key: 'label', label: 'CTA label', placeholder: 'e.g. Book a demo' },
    { key: 'stage', label: 'Funnel stage', type: 'select', options: STAGES },
    { key: 'destination', label: 'Destination', placeholder: 'Where it goes, e.g. /demo' },
    { key: 'outcome', label: 'Outcome it drives', placeholder: 'e.g. Booked meeting' },
  ],
  subjects: [
    { key: 'text', label: 'Subject', placeholder: 'e.g. A faster way to ship' },
    { key: 'angle', label: 'Angle — why it lands now', type: 'textarea' },
    { key: 'outcome', label: 'Primary outcome', placeholder: 'What it drives toward' },
  ],
  hooks: [
    { key: 'text', label: 'Hook line', placeholder: 'e.g. Tired of slow tools?' },
    { key: 'kind', label: 'Type', type: 'select', options: HOOK_KINDS },
    { key: 'note', label: 'Note on use', type: 'textarea' },
  ],
  strategies: [
    { key: 'name', label: 'Strategy name' },
    { key: 'bestFor', label: 'Best for', type: 'textarea' },
    { key: 'sequence', label: 'Stage sequence', placeholder: 'e.g. Awareness → Consideration → Conversion' },
    { key: 'coreMetrics', label: 'Core metrics', placeholder: 'e.g. MQL→SQL rate, CAC' },
  ],
}

/**
 * The Messaging Library — a cross-project shelf of reusable building blocks
 * (CTAs, proof points, audiences, strategies). Author once, reuse on any project:
 * pull an audience (with its proof + voice) onto a client, or keep a proven CTA
 * and claim handy. Stored globally, separate from any one campaign.
 */

const TABS: { kind: LibraryKind; label: string }[] = [
  { kind: 'audiences', label: 'Audiences' },
  { kind: 'rtbs', label: 'Proof points' },
  { kind: 'ctas', label: 'CTAs' },
  { kind: 'subjects', label: 'Subjects' },
  { kind: 'hooks', label: 'Hooks' },
  { kind: 'strategies', label: 'Strategies' },
]

export function LibraryPage({ inline = false }: { inline?: boolean } = {}) {
  const library = useTrafficStore((s) => s.library)
  const addLibraryItem = useTrafficStore((s) => s.addLibraryItem)
  const removeLibraryItem = useTrafficStore((s) => s.removeLibraryItem)
  const approveLibraryItem = useTrafficStore((s) => s.approveLibraryItem)
  const editLibrarySubject = useTrafficStore((s) => s.editLibrarySubject)
  const editLibraryHook = useTrafficStore((s) => s.editLibraryHook)
  const useLibraryAudience = useTrafficStore((s) => s.useLibraryAudience)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const rows = useTrafficStore((s) => s.rows)
  const setPage = useTrafficStore((s) => s.setPage)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const messagingBrand = useTrafficStore((s) => s.messagingBrand)
  const setMessagingBrand = useTrafficStore((s) => s.setMessagingBrand)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const openOnboard = useTrafficStore((s) => s.openOnboard)
  const { brands } = useHomeCanvases()

  // The Messaging page views one brand's system. Default to the brand you're in
  // (or the first brand) whenever the current selection isn't a real brand.
  useEffect(() => {
    if (inline) return // the brand folder owns the brand when embedded
    const names = brands.map((b) => b.name)
    if (messagingBrand && names.includes(messagingBrand)) return
    const fallback =
      clientFilter !== 'all' && names.includes(clientFilter) ? clientFilter : names[0] ?? ''
    if (fallback && fallback !== messagingBrand) setMessagingBrand(fallback)
  }, [brands, messagingBrand, clientFilter, setMessagingBrand, inline])

  const [tab, setTab] = useState<LibraryKind>('audiences')

  // Known clients you can pull a library audience onto.
  const clients = useMemo(() => {
    const set = new Set<string>([
      ...Object.keys(clientProfiles ?? {}),
      ...Object.keys(clientAudiences ?? {}),
      ...rows.map((r) => clientForCampaign(r.campaign)).filter(Boolean),
    ])
    return [...set].filter(Boolean).sort()
  }, [clientProfiles, clientAudiences, rows])

  // The detailed add form — a field bag keyed by the FORMS config for the active tab.
  const [form, setForm] = useState<Record<string, string>>({})
  const reset = () => setForm({})
  const setField = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))
  const fv = (k: string) => (form[k] ?? '').trim()
  // The first field of each form is the required one (the component's headline).
  const requiredKey = FORMS[tab][0].key
  const canAdd = fv(requiredKey).length > 0
  // Inline editing of a Subject / Hook master (propagation lives on Subjects).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [propagateNote, setPropagateNote] = useState('')
  const startEdit = (id: string, text: string) => {
    setPropagateNote('')
    setEditingId(id)
    setEditVal(text)
  }
  const commitEdit = () => {
    if (!editingId) return
    if (tab === 'subjects') {
      const n = editLibrarySubject(editingId, editVal)
      setPropagateNote(n > 0 ? `Updated ${n} campaign${n === 1 ? '' : 's'} using this subject` : '')
    } else if (tab === 'hooks') {
      editLibraryHook(editingId, editVal)
    }
    setEditingId(null)
  }

  const add = () => {
    if (!canAdd) return
    const id36 = Date.now().toString(36)
    const opt = (k: string) => fv(k) || undefined
    // Authored here → an unvetted draft until approved (keeps the system curated).
    if (tab === 'ctas') {
      addLibraryItem('ctas', newLibraryCta({ label: fv('label'), stage: form.stage || 'awareness', destination: opt('destination'), outcome: opt('outcome'), approved: false }))
    } else if (tab === 'rtbs') {
      addLibraryItem('rtbs', { id: `lrtb_${id36}`, label: fv('label'), detail: fv('detail'), metric: opt('metric'), source: opt('source'), approved: false })
    } else if (tab === 'audiences') {
      addLibraryItem('audiences', newAudience({
        name: fv('name'),
        role: fv('role'),
        messageAngle: fv('angle'),
        pains: fv('pains') ? fv('pains').split('\n').map((s) => s.trim()).filter(Boolean) : [],
        descriptors: fv('voice') ? fv('voice').split(',').map((s) => s.trim()).filter(Boolean).map((label) => newDescriptor({ label })) : [],
        approved: false,
      }))
    } else if (tab === 'subjects') {
      addLibraryItem('subjects', { id: `subj_${id36}`, text: fv('text'), angle: opt('angle'), outcome: opt('outcome'), approved: false })
    } else if (tab === 'hooks') {
      addLibraryItem('hooks', { id: `hook_${id36}`, text: fv('text'), kind: form.kind || 'Pain', note: opt('note'), approved: false })
    } else if (tab === 'strategies') {
      addLibraryItem('strategies', { key: `strat_${id36}`, name: fv('name'), sequence: fv('sequence'), bestFor: fv('bestFor'), coreMetrics: fv('coreMetrics'), mediaContent: '' })
    }
    reset()
  }

  return (
    <div className={`library${inline ? ' library-inline' : ''}`}>
      {/* The page chrome (title + brand picker) is hidden when embedded inside a
          brand folder — the folder already shows which brand you're in. */}
      {!inline && (
        <>
          <div className="library-head">
            <div>
              <h1 className="library-title">Messaging System</h1>
              <p className="library-sub">
                Each brand has its own messaging system — audiences, proof, subjects, hooks, CTAs, strategies. Pick a
                brand to build its system; it's the context the brand's canvases pull from.
              </p>
            </div>
          </div>

          {/* Brand picker — one messaging system per brand. */}
          <div className="msys-bar">
            {brands.map((b) => (
              <button
                key={b.name}
                className={`msys-chip${messagingBrand === b.name ? ' active' : ''}`}
                onClick={() => setMessagingBrand(b.name)}
              >
                ▤ {b.name}
              </button>
            ))}
            <button className="msys-new" onClick={openOnboard}>
              ＋ Add brand
            </button>
          </div>
        </>
      )}

      {brands.length === 0 || !messagingBrand ? (
        <div className="home-empty">
          No brands yet.{' '}
          <button className="home-link" onClick={openOnboard}>
            Add a brand
          </button>{' '}
          to build its messaging system.
        </div>
      ) : (
      <>
      <div className="library-tabs">
        {TABS.map((t) => (
          <button
            key={t.kind}
            className={`library-tab${tab === t.kind ? ' active' : ''}`}
            onClick={() => {
              setTab(t.kind)
              reset()
            }}
          >
            {t.label}
            <span className="library-tab-count">{library[t.kind].length}</span>
          </button>
        ))}
      </div>

      {/* Detailed add form — these components shape every asset's messaging, so each
          captures real depth, not just a label. */}
      <div className="library-add">
        {FORMS[tab].map((f) => (
          <label className="library-field" key={f.key}>
            <span className="library-field-label">{f.label}</span>
            {f.type === 'textarea' ? (
              <textarea
                className="library-input"
                rows={2}
                placeholder={f.placeholder}
                value={form[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
              />
            ) : f.type === 'select' ? (
              <select
                className="library-input"
                value={form[f.key] ?? f.options![0]}
                onChange={(e) => setField(f.key, e.target.value)}
              >
                {f.options!.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="library-input"
                placeholder={f.placeholder}
                value={form[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
              />
            )}
          </label>
        ))}
        <button className="btn primary sm library-add-btn" onClick={add} disabled={!canAdd}>
          ＋ Add {TABS.find((t) => t.kind === tab)?.label.replace(/s$/, '').toLowerCase()}
        </button>
      </div>

      {/* Propagation result — shown after editing a Subject master ripples to its
          campaigns (master→instance). */}
      {tab === 'subjects' && propagateNote && <div className="library-propagate">↳ {propagateNote}</div>}

      {/* List */}
      <div className="library-list">
        {tab === 'audiences' &&
          library.audiences.map((a) => (
            <div className="library-item" key={a.id}>
              <div className="library-item-main">
                <div className="library-item-title">
                  {a.name || 'Untitled audience'}
                  {!isApproved(a) && <span className="library-draft">Draft</span>}
                </div>
                <div className="library-item-sub">
                  {a.role || '—'}
                  {a.messageAngle ? ` · “${a.messageAngle}”` : ''}
                </div>
                <div className="library-item-tags">
                  <span className="library-pill">◆ {a.rtbs.length} proof</span>
                  <span className="library-pill">♪ {a.descriptors.length} voice</span>
                </div>
                {(() => {
                  const p = audienceProfile(a.name, rows)
                  return <div className={`library-prof c-${p.confidence}`}>{profileLabel(p, 'on')}</div>
                })()}
              </div>
              <div className="library-item-actions">
                {!isApproved(a) && (
                  <button className="library-approve" title="Approve as a library master" onClick={() => approveLibraryItem('audiences', a.id)}>
                    ✓ Approve
                  </button>
                )}
                <select
                  className="library-input library-use"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      useLibraryAudience(e.target.value, a.id)
                      setPage('clients')
                      setClientFilter(e.target.value)
                    }
                  }}
                >
                  <option value="">Use on…</option>
                  {clients.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button className="library-del" title="Remove" onClick={() => removeLibraryItem('audiences', a.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))}

        {tab === 'rtbs' &&
          library.rtbs.map((r) => (
            <div className="library-item" key={r.id}>
              <div className="library-item-main">
                <div className="library-item-title">
                  ◆ {r.label}
                  {!isApproved(r) && <span className="library-draft">Draft</span>}
                </div>
                <div className="library-item-sub">{r.detail || '—'}</div>
                {(r.metric || r.source) && (
                  <div className="library-item-tags">
                    {r.metric && <span className="library-pill">📊 {r.metric}</span>}
                    {r.source && <span className="library-pill">↳ {r.source}</span>}
                  </div>
                )}
                {(() => {
                  const p = proofProfile(r.id, rows)
                  return <div className={`library-prof c-${p.confidence}`}>{profileLabel(p)}</div>
                })()}
              </div>
              <div className="library-item-actions">
                {!isApproved(r) && (
                  <button className="library-approve" title="Approve as a library master" onClick={() => approveLibraryItem('rtbs', r.id)}>
                    ✓ Approve
                  </button>
                )}
                <button className="library-del" title="Remove" onClick={() => removeLibraryItem('rtbs', r.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))}

        {tab === 'ctas' &&
          library.ctas.map((c) => (
            <div className="library-item" key={c.id}>
              <div className="library-item-main">
                <div className="library-item-title">
                  ↗ {c.label}
                  {!isApproved(c) && <span className="library-draft">Draft</span>}
                </div>
                {(c.destination || c.outcome) && (
                  <div className="library-item-sub">
                    {c.destination ? `→ ${c.destination}` : ''}
                    {c.destination && c.outcome ? ' · ' : ''}
                    {c.outcome ? `drives ${c.outcome}` : ''}
                  </div>
                )}
                <div className="library-item-tags">
                  {c.stage && <span className="library-pill">{c.stage}</span>}
                </div>
              </div>
              <div className="library-item-actions">
                {!isApproved(c) && (
                  <button className="library-approve" title="Approve as a library master" onClick={() => approveLibraryItem('ctas', c.id)}>
                    ✓ Approve
                  </button>
                )}
                <button className="library-del" title="Remove" onClick={() => removeLibraryItem('ctas', c.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))}

        {tab === 'subjects' &&
          library.subjects.map((su) => (
            <div className="library-item" key={su.id}>
              <div className="library-item-main">
                <div className="library-item-title">
                  {editingId === su.id ? (
                    <input
                      className="library-input library-edit"
                      autoFocus
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={commitEdit}
                    />
                  ) : (
                    <>
                      ✦ {su.text}
                      {!isApproved(su) && <span className="library-draft">Draft</span>}
                    </>
                  )}
                </div>
                <div className="library-item-sub">
                  {editingId === su.id
                    ? 'Editing the master updates every campaign using it.'
                    : su.angle || su.note || '—'}
                </div>
                {editingId !== su.id && su.outcome && (
                  <div className="library-item-tags">
                    <span className="library-pill">drives {su.outcome}</span>
                  </div>
                )}
              </div>
              <div className="library-item-actions">
                {editingId !== su.id && (
                  <button className="library-edit-btn" title="Edit the master — propagates to its campaigns" onClick={() => startEdit(su.id, su.text)}>
                    ✎ Edit
                  </button>
                )}
                {!isApproved(su) && (
                  <button className="library-approve" title="Approve as a library master" onClick={() => approveLibraryItem('subjects', su.id)}>
                    ✓ Approve
                  </button>
                )}
                <button className="library-del" title="Remove" onClick={() => removeLibraryItem('subjects', su.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))}

        {tab === 'hooks' &&
          library.hooks.map((h) => (
            <div className="library-item" key={h.id}>
              <div className="library-item-main">
                <div className="library-item-title">
                  {editingId === h.id ? (
                    <input
                      className="library-input library-edit"
                      autoFocus
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={commitEdit}
                    />
                  ) : (
                    <>
                      ❝ {h.text}
                      {!isApproved(h) && <span className="library-draft">Draft</span>}
                    </>
                  )}
                </div>
                {h.note && editingId !== h.id && <div className="library-item-sub">{h.note}</div>}
                {h.kind && editingId !== h.id && (
                  <div className="library-item-tags">
                    <span className="library-pill">{h.kind}</span>
                  </div>
                )}
              </div>
              <div className="library-item-actions">
                {editingId !== h.id && (
                  <button className="library-edit-btn" title="Edit this hook" onClick={() => startEdit(h.id, h.text)}>
                    ✎ Edit
                  </button>
                )}
                {!isApproved(h) && (
                  <button className="library-approve" title="Approve as a library master" onClick={() => approveLibraryItem('hooks', h.id)}>
                    ✓ Approve
                  </button>
                )}
                <button className="library-del" title="Remove" onClick={() => removeLibraryItem('hooks', h.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))}

        {tab === 'strategies' &&
          library.strategies.map((s) => (
            <div className="library-item" key={s.key}>
              <div className="library-item-main">
                <div className="library-item-title">{s.name}</div>
                <div className="library-item-sub">
                  {s.bestFor || s.sequence || '—'}
                </div>
                {s.coreMetrics && <div className="library-item-tags"><span className="library-pill">{s.coreMetrics}</span></div>}
              </div>
              <button className="library-del" title="Remove" onClick={() => removeLibraryItem('strategies', s.key)}>
                ✕
              </button>
            </div>
          ))}
      </div>
      </>
      )}
    </div>
  )
}
