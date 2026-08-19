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

/**
 * The mirror is a CONDITIONAL write, so the mock has to model the chain rather than one call:
 * `.update(patch).eq().eq().eq().select()` for a key this tab has seen, `.insert(row).select()` for
 * one it has not. Both resolve to postgrest's `{ data, error }`.
 *
 * `insert` stands in for the old `upsert` in the tests below: a fresh module has an empty `seen`
 * map, so the first write of any key is always the insert branch.
 */
const insert = vi.fn()
const select = vi.fn()
const update = vi.fn()
/** The `.eq(…)` filters the update chain collected, so a test can assert the precondition sent. */
let updateFilters: Array<[string, unknown]> = []
const getActiveWorkspaceId = vi.fn()

const selectable = (fn: ReturnType<typeof vi.fn>, args: unknown[]) => ({
  select: () => fn(...args),
})

vi.mock('../../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      insert: (row: unknown) => selectable(insert, [row]),
      select: () => ({ eq: () => select() }),
      update: (patch: unknown) => {
        updateFilters = []
        const chain = {
          eq: (col: string, val: unknown) => {
            updateFilters.push([col, val])
            return chain
          },
          select: () => update(patch, updateFilters),
        }
        return chain
      },
    }),
  },
}))
vi.mock('../../../lib/session', () => ({
  getActiveWorkspaceId: () => getActiveWorkspaceId(),
}))

// Module-level state (the pending map, the listener set) has to start clean per test, so the module
// is re-imported each time rather than shared across them.
const T1 = '2026-08-19T00:00:00.000Z'
const T2 = '2026-08-19T01:00:00.000Z'

const load = async () => {
  vi.resetModules()
  return import('../workspaceState')
}

beforeEach(() => {
  vi.useFakeTimers()
  insert.mockReset()
  select.mockReset()
  select.mockResolvedValue({ data: [], error: null })
  update.mockReset()
  updateFilters = []
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
    insert.mockResolvedValue({ data: null, error: { message: 'permission denied for table workspace_state' } })

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
    insert.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    persistState('stoplight.campaigns.v1', [{ name: 'Launch' }])
    await flushPersistedState()
    expect(insert).toHaveBeenCalledTimes(1)
    expect(saveTrouble()).not.toBeNull()

    // The write that failed was NOT discarded: once the server accepts it, the same value goes up.
    insert.mockResolvedValue({ data: [{ updated_at: T1 }], error: null })
    await retryPersistedState()

    expect(insert).toHaveBeenCalledTimes(2)
    expect(insert.mock.calls[1][0]).toMatchObject({
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

    expect(insert).not.toHaveBeenCalled()
    expect(saveTrouble()?.signedOut).toBe(true)
  })

  it('reports nothing when the write lands, and writes localStorage either way', async () => {
    const { persistState, flushPersistedState, saveTrouble } = await load()
    insert.mockResolvedValue({ data: [{ updated_at: T1 }], error: null })

    persistState('stoplight.campaigns.v1', [{ name: 'Launch' }])
    // The local copy is synchronous and unconditional — it's what a reload reads, which is exactly
    // why a failed mirror is invisible without the reporting above.
    expect(JSON.parse(localStorage.getItem('stoplight.campaigns.v1')!)).toEqual([{ name: 'Launch' }])

    await flushPersistedState()

    expect(insert).toHaveBeenCalledTimes(1)
    expect(saveTrouble()).toBeNull()
  })

  it('retries a failed write on its own, backing off', async () => {
    const { persistState, flushPersistedState, saveTrouble } = await load()
    insert.mockResolvedValue({ data: null, error: { message: 'network error' } })

    persistState('stoplight.campaigns.v1', [{ name: 'Launch' }])
    await flushPersistedState()
    expect(insert).toHaveBeenCalledTimes(1)

    // First retry is a second out; the wait doubles from there.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(insert).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(insert).toHaveBeenCalledTimes(3)

    // Still failing, so still reported — the banner stays up rather than the work looking saved.
    expect(saveTrouble()).not.toBeNull()
  })
})

/**
 * THE BUG THIS SECOND SET EXISTS FOR, and it is a different bug from the one above.
 *
 * The mirror used to be a plain upsert: whatever this tab held became the row, unconditionally. So
 * a tab open across a change made anywhere else — another tab, another device, a migration run
 * straight against the database — would overwrite that change the next time anything in it moved,
 * and report success.
 *
 * On 18 August 2026 that cost 39 campaigns and a restored task list, twenty minutes apart, from a
 * tab whose only sin was having been open. Nothing errored. The only symptom was a number going
 * down.
 *
 * So the write now carries the updated_at this tab last saw, and the server refuses it if the row
 * has moved on. These tests assert the refusal happens, that it is NOT retried (retrying can only
 * succeed by dropping the precondition, which is the whole behaviour being prevented), and that a
 * re-hydrate is what lets the tab write again.
 */
describe('a stale tab cannot overwrite a newer value', () => {
  it('sends the last-seen stamp as the precondition once it has hydrated', async () => {
    const { hydrateState, persistState, flushPersistedState } = await load()
    select.mockResolvedValue({ data: [{ key: 'stoplight.campaigns.v1', value: [1], updated_at: T1 }], error: null })
    await hydrateState()

    update.mockResolvedValue({ data: [{ updated_at: T2 }], error: null })
    persistState('stoplight.campaigns.v1', [1, 2])
    await flushPersistedState()

    expect(update).toHaveBeenCalledTimes(1)
    expect(insert).not.toHaveBeenCalled()
    // The row is only written if it still looks the way this tab was told it looked.
    expect(updateFilters).toContainEqual(['updated_at', T1])
    expect(updateFilters).toContainEqual(['key', 'stoplight.campaigns.v1'])
  })

  it('reports a conflict when the row moved on, instead of overwriting it', async () => {
    const { hydrateState, persistState, flushPersistedState, saveTrouble } = await load()
    select.mockResolvedValue({ data: [{ key: 'stoplight.campaigns.v1', value: [1], updated_at: T1 }], error: null })
    await hydrateState()

    // No error and no row matched: the row exists, it just is not the one we were promised.
    update.mockResolvedValue({ data: [], error: null })
    persistState('stoplight.campaigns.v1', [1, 2])
    await flushPersistedState()

    const t = saveTrouble()
    expect(t).not.toBeNull()
    expect(t!.conflict).toBe(true)
    expect(t!.signedOut).toBe(false)
    expect(t!.message).toMatch(/changed somewhere else/i)
  })

  /**
   * The distinction that matters most. A network failure should keep trying; a conflict must not,
   * because the only way a repeated conditional write starts succeeding is if someone removes the
   * condition — and then it overwrites the newer value, which is the original bug wearing a hat.
   */
  it('does not retry a conflict, unlike a failure', async () => {
    const { hydrateState, persistState, flushPersistedState } = await load()
    select.mockResolvedValue({ data: [{ key: 'k', value: 1, updated_at: T1 }], error: null })
    await hydrateState()

    update.mockResolvedValue({ data: [], error: null })
    persistState('k', 2)
    await flushPersistedState()
    expect(update).toHaveBeenCalledTimes(1)

    // Well past every backoff the failure path would have used.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('writes again once a hydrate teaches it the newer stamp', async () => {
    const { hydrateState, persistState, flushPersistedState, saveTrouble } = await load()
    select.mockResolvedValue({ data: [{ key: 'k', value: 1, updated_at: T1 }], error: null })
    await hydrateState()

    update.mockResolvedValue({ data: [], error: null })
    persistState('k', 2)
    await flushPersistedState()
    expect(saveTrouble()?.conflict).toBe(true)

    // Re-hydrating is how the tab catches up: it learns T2, and its next write is accepted.
    select.mockResolvedValue({ data: [{ key: 'k', value: 99, updated_at: T2 }], error: null })
    await hydrateState()
    update.mockResolvedValue({ data: [{ updated_at: '2026-08-19T02:00:00.000Z' }], error: null })
    persistState('k', 100)
    await flushPersistedState()

    expect(updateFilters).toContainEqual(['updated_at', T2])
    expect(saveTrouble()).toBeNull()
  })

  it('treats a row that already exists as a conflict when the tab has never seen the key', async () => {
    const { persistState, flushPersistedState, saveTrouble } = await load()
    // Never hydrated, so this is the insert branch — and the row being there means someone else
    // created it while this tab believed the key was empty.
    insert.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value' } })

    persistState('k', 1)
    await flushPersistedState()

    expect(saveTrouble()?.conflict).toBe(true)
  })
})
