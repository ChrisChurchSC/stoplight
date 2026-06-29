import { useMemo, useState } from 'react'
import { audienceProfile, proofProfile, profileLabel } from '../domain/assetProfile'
import { newAudience } from '../domain/audiences'
import { clientForCampaign } from '../domain/clients'
import { isApproved, newLibraryCta, type LibraryKind } from '../domain/library'
import { useTrafficStore } from '../store/useTrafficStore'

/** Add-form field placeholders per library kind (keeps the markup out of a deep
 *  nested ternary). f2 is the optional second field; '' hides it (CTAs use a select). */
const PLACEHOLDERS: Record<LibraryKind, { f1: string; f2: string }> = {
  audiences: { f1: 'Audience name (e.g. Mid-market Ops lead)', f2: 'Role (optional)' },
  rtbs: { f1: 'Proof point (e.g. Live in a week)', f2: 'Detail / substantiation' },
  ctas: { f1: 'CTA (e.g. Book a demo)', f2: '' },
  subjects: { f1: "Subject (e.g. A faster way to ship)", f2: 'Note (optional)' },
  hooks: { f1: 'Hook (e.g. Tired of slow tools?)', f2: 'Note (optional)' },
  strategies: { f1: 'Strategy name', f2: 'Best for…' },
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

const STAGES = ['awareness', 'consideration', 'conversion', 'retention']

export function LibraryPage() {
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

  // Inline add-form fields (one set, reused per tab).
  const [f1, setF1] = useState('')
  const [f2, setF2] = useState('')
  const [stage, setStage] = useState('awareness')
  const reset = () => {
    setF1('')
    setF2('')
  }
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
    const a = f1.trim()
    if (!a) return
    // Authored here → an unvetted draft until approved (keeps the library curated).
    if (tab === 'ctas') addLibraryItem('ctas', newLibraryCta({ label: a, stage, approved: false }))
    else if (tab === 'rtbs') addLibraryItem('rtbs', { id: `lrtb_${Date.now().toString(36)}`, label: a, detail: f2.trim(), approved: false })
    else if (tab === 'audiences') addLibraryItem('audiences', newAudience({ name: a, role: f2.trim(), approved: false }))
    else if (tab === 'subjects') addLibraryItem('subjects', { id: `subj_${Date.now().toString(36)}`, text: a, note: f2.trim(), approved: false })
    else if (tab === 'hooks') addLibraryItem('hooks', { id: `hook_${Date.now().toString(36)}`, text: a, note: f2.trim(), approved: false })
    else if (tab === 'strategies')
      addLibraryItem('strategies', {
        key: `strat_${Date.now().toString(36)}`,
        name: a,
        sequence: '',
        bestFor: f2.trim(),
        coreMetrics: '',
        mediaContent: '',
      })
    reset()
  }

  return (
    <div className="library">
      <div className="library-head">
        <div>
          <button
            className="library-back"
            onClick={() => {
              setPage('clients')
              setClientFilter('all')
            }}
          >
            ← Clients
          </button>
          <h1 className="library-title">Messaging Library</h1>
          <p className="library-sub">
            Reusable building blocks shared across every project — author once, pull onto any client or campaign.
          </p>
        </div>
      </div>

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

      {/* Add row */}
      <div className="library-add">
        <input
          className="library-input"
          placeholder={PLACEHOLDERS[tab].f1}
          value={f1}
          onChange={(e) => setF1(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        {tab === 'ctas' ? (
          <select className="library-input library-stage" value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="library-input"
            placeholder={PLACEHOLDERS[tab].f2}
            value={f2}
            onChange={(e) => setF2(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
        )}
        <button className="btn primary sm" onClick={add} disabled={!f1.trim()}>
          ＋ Add
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
                {c.stage && <div className="library-item-sub">{c.stage}</div>}
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
                  {editingId === su.id ? 'Editing the master updates every campaign using it.' : su.note || '—'}
                </div>
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
    </div>
  )
}
