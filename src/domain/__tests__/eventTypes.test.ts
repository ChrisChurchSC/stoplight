import { describe, expect, it } from 'vitest'
import { DELIVERABLE_PRESETS } from '../flows'
import { CHANNEL_TYPES, primaryTypeKey, typesFor } from '../channelAssetTypes'
import { funnelStageFor } from '../funnel'

/**
 * THE EVENTS CHANNEL, WHICH NOW SPANS THREE FUNNEL STAGES.
 *
 * Events used to carry four types that all assumed you were the host, all sat on the channel
 * default, and all cost the same to run. The five added alongside them broke each of those
 * assumptions at once, and every way that can go wrong is silent in the product.
 */
describe('the events channel', () => {
  /**
   * THE PRIMARY TYPE MUST STAY THE FIRST ONE.
   *
   * primaryTypeKey takes [0], and the closing-flow invariant resolves a playbook band from
   * funnelStageFor(channel, primaryType). Prepending a type rather than appending it would
   * retype the whole channel: put 'dinner' first and events becomes a conversion channel,
   * which inverts where its cards sit on the canvas. Nothing errors when that happens.
   */
  it('is still typed by a screening, so appending never retyped the channel', () => {
    expect(primaryTypeKey('events')).toBe('screening')
    expect(funnelStageFor('events', primaryTypeKey('events'))).toBe('consideration')
  })

  /**
   * A room you did not fill is a different job from a room you invited.
   */
  it('puts the events somebody else assembled the room for in awareness', () => {
    expect(funnelStageFor('events', 'premiere')).toBe('awareness')
    expect(funnelStageFor('events', 'booth')).toBe('awareness')
    expect(funnelStageFor('events', 'conference-talk')).toBe('awareness')
  })

  it('treats a private dinner as a close, not education', () => {
    expect(funnelStageFor('events', 'dinner')).toBe('conversion')
  })

  /**
   * Deliberately on the channel default. A community night both recruits and keeps people, so
   * consideration is the honest middle. This asserts the default is a decision, not an oversight.
   */
  it('leaves a meetup on the channel default', () => {
    expect(funnelStageFor('events', 'meetup')).toBe('consideration')
  })

  /**
   * EVERY EVENT TYPE MUST BE STARTABLE.
   *
   * The presets ARE the palette, so a type with no preset can be chosen from the Type dropdown on
   * an asset that already exists but can never be started from the Events palette. 'popup' shipped
   * that way while its three siblings did not.
   *
   * Scoped to events on purpose: 91 of 157 types across the app have no preset, and that is by
   * design: most are ad-format variants you reach by retyping an existing ad. An event type is
   * not a variant of another event, it is a distinct occasion you start from, so for this one
   * channel the palette has to be complete.
   */
  it('can start every one of its types from the palette', () => {
    const covered = new Set(
      DELIVERABLE_PRESETS.filter((p) => p.channel === 'events').map((p) => p.assetType),
    )
    const missing = CHANNEL_TYPES.events.filter((t) => !covered.has(t.value)).map((t) => t.value)
    expect(missing).toEqual([])
  })

  /**
   * A series is not a night. Left on 'one-off' a monthly meetup would have been planned, and
   * costed, as a single evening's work.
   */
  it('runs the meetup as a series and everything else once', () => {
    const events = DELIVERABLE_PRESETS.filter((p) => p.channel === 'events')
    const series = events.filter((p) => p.runtime !== 'one-off').map((p) => p.assetType)
    expect(series).toEqual(['meetup'])
  })

  /** The Other/custom escape hatch must survive the additions. */
  it('still offers a custom format', () => {
    expect(typesFor('events').at(-1)?.value).toBe('other')
  })
})
