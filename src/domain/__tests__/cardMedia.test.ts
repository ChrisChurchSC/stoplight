import { describe, expect, it } from 'vitest'
import {
  creativeKind,
  creativeMeta,
  creativeSummary,
  extensionOf,
  formatBytes,
  formatDuration,
  moveMedia,
  unsyncedCount,
  type CardMedia,
} from '../cardMedia'

/**
 * The rules a card's attached creative is read by. Pure functions, so they are testable without a
 * browser, a store or a bucket — which matters because the interesting cases here are the ones a
 * person only meets with a real file in their hand: a .mov the OS handed over with no MIME type, a
 * carousel reordered one slide too far, a stream whose duration is Infinity.
 */

const media = (over: Partial<CardMedia> = {}): CardMedia => ({
  id: over.id ?? 'cm_1',
  name: 'hero.png',
  mime: 'image/png',
  size: 412_000,
  kind: 'image',
  uploadedAt: 0,
  ...over,
})

describe('creativeKind', () => {
  it('reads the MIME type first', () => {
    expect(creativeKind('image/jpeg', 'whatever')).toBe('image')
    expect(creativeKind('video/quicktime', 'whatever')).toBe('video')
    expect(creativeKind('application/pdf', 'brief.pdf')).toBe('doc')
  })

  /**
   * The case this exists for. Files dragged out of some tools — and every file dropped from a few
   * Linux file managers — arrive with `type: ''`, because the browser only fills it in for
   * extensions it recognises in that context. A finished .mov rendering as a document is a video
   * nobody can preview, on the one panel built to preview it.
   */
  it('falls back to the extension when the browser reports no MIME type', () => {
    expect(creativeKind('', 'final_cut.mov')).toBe('video')
    expect(creativeKind('', 'slide_1.PNG')).toBe('image')
    expect(creativeKind('', 'deck.key')).toBe('doc')
  })

  it('does not mistake a name that merely contains an extension for that type', () => {
    expect(creativeKind('', 'notes.png.txt')).toBe('doc')
  })
})

describe('extensionOf', () => {
  it('lowercases, drops the dot, and answers empty for a bare name', () => {
    expect(extensionOf('Hero_V4_FINAL.PNG')).toBe('png')
    expect(extensionOf('archive.tar.gz')).toBe('gz')
    expect(extensionOf('Makefile')).toBe('')
  })
})

describe('formatBytes', () => {
  it('reads at the precision a person reads', () => {
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(412_000)).toBe('402 KB')
    expect(formatBytes(3_500_000)).toBe('3.3 MB')
    // Past ten, the decimal is noise on a 10px line.
    expect(formatBytes(41_000_000)).toBe('39 MB')
  })

  it('answers a dash rather than "0 B" for a size it does not have', () => {
    expect(formatBytes(0)).toBe('—')
    expect(formatBytes(Number.NaN)).toBe('—')
  })
})

describe('formatDuration', () => {
  it('pads the seconds so 1:05 never reads as 1:5', () => {
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(600)).toBe('10:00')
  })

  /** A live stream or a malformed container reports Infinity. "Infinity:NaN" under a tile is worse
   *  than saying nothing about how long it runs. */
  it('says nothing rather than something false', () => {
    expect(formatDuration(undefined)).toBe('')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('')
    expect(formatDuration(0)).toBe('')
  })
})

describe('creativeMeta', () => {
  it('skips whatever is unknown instead of printing a placeholder for it', () => {
    expect(creativeMeta(media({ width: 1080, height: 1350 }))).toBe('1080 × 1350 · 402 KB')
    expect(creativeMeta(media())).toBe('402 KB')
    expect(creativeMeta(media({ kind: 'video', width: 1080, height: 1920, durationSec: 22, size: 41_000_000 })))
      .toBe('1080 × 1920 · 0:22 · 39 MB')
  })
})

describe('creativeSummary', () => {
  /**
   * "3 files" and "3 slides" are different facts and the second is the one being checked. Two or
   * more images on one card IS a carousel — naming it saves the reader counting tiles.
   */
  it('names a carousel rather than counting files', () => {
    expect(creativeSummary([media({ id: 'a' }), media({ id: 'b' }), media({ id: 'c' })]))
      .toBe('Carousel · 3 slides')
  })

  it('does not call a single image a carousel', () => {
    expect(creativeSummary([media()])).toBe('1 image')
  })

  /** A mixed set is not a carousel — a static plus its cutdown is two deliverables, not two slides. */
  it('lists a mixed set by kind', () => {
    expect(creativeSummary([media({ id: 'a' }), media({ id: 'b', kind: 'video' })]))
      .toBe('1 image · 1 video')
  })

  it('answers empty for nothing attached, so the header has nothing to append', () => {
    expect(creativeSummary([])).toBe('')
  })
})

describe('moveMedia', () => {
  const list = [media({ id: 'a' }), media({ id: 'b' }), media({ id: 'c' })]
  const ids = (l: CardMedia[]) => l.map((m) => m.id).join('')

  it('moves a slide and leaves the rest in order', () => {
    expect(ids(moveMedia(list, 'c', 0))).toBe('cab')
    expect(ids(moveMedia(list, 'a', 2))).toBe('bca')
  })

  /**
   * THE BUG THIS CLAMP EXISTS FOR. The arrows are disabled at the ends, but a held key can outrun a
   * re-render — and an out-of-range splice does not no-op, it drops the item off the list. For a
   * carousel that is a slide that vanishes when you press "up" one time too many.
   */
  it('clamps rather than dropping the slide off the end', () => {
    expect(ids(moveMedia(list, 'a', -3))).toBe('abc')
    expect(ids(moveMedia(list, 'a', 99))).toBe('bca')
    expect(moveMedia(list, 'a', -3)).toHaveLength(3)
    expect(moveMedia(list, 'c', 99)).toHaveLength(3)
  })

  it('returns the same array when nothing moves, so a no-op cannot trigger a save', () => {
    expect(moveMedia(list, 'b', 1)).toBe(list)
    expect(moveMedia(list, 'nope', 0)).toBe(list)
  })

  it('never mutates the list it was given', () => {
    const before = ids(list)
    moveMedia(list, 'a', 2)
    expect(ids(list)).toBe(before)
  })
})

describe('unsyncedCount', () => {
  it('counts only what has no path — the files nobody else can open', () => {
    expect(unsyncedCount([media({ id: 'a', path: 'ws/row/a.png' }), media({ id: 'b' })])).toBe(1)
    expect(unsyncedCount([media({ id: 'a', path: 'ws/row/a.png' })])).toBe(0)
    expect(unsyncedCount([])).toBe(0)
  })
})
