import { describe, expect, it } from 'vitest'
import { CHANNEL_LIST } from '../channels'
import { FUNNEL_STAGES, funnelStageFor, type FunnelStage } from '../funnel'
import { SUGGEST_BY_STAGE } from '../matrix'
import { PLAYBOOK_FUNNELS, makeChannelPhase } from '../playbookFunnel'
import { primaryTypeKey, typesFor } from '../channelAssetTypes'

/**
 * A FLOW HAS TO BE ABLE TO END.
 *
 * The channel taxonomy stopped at the landing page: three channels resolved to
 * `conversion`, none to a sale, and the playbooks' Opp bands were declared with
 * `channels: []` because there was no channel that could honestly land there. The
 * canvas drew a journey that ran out of road. These tests hold the property that
 * fixed it, since every part of it is silent when it breaks.
 */
describe('closing a flow', () => {
  it('every funnel stage has at least one channel that lands in it', () => {
    const reached = new Set<FunnelStage>(
      CHANNEL_LIST.map((c) => funnelStageFor(c.id, primaryTypeKey(c.id))),
    )
    const empty = FUNNEL_STAGES.filter((s) => !reached.has(s.stage)).map((s) => s.stage)
    expect(empty).toEqual([])
  })

  it('the conversion stage can be closed by a sale, not just a page', () => {
    const closers = CHANNEL_LIST.filter(
      (c) => c.kind === 'sales' && funnelStageFor(c.id, primaryTypeKey(c.id)) === 'conversion',
    ).map((c) => c.id)
    expect(closers).toContain('checkout')
    expect(closers).toContain('proposal')
  })

  /**
   * A band may only claim channels whose canonical stage IS that band's canon.
   * Claiming one from a later stage drags a card backwards up the journey, and
   * the canvas then has to draw an edge that points the wrong way.
   */
  it('no playbook band claims a channel from a different canonical stage', () => {
    const bad: string[] = []
    for (const [key, stages] of Object.entries(PLAYBOOK_FUNNELS)) {
      for (const stage of stages) {
        for (const ch of stage.channels ?? []) {
          const canon = funnelStageFor(ch, primaryTypeKey(ch))
          if (canon !== stage.canon) bad.push(`${key}/${stage.label}: ${ch} is ${canon}, not ${stage.canon}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  /** Every declared band claim has to actually resolve to that band. */
  it('claimed channels resolve to the band that claims them', () => {
    const bad: string[] = []
    for (const [key, stages] of Object.entries(PLAYBOOK_FUNNELS)) {
      const phase = makeChannelPhase(stages)
      stages.forEach((stage, i) => {
        for (const ch of stage.channels ?? []) {
          const landed = phase(ch, primaryTypeKey(ch))
          if (landed !== i) bad.push(`${key}/${stage.label}: ${ch} landed in ${stages[landed]?.label}`)
        }
      })
    }
    expect(bad).toEqual([])
  })

  /**
   * A suggestion has to be something that can actually sit in the stage offering
   * it. Channels that span the journey by asset type (email, YouTube, outreach)
   * are legitimately offered in more than one stage, so the check is "some type
   * on this channel lands here", not "the channel's default does".
   */
  it('every stage suggests channels that can belong to it', () => {
    const bad: string[] = []
    for (const stage of FUNNEL_STAGES) {
      for (const ch of SUGGEST_BY_STAGE[stage.stage]) {
        const fits = typesFor(ch).some((t) => funnelStageFor(ch, t.value) === stage.stage)
        if (!fits) bad.push(`${stage.stage}: no ${ch} asset type lands here`)
      }
    }
    expect(bad).toEqual([])
  })
})
