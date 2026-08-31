// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { useTrafficStore } from '../useTrafficStore'

/**
 * ATTACHING THE FINISHED CREATIVE TO A CARD, end to end through the store.
 *
 * The suite runs with no backend configured (see vite.config.ts), which is exactly the case worth
 * pinning down: uploadCreative answers null, so every file lands WITHOUT a `path`. That is not a
 * failure and must not be treated as one — the entry is kept, the tile says "On this device only",
 * and a later retry can fill the path in. A version of this that threw, or dropped the file, would
 * mean the feature does nothing at all until Supabase is provisioned.
 *
 * Text files throughout, deliberately. An image or a video sends addCardMedia through
 * URL.createObjectURL to read its dimensions, and jsdom has no object URL API — so a test using a
 * PNG would be testing the environment, not the code.
 */

const ROW = 'row_creative_1'
const file = (name: string, body = 'x') => new File([body], name, { type: 'text/plain' })
const names = (rowId = ROW) => (useTrafficStore.getState().cardMedia[rowId] ?? []).map((m) => m.name)

beforeEach(() => {
  localStorage.clear()
  useTrafficStore.setState({ cardMedia: {} })
})

describe('addCardMedia', () => {
  it('attaches several files at once, in the order they were handed over', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [file('slide_1.txt'), file('slide_2.txt')])
    expect(names()).toEqual(['slide_1.txt', 'slide_2.txt'])
  })

  /** A second drop is another slide, not a replacement. Replacing was the old single-`mediaRef`
   *  behaviour and it is what made a carousel impossible to assemble. */
  it('appends rather than replacing what is already attached', async () => {
    const { addCardMedia } = useTrafficStore.getState()
    await addCardMedia(ROW, [file('slide_1.txt')])
    await addCardMedia(ROW, [file('slide_2.txt')])
    expect(names()).toEqual(['slide_1.txt', 'slide_2.txt'])
  })

  /**
   * A DRAGGED FOLDER arrives as a zero-byte File in several browsers. Attaching it produces a tile
   * that can never preview and never download, named after a directory — and, worse, one that
   * counts toward "3 slides" in the header.
   */
  it('ignores zero-byte entries, which is what a dragged folder looks like', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [
      new File([], 'Campaign Assets', { type: '' }),
      file('real.txt'),
    ])
    expect(names()).toEqual(['real.txt'])
  })

  it('does nothing at all when handed nothing', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [])
    expect(useTrafficStore.getState().cardMedia[ROW]).toBeUndefined()
  })

  it('records size and kind, and leaves the path empty with no workspace to send it to', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [file('brief.txt', 'hello there')])
    const [m] = useTrafficStore.getState().cardMedia[ROW]
    expect(m.size).toBe(11)
    expect(m.kind).toBe('doc')
    expect(m.path).toBeUndefined()
  })

  it('persists, so the attachment survives a reload', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [file('slide_1.txt')])
    const saved = JSON.parse(localStorage.getItem('stoplight.cardMedia.v1') ?? '{}')
    expect(saved[ROW]).toHaveLength(1)
    expect(saved[ROW][0].name).toBe('slide_1.txt')
  })

  it("keeps each card's files to itself", async () => {
    const { addCardMedia } = useTrafficStore.getState()
    await addCardMedia(ROW, [file('a.txt')])
    await addCardMedia('row_other', [file('b.txt')])
    expect(names()).toEqual(['a.txt'])
    expect(names('row_other')).toEqual(['b.txt'])
  })
})

describe('moveCardMedia', () => {
  it('reorders the carousel and persists the new order', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [file('a.txt'), file('b.txt'), file('c.txt')])
    const list = useTrafficStore.getState().cardMedia[ROW]
    useTrafficStore.getState().moveCardMedia(ROW, list[2].id, 0)
    expect(names()).toEqual(['c.txt', 'a.txt', 'b.txt'])
    const saved = JSON.parse(localStorage.getItem('stoplight.cardMedia.v1') ?? '{}')
    expect(saved[ROW].map((m: { name: string }) => m.name)).toEqual(['c.txt', 'a.txt', 'b.txt'])
  })

  it('is a no-op on a card with nothing attached', () => {
    useTrafficStore.getState().moveCardMedia('row_empty', 'nope', 0)
    expect(useTrafficStore.getState().cardMedia['row_empty']).toBeUndefined()
  })
})

describe('removeCardMedia', () => {
  it('detaches one file and leaves the others in order', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [file('a.txt'), file('b.txt'), file('c.txt')])
    const list = useTrafficStore.getState().cardMedia[ROW]
    await useTrafficStore.getState().removeCardMedia(ROW, list[1].id)
    expect(names()).toEqual(['a.txt', 'c.txt'])
  })

  /**
   * The map is mirrored WHOLE on every write, so a campaign's worth of `{"row_x": []}` left behind
   * by deletions is bytes on every sync forever — and it makes "does this card have creative?" two
   * questions (is the key there, is the array non-empty) where it should be one.
   */
  it("drops the card's key entirely rather than leaving an empty list behind", async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [file('only.txt')])
    const [m] = useTrafficStore.getState().cardMedia[ROW]
    await useTrafficStore.getState().removeCardMedia(ROW, m.id)
    expect(useTrafficStore.getState().cardMedia).not.toHaveProperty(ROW)
    const saved = JSON.parse(localStorage.getItem('stoplight.cardMedia.v1') ?? '{}')
    expect(saved).not.toHaveProperty(ROW)
  })

  it('shrugs off an id that is not there', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [file('a.txt')])
    await useTrafficStore.getState().removeCardMedia(ROW, 'cm_nonexistent')
    expect(names()).toEqual(['a.txt'])
  })
})

describe('syncCardMedia', () => {
  /** With no backend there is nowhere to send anything, and the retry has to be a quiet no-op
   *  rather than an error — the button that calls it is offered to a person who cannot fix that. */
  it('leaves everything as it is when there is no workspace to send to', async () => {
    await useTrafficStore.getState().addCardMedia(ROW, [file('a.txt')])
    await useTrafficStore.getState().syncCardMedia(ROW)
    expect(names()).toEqual(['a.txt'])
    expect(useTrafficStore.getState().cardMedia[ROW][0].path).toBeUndefined()
  })
})
