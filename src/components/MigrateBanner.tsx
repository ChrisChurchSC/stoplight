import { useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * A one-time prompt shown after sign-in when a user still has localStorage data from before the
 * backend was connected. Clicking Import pushes it into their Supabase workspace (see
 * migrateLocalToSupabase). Only appears when a backend is configured, there's local data, and the
 * import hasn't already run.
 */
const MIGRATED_KEY = 'stoplight.migrated.v1'

const hasLocalData = (): boolean => {
  try {
    for (const k of ['stoplight.companies.v1', 'stoplight.campaigns.v1', 'stoplight.sheet.v1', 'stoplight.tasks.v1', 'stoplight.libraryFolders.v1']) {
      const raw = localStorage.getItem(k)
      if (raw) {
        const v = JSON.parse(raw)
        if (Array.isArray(v) && v.length) return true
      }
    }
  } catch {
    /* ignore */
  }
  return false
}

export function MigrateBanner() {
  const migrate = useTrafficStore((s) => s.migrateLocalToSupabase)
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>(() =>
    isSupabaseConfigured && !localStorage.getItem(MIGRATED_KEY) && hasLocalData() ? 'idle' : 'done',
  )
  const [err, setErr] = useState('')

  if (state === 'done') return null

  const run = async () => {
    setState('busy')
    const r = await migrate()
    if (r.ok) setState('done')
    else {
      setErr(r.error ?? 'Import failed')
      setState('err')
    }
  }
  const dismiss = () => {
    try {
      localStorage.setItem(MIGRATED_KEY, '1')
    } catch {
      /* ignore */
    }
    setState('done')
  }

  return (
    <div className="migrate-banner">
      <span className="migrate-banner-text">
        {state === 'err'
          ? `Import failed: ${err}`
          : 'You have work saved on this device from before the backend was connected. Import it into this workspace?'}
      </span>
      <span className="migrate-banner-actions">
        <button className="migrate-dismiss" onClick={dismiss}>Not now</button>
        <button className="migrate-go" disabled={state === 'busy'} onClick={run}>
          {state === 'busy' ? 'Importing…' : state === 'err' ? 'Retry' : 'Import my data'}
        </button>
      </span>
    </div>
  )
}
