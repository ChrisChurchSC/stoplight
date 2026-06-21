import { useState } from 'react'
import { can } from '../domain/access'
import { useTrafficStore } from '../store/useTrafficStore'

function timeAgo(ts: number, now: number): string {
  const m = Math.round((now - ts) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/**
 * Campaign version history. Save points for a client's copy, attributed to the
 * collaborator who saved them, with a diff summary. Restoring writes a snapshot's
 * copy back to the assets. Editors and the owner can save and restore;
 * stakeholders see the timeline read-only.
 */
export function VersionHistory() {
  const open = useTrafficStore((s) => s.historyOpen)
  const close = useTrafficStore((s) => s.closeHistory)
  const client = useTrafficStore((s) => s.clientFilter)
  const versions = useTrafficStore((s) => s.versions)
  const saveVersion = useTrafficStore((s) => s.saveVersion)
  const restoreVersion = useTrafficStore((s) => s.restoreVersion)
  const role = useTrafficStore((s) => s.role)

  const [label, setLabel] = useState('')
  const [restoring, setRestoring] = useState<string | null>(null)

  if (!open) return null
  const canEdit = can(role, 'edit')
  const list = versions.filter((v) => v.client === client)
  const now = Date.now()

  const save = () => {
    saveVersion(label)
    setLabel('')
  }
  const restore = async (id: string) => {
    setRestoring(id)
    await restoreVersion(id)
    setRestoring(null)
  }

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <aside className="drawer vh-drawer">
        <div className="drawer-head">
          <strong>Version history</strong>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={close}>
            ✕
          </button>
        </div>

        {canEdit && (
          <div className="vh-save">
            <input
              className="vh-label"
              value={label}
              placeholder="Name this version (optional)…"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <button className="btn sm primary" onClick={save}>
              Save version
            </button>
          </div>
        )}

        <div className="drawer-body">
          {list.length === 0 ? (
            <div className="copy-hint" style={{ textAlign: 'center', padding: '24px 0' }}>
              No versions yet. Save one to checkpoint this campaign's copy.
            </div>
          ) : (
            list.map((v, i) => (
              <div key={v.id} className="vh-item">
                <div className="vh-item-head">
                  <span className="vh-item-label">{v.label}</span>
                  {i === 0 && <span className="vh-latest">latest</span>}
                </div>
                {v.summary !== v.label && <div className="vh-item-sub">{v.summary}</div>}
                <div className="vh-item-foot">
                  <span className="vh-meta">
                    {v.author} · {timeAgo(v.ts, now)} · {v.rows.length} asset{v.rows.length === 1 ? '' : 's'}
                  </span>
                  <span className="spacer" />
                  {canEdit && (
                    <button className="btn ghost sm" disabled={restoring === v.id} onClick={() => restore(v.id)}>
                      {restoring === v.id ? 'Restoring…' : '↩ Restore'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          <div className="drawer-foot-spacer" />
        </div>
      </aside>
    </>
  )
}
