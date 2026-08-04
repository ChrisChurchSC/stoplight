// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SaveTrouble } from '../workspaceState'

/**
 * THE BUG THIS EXISTS FOR: a workspace write that failed was reported as a write that succeeded.
 *
 * persistState mirrors to Supabase with `await client.from('workspace_state').upsert(…)`, and
 * postgrest-js resolves with { error } instead of rejecting unless shouldThrowOnError is set — it
 * isn't anywhere in this app. So an RLS denial, an expired JWT or an oversized payload all came
 * back looking exactly like success, the pending write was marked delivered, and the value was
 * dropped. localStorage had already been written, so the device that made the change reloaded from
 * its own copy and looked completely healthy. The only symptom, ever, was opening the app in
 * another browser and finding the campaigns you started weren't there.
 *
 * These tests drive the mirror against a server that says no, and assert the two things that were
 * false before: the failure is reported, and the value is still pending rather than discarded.
 */

const upsert = vi.fn()
const getActiveWorkspaceId = vi.fn()

vi.mock('../../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => ({ upsert }) },
}))
vi.mock('../../../lib/session', () => ({
  getActiveWorkspaceId: () => getActiveWorkspaceId(),
}))

// Module-level state (the pending map, the listener set) has to start clean per test, so the module
// is re-imported each time rather than shared across them.
const load = async () => {
  vi.resetModules()
  return import('../workspaceState')
}

beforeEach(() => {
  vi.useFakeTimers()
  upsert.mockReset()
  getActiveWorkspaceId.mockReset()
  getActiveWorkspaceId.mockResolvedValue('ws-1')
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('persistState mirroring', () => {
  it('reports a rejected write instead of counting it as saved', async () => {
    const { persistState, flushPersistedState, onSaveTrouble } = await load()
    upsert.mockResolvedValue({ error: { message: 'permission denied for table workspace_state' } })

    let trouble: SaveTrouble | null = null
    onSaveTrouble((t) => {
      trouble = t
    })

    persistState('stoplight.campaigns.v1', [{ name: 'Launch' }])
    await flushPersistedState()

    expect(trouble).not.toBeNull()
    expect(trouble!.message).toContain('permission denied')
    expect(trouble!.keys).toEqual(['stoplight.campaigns.v1'])
    expect(trouble!.signedOut).toBe(false)
  })

  it('keeps the value pending so a retry re-sends it', async () => {
    const { persistState, flushPersistedState, retryPersistedState, saveTrouble } = await load()
    upsert.mockResolvedValue({ error: { message: 'permission denied' } })

    persistState('stoplight.campaigns.v1', [{ name: 'Launch' }])
    await flushPersistedState()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(saveTrouble()).not.toBeNull()

    // The write that failed was NOT discarded: once the server accepts it, the same value goes up.
    upsert.mockResolvedValue({ error: null })
    await retryPersistedState()

    expect(upsert).toHaveBeenCalledTimes(2)
    expect(upsert.mock.calls[1][0]).toMatchObject({
      workspace_id: 'ws-1',
      key: 'stoplight.campaigns.v1',
      value: [{ name: 'Launch' }],
    })
    expect(saveTrouble()).toBeNull()
  })

  it('says so when there is no workspace to save into', async () => {
    const { persistState, flushPersistedState, saveTrouble } = await load()
    getActiveWorkspaceId.mockResolvedValue(null)

    persistState('stoplight.campaigns.v1', [{ name: 'Launch' }])
    await flushPersistedState()

    expect(upsert).not.toHaveBeenCalled()
    expect(saveTrouble()?.signedOut).toBe(true)
  })

  it('reports nothing when the write lands, and writes localStorage either way', async () => {
    const { persistState, flushPersistedState, saveTrouble } = await load()
    upsert.mockResolvedValue({ error: null })

    persistState('stoplight.campaigns.v1', [{ name: 'Launch' }])
    // The local copy is synchronous and unconditional — it's what a reload reads, which is exactly
    // why a failed mirror is invisible without the reporting above.
    expect(JSON.parse(localStorage.getItem('stoplight.campaigns.v1')!)).toEqual([{ name: 'Launch' }])

    await flushPersistedState()

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(saveTrouble()).toBeNull()
  })

  it('retries a failed write on its own, backing off', async () => {
    const { persistState, flushPersistedState, saveTrouble } = await load()
    upsert.mockResolvedValue({ error: { message: 'network error' } })

    persistState('stoplight.campaigns.v1', [{ name: 'Launch' }])
    await flushPersistedState()
    expect(upsert).toHaveBeenCalledTimes(1)

    // First retry is a second out; the wait doubles from there.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(upsert).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(upsert).toHaveBeenCalledTimes(3)

    // Still failing, so still reported — the banner stays up rather than the work looking saved.
    expect(saveTrouble()).not.toBeNull()
  })
})
