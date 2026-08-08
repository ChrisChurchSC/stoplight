import { describe, expect, it } from 'vitest'
import { brandFromBoard } from '../brand'

/**
 * A CAMPAIGN CAN CARRY ITS BRAND ON THE BOARD AND NOWHERE ELSE.
 *
 * bindCampaignBrand writes the campaign's client when a Brand card is WIRED into the brief, so the
 * record is only as old as that wiring. Every campaign built before it, imported, or holding a card
 * nobody has attached yet has a Brand card naming a brand — shaping the copy, filling the pickers,
 * listed under Made from — while the campaign record still says nobody. Reading the record alone
 * calls those brandless, which is a fact about where the app looked, not about the campaign.
 *
 * The precedence is the point and is what these pin: wired beats loose, and a card pointing at a
 * record that no longer exists is not an answer at all.
 */

const brands: Record<string, string> = { br_big: 'Big Buoy', br_world: 'World Within' }
const nameFor = (id: string): string | undefined => brands[id]

const card = (id: string, refId?: string, kind = 'brand') => ({ id, kind, refId })
const board = (
  objects: { id: string; kind: string; refId?: string }[],
  connectors: { from: string; to: string }[] = [],
) => ({ objects, connectors })

describe('brandFromBoard', () => {
  it('reads the brand off a card wired into the brief', () => {
    expect(brandFromBoard(board([card('n1', 'br_big')], [{ from: 'n1', to: 'campaign' }]), nameFor)).toBe('Big Buoy')
  })

  it('takes a loose card when it is the only brand named on the board', () => {
    // Not attached yet, but it is still the one brand this board mentions — and the alternative is
    // telling someone their campaign has no brand while its Brand card sits on screen naming one.
    expect(brandFromBoard(board([card('n1', 'br_big')]), nameFor)).toBe('Big Buoy')
  })

  it('prefers the wired card over a loose one', () => {
    // The wired card is what shapes the copy; a loose one is a card someone dropped.
    const b = board([card('loose', 'br_world'), card('wired', 'br_big')], [{ from: 'wired', to: 'campaign' }])
    expect(brandFromBoard(b, nameFor)).toBe('Big Buoy')
  })

  it('ignores cards that are not Brand cards', () => {
    const b = board([card('a1', 'br_big', 'audience')], [{ from: 'a1', to: 'campaign' }])
    expect(brandFromBoard(b, nameFor)).toBe('')
  })

  it('ignores a Brand card with no record picked', () => {
    // A card someone dropped and has not filled in names no brand, and inventing one from an empty
    // card is the guess this whole ladder exists to avoid.
    expect(brandFromBoard(board([card('n1')], [{ from: 'n1', to: 'campaign' }]), nameFor)).toBe('')
  })

  it('ignores a card pointing at a record that is gone', () => {
    expect(brandFromBoard(board([card('n1', 'br_deleted')], [{ from: 'n1', to: 'campaign' }]), nameFor)).toBe('')
  })

  it('does not treat the brandless catch-alls as a brand', () => {
    const catchAll = (id: string): string | undefined => ({ br_none: 'Unassigned', br_draft: 'Drafts' })[id]
    expect(brandFromBoard(board([card('n1', 'br_none')]), catchAll)).toBe('')
    expect(brandFromBoard(board([card('n2', 'br_draft')]), catchAll)).toBe('')
  })

  it('answers nothing for a board that was never saved', () => {
    expect(brandFromBoard(undefined, nameFor)).toBe('')
    expect(brandFromBoard(board([]), nameFor)).toBe('')
  })
})
