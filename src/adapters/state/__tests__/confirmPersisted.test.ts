// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmPersisted } from '../workspaceState'

/**
 * THE BUG THIS EXISTS FOR, and it is the localStorage half of the one workspaceState.test covers:
 * a write this browser could not keep was reported as a write that succeeded.
 *
 * persistState swallows a quota error on purpose — almost everything through it is small, and
 * failing those loudly would be the worse trade. Boards and asset rows are the two writes big
 * enough to blow the budget alone, and the connector answers from memory, so a card that never
 * reached storage still came back with an id on it. Through Claude Desktop nobody is watching a
 * canvas that would contradict it: a session added twenty-two object cards and twenty-six assets,
 * was told each one was added, and lost every one of them on reload three times running.
 *
 * The whole value of this check is that it is trusted, so the cases that matter most here are the
 * ones where it must NOT claim a failure it cannot actually see.
 */

const KEY = 'stoplight.test.v1'
type Blob = { ids: string[] }
const hasId = (id: string) => (stored: Blob) => stored.ids.includes(id)

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('what it can see', () => {
  it('confirms a value that is actually in storage', () => {
    localStorage.setItem(KEY, JSON.stringify({ ids: ['a', 'b'] }))
    expect(confirmPersisted<Blob>(KEY, hasId('b'))).toBe(true)
  })

  it('reports the failure when the key was never written', () => {
    expect(confirmPersisted<Blob>(KEY, hasId('a'))).toBe(false)
  })

  it('reports the failure when the write landed but this value is not in it', () => {
    // The shape of a quota error: the previous, smaller value survives, so the key exists and
    // parses — it just does not contain what was written last.
    localStorage.setItem(KEY, JSON.stringify({ ids: ['a'] }))
    expect(confirmPersisted<Blob>(KEY, hasId('b'))).toBe(false)
  })
})

describe('what it cannot see, it does not call a failure', () => {
  /**
   * A read-back that itself fails says nothing either way, and guessing "lost" would be worse than
   * the bug: every connector write would start throwing on a browser with storage disabled, where
   * the workspace mirror may well be carrying the data perfectly well.
   */
  it('gives the benefit of the doubt when storage will not read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage is disabled')
    })
    expect(confirmPersisted<Blob>(KEY, hasId('a'))).toBe(true)
  })

  it('gives the benefit of the doubt when the stored value will not parse', () => {
    localStorage.setItem(KEY, '{ this is not json')
    expect(confirmPersisted<Blob>(KEY, hasId('a'))).toBe(true)
  })

  it('gives the benefit of the doubt when the probe itself throws', () => {
    localStorage.setItem(KEY, JSON.stringify({ nothing: true }))
    // `stored.ids` is undefined here, so the probe throws rather than answering — a shape the
    // caller did not expect is not evidence that the write was dropped.
    expect(confirmPersisted<Blob>(KEY, hasId('a'))).toBe(true)
  })
})
