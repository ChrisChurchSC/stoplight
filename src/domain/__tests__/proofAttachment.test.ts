import { describe, expect, it } from 'vitest'
import { detectProofGaps } from '../breaks'
import { proofLabelKey, registerCampaignRtbs, type Rtb } from '../rtb'
import type { ChannelId, TrafficRow } from '../types'

/**
 * TWO PLACES THAT GUESSED AT PROOF, AND WHAT THE GUESS COST.
 *
 * Both of these matched proof points by looking for one string inside another, and both were wrong
 * in the same direction: they said YES far too easily. That direction matters. A proof point that
 * fails to attach leaves a claim visibly unsupported, and the check keeps saying so. A proof point
 * that attaches to the WRONG claim renders the card as evidenced and the check goes quiet — the
 * fault is now invisible, and it is attached to real, approved proof that says something else.
 *
 * bestRtbForClaim feeds `attachRtb`, which apply_fix applies. proofLabelKey is the dedup key
 * mergeChannelProof uses; getting it wrong splits one proof across two ids, and every rollup that
 * groups by proof then reports half a track record twice.
 */

const rtb = (id: string, label: string, detail = ''): Rtb => ({ id, label, detail })

const row = (campaign: string, claim: string): TrafficRow =>
  ({
    id: 'r1',
    assetId: 'r1',
    assetName: 'Launch post',
    mediaType: 'text',
    channel: 'instagram' as ChannelId,
    messaging: { headline: claim },
    campaign,
    scheduledAt: '2026-09-01T10:00:00.000Z',
    status: 'draft',
    createdAt: 0,
  }) as TrafficRow

/** The gap detectProofGaps raises for a claim, against a campaign carrying `proof`. */
const gapFor = (campaign: string, proof: Rtb[], claim: string) => {
  registerCampaignRtbs(campaign, proof)
  const [gap] = detectProofGaps([row(campaign, claim)])
  expect(gap, 'the fixture has to read as an unsupported claim for the test to mean anything').toBeTruthy()
  return gap
}

describe('choosing the proof point to attach to an unsupported claim', () => {
  it('does not attach on words that overlap between any two English sentences', () => {
    // Nothing here is about the same subject. The only shared words are function words — and "our",
    // which the old three-character floor admitted and then matched INSIDE "your".
    const gap = gapFor(
      'stopwords',
      [rtb('rtb-soc2', 'Trusted with your data', 'SOC 2 certified, with your records held in region.')],
      'Your team ships 2x faster with our platform',
    )
    expect(gap.suggestedFix.attachRtb, 'shared function words are not evidence of anything').toBeUndefined()
  })

  it('does not attach on words found inside longer, unrelated words', () => {
    // "report" inside "reporting" and "support" inside "supported": two hits under `includes`,
    // zero under a word boundary. Two, because one hit alone would now fail the overlap floor and
    // the test would pass without proving anything about whole words.
    const gap = gapFor(
      'substrings',
      [rtb('rtb-accuracy', 'Reporting stays accurate', 'Every export is reconciled nightly, and supported by an audit trail.')],
      'Cuts report prep 40% for support teams',
    )
    expect(gap.suggestedFix.attachRtb, 'a word is not a match because it is spelled inside another one').toBeUndefined()
  })

  it('attaches the proof point that is genuinely about the claim', () => {
    const gap = gapFor(
      'genuine',
      [
        rtb('rtb-onboarding', 'Onboarding cuts in half', 'Enterprise rollouts land in two weeks instead of six.'),
        rtb('rtb-uptime', '99.99% uptime', 'Measured across all regions.'),
      ],
      'Cuts onboarding time by 40% for enterprise teams',
    )
    expect(gap.suggestedFix.attachRtb).toBe('rtb-onboarding')
  })

  it('attaches nothing when two proof points match the claim equally well', () => {
    // WHICH of these backs the claim is the entire question. Breaking the tie by array position
    // answers it by accident, and the answer is then applied to the asset.
    const gap = gapFor(
      'tie',
      [
        rtb('rtb-onboarding-a', 'Onboarding cuts in half'),
        rtb('rtb-onboarding-b', 'Onboarding cuts support tickets'),
      ],
      'Cuts onboarding time by 40%',
    )
    expect(gap.suggestedFix.attachRtb, 'a tie is not a winner').toBeUndefined()
    // With no proof to attach, the offer falls back to softening the claim — the honest fix.
    expect(gap.suggestedFix.after).not.toBe(gap.suggestedFix.before)
    expect(gap.suggestedFix.after).not.toContain('40%')
  })

  it('attaches nothing when the campaign has no proof at all', () => {
    const gap = gapFor('empty', [], 'Cuts onboarding time by 40% for enterprise teams')
    expect(gap.suggestedFix.attachRtb).toBeUndefined()
  })
})

describe('the identity of a proof point', () => {
  it('reads one proof as one proof however the channel formatted it', () => {
    // Every one of these is the same fact arriving from a second channel. Under
    // `label.toLowerCase()` each was a new proof with a fresh id.
    const canonical = proofLabelKey('Onboarding cuts in half')
    for (const variant of [
      'onboarding cuts in half',
      'Onboarding  cuts in half',
      '  Onboarding cuts in half  ',
      'Onboarding cuts in half.',
      'Onboarding cuts in half!',
      'Onboarding—cuts in half',
      'Onboarding cuts in half\n',
    ]) {
      expect(proofLabelKey(variant), `"${variant}" is the same proof`).toBe(canonical)
    }
  })

  it('reads a curly apostrophe and a straight one as the same word', () => {
    expect(proofLabelKey('Our customers’ renewal rate')).toBe(proofLabelKey("Our customers' renewal rate"))
  })

  it('keeps proof points that differ in wording apart', () => {
    expect(proofLabelKey('Onboarding cuts in half')).not.toBe(proofLabelKey('Onboarding cuts support tickets'))
    expect(proofLabelKey('99.99% uptime')).not.toBe(proofLabelKey('99.9% uptime'))
  })

  it('keeps labels with no Latin letters apart instead of collapsing them into one', () => {
    // These normalise to the empty string under the alphanumeric pass. Without the fallback they
    // would all share a key, and the first one ingested would swallow the rest.
    expect(proofLabelKey('継続率')).not.toBe(proofLabelKey('解約率'))
    expect(proofLabelKey('継続率')).toBeTruthy()
  })
})
