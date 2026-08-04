import { describe, expect, it } from 'vitest'
import { emptyBoard, objectName, pruneBoard, type CanvasObject } from '../flowBoard'

/**
 * A CARD ANSWERS TO WHAT YOU CALLED IT.
 *
 * Every card carries its own name now, and five surfaces print it — the canvas, the Layers panel,
 * the inspector's title, the grid's object columns and a smart object's member list. They agree
 * because they all go through objectName rather than each carrying its own "name || record || text"
 * ladder, which is what these pin: the order of that ladder, and the two ways it can be reached with
 * nothing (a card with no name at all, and one whose name was typed and then cleared).
 *
 * The round-trip matters as much as the ladder. The board is persisted and re-pruned on every load,
 * and pruneBoard rebuilds the object list, so a field it does not carry forward is a field that
 * disappears the next time you open the campaign.
 */

const obj = (extra: Partial<CanvasObject> = {}): CanvasObject => ({
  id: 'co_1',
  kind: 'audience',
  text: '',
  ...extra,
})

describe('objectName', () => {
  it('prefers the name you typed over the record the card points at', () => {
    expect(objectName(obj({ name: 'Enterprise, cold' }), 'Enterprise buyers')).toBe('Enterprise, cold')
  })

  it('falls back to the linked record when the card has no name of its own', () => {
    expect(objectName(obj(), 'Enterprise buyers')).toBe('Enterprise buyers')
  })

  it('falls back to a sticky’s first line when there is no name and no record', () => {
    expect(objectName(obj({ kind: 'note', text: 'Chase legal\nthen ship' }))).toBe('Chase legal')
  })

  it('treats a name of nothing but spaces as no name at all', () => {
    expect(objectName(obj({ name: '   ' }), 'Enterprise buyers')).toBe('Enterprise buyers')
  })

  it('returns the fallback only when every rung is empty', () => {
    expect(objectName(obj(), undefined, 'Audience')).toBe('Audience')
    expect(objectName(obj())).toBe('')
  })
})

describe('a name survives the board round-trip', () => {
  it('is still on the card after pruneBoard rebuilds the object list', () => {
    const board = { ...emptyBoard('camp'), objects: [obj({ name: 'Enterprise, cold' })] }
    const pruned = pruneBoard(board, { objectKinds: new Set(['audience']), smartObjectIds: new Set() })
    expect(pruned.objects[0].name).toBe('Enterprise, cold')
  })

  /**
   * The one path that REWRITES an object on the way through: a card pointing at a smart object that
   * no longer exists has the dead link stripped. Everything else about the card, its name included,
   * has to come out the other side.
   */
  it('is kept when the card’s dead smart-object link is stripped', () => {
    const board = {
      ...emptyBoard('camp'),
      objects: [obj({ name: 'Enterprise, cold', smartObjectId: 'so_gone' })],
    }
    const pruned = pruneBoard(board, { objectKinds: new Set(['audience']), smartObjectIds: new Set() })
    expect(pruned.objects[0].smartObjectId).toBeUndefined()
    expect(pruned.objects[0].name).toBe('Enterprise, cold')
  })
})
