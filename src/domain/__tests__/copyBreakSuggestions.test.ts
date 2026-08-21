import { describe, expect, it } from 'vitest'
import { copyBreakSuggestions, type CheckBreak, type CheckFix } from '../copyBreakSuggestions'

/**
 * NINETEEN FINDINGS, NINETEEN ASSETS, ONE FIX ID.
 *
 * Findings were matched to their fixes by HEADLINE TEXT. VOICE_RULES emits static headlines, so
 * every em-dash finding in a campaign reads "This copy uses an em dash." — identically, on every
 * asset it fires against. A Map keyed on that keeps the last one written, so eighteen findings
 * printed a breakId belonging to a different asset and named that asset as the place to look.
 *
 * Acting on the review then rewrote copy on an asset nobody had selected, and applyBreakFix had no
 * undo behind it. The collision is a property of a SET — one finding cannot show it — which is why
 * this is tested here rather than through the check that produces them.
 */

const brk = (id: string, asset: string, over: Partial<CheckBreak> = {}): CheckBreak => ({
  id,
  axis: 'voice',
  severity: 'medium',
  headline: 'This copy uses an em dash.',
  asset,
  field: 'headline',
  ...over,
})

const fix = (id: string, asset: string): CheckFix => ({ id, asset })

describe('the same rule firing on many assets', () => {
  it('keeps one finding per asset, each with its own fix id', () => {
    const breaks = [brk('voice-emdash-r1-headline', 'Launch post'), brk('voice-emdash-r2-headline', 'Nurture email'), brk('voice-emdash-r3-headline', 'Landing page')]
    const fixes = [fix('voice-emdash-r1-headline', 'Launch post'), fix('voice-emdash-r2-headline', 'Nurture email'), fix('voice-emdash-r3-headline', 'Landing page')]

    const out = copyBreakSuggestions(breaks, fixes)

    expect(out).toHaveLength(3)
    const ids = out.map((s) => s.fix)
    expect(new Set(ids).size, 'three findings must carry three distinct breakIds').toBe(3)
    expect(out[0].fix).toContain('voice-emdash-r1-headline')
    expect(out[1].fix).toContain('voice-emdash-r2-headline')
    expect(out[2].fix).toContain('voice-emdash-r3-headline')
  })

  it('points each finding at its own asset', () => {
    const breaks = [brk('b1', 'Launch post'), brk('b2', 'Nurture email')]
    const out = copyBreakSuggestions(breaks, [fix('b1', 'Launch post'), fix('b2', 'Nurture email')])
    expect(out.map((s) => s.where.assetName)).toEqual(['Launch post', 'Nurture email'])
  })

  it('collides on copy-templated headlines too, and must not', () => {
    // Proof-gap and weak-CTA headlines template on the COPY, not the asset — two assets sharing a
    // CTA produce the identical headline.
    const shared = 'This asset makes a promise, then closes with a soft "Learn more."'
    const breaks = [brk('cta-r1-cta', 'Ad A', { axis: 'cta', headline: shared }), brk('cta-r2-cta', 'Ad B', { axis: 'cta', headline: shared })]
    const out = copyBreakSuggestions(breaks, [fix('cta-r1-cta', 'Ad A'), fix('cta-r2-cta', 'Ad B')])
    expect(out[0].fix).toContain('cta-r1-cta')
    expect(out[1].fix).toContain('cta-r2-cta')
    expect(out[0].where.assetName).toBe('Ad A')
    expect(out[1].where.assetName).toBe('Ad B')
  })
})

describe('breaks with no mechanical fix', () => {
  it('does not offer a button that does nothing', () => {
    const out = copyBreakSuggestions([brk('dup-r1', 'Launch post', { axis: 'duplicate' })], [])
    expect(out[0].fix).toMatch(/no mechanical fix/i)
    expect(out[0].fix).not.toContain('apply_fix')
  })

  it('still says which asset it is about', () => {
    // Previously the location came off the matched fix, so a fixless break reported nowhere.
    const out = copyBreakSuggestions([brk('dup-r1', 'Launch post', { axis: 'duplicate' })], [])
    expect(out[0].where.assetName).toBe('Launch post')
  })

  it('never hands out a fix id belonging to a different break', () => {
    const breaks = [brk('has-fix', 'Ad A'), brk('no-fix', 'Ad B')]
    const out = copyBreakSuggestions(breaks, [fix('has-fix', 'Ad A')])
    expect(out[0].fix).toContain('has-fix')
    expect(out[1].fix).not.toContain('has-fix')
    expect(out[1].fix).toMatch(/no mechanical fix/i)
  })
})

describe('what it carries through', () => {
  it('keeps a valid severity and falls back for an unknown one', () => {
    expect(copyBreakSuggestions([brk('b1', 'A', { severity: 'high' })], [])[0].severity).toBe('high')
    expect(copyBreakSuggestions([brk('b1', 'A', { severity: 'nonsense' })], [])[0].severity).toBe('medium')
  })

  it('names the axis in the reason', () => {
    expect(copyBreakSuggestions([brk('b1', 'A', { axis: 'proof' })], [])[0].why).toContain('proof')
  })
})
