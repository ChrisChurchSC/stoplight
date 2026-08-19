import { describe, expect, it } from 'vitest'
import {
  UnknownAssetFieldError,
  applyCopyFields,
  describeAssetFields,
  fieldCoverage,
  messagingKeys,
} from '../assetFields'

/**
 * WHAT A HAND-AUTHORED CARD USED TO ARRIVE LOOKING LIKE.
 *
 * A card renders every component its format defines. The agent tools could say four things —
 * headline, primaryText, description, cta — and those four were matched onto keys by four
 * independent regex searches, each with a `?? fields[0]` fallback on the primary one. Two
 * consequences, both silent:
 *
 *  - On any format with no body-ish component (a proposal, a Google search ad, a Snapchat ad),
 *    `primaryText` fell through to fields[0] — the SAME key `headline` had just written. The agent
 *    sent two fields, the card kept one, and the reply said nothing.
 *  - Six of a website's nine components, an email's subject line, a blog's key takeaway had no
 *    alias at all and no way to be named, so they stayed blank on a card that read as finished.
 *
 * These tests pin the resolution (nothing collides, nothing falls back to fields[0]), the escape
 * hatch that reaches the rest (`fields`, by real key), and the reporting that makes an unfilled
 * card visible instead of silent.
 */

describe('alias resolution', () => {
  it('sends headline to an email’s headline, not its subject line', () => {
    // `subject` is first in the schema and matches the headline pattern, so it used to swallow the
    // alias — the email's own headline component could never be written at all.
    expect(messagingKeys('email')).toMatchObject({
      headline: 'headline',
      primaryText: 'body',
      description: 'preview',
      cta: 'cta',
    })
  })

  it('never resolves two aliases onto the same key', () => {
    for (const channel of ['proposal', 'google-search', 'snapchat-ads', 'youtube-ads', 'website', 'email'] as const) {
      const keys = Object.values(messagingKeys(channel)).filter(Boolean)
      expect(new Set(keys).size, `${channel} resolved a key twice`).toBe(keys.length)
    }
  })

  it('leaves an alias unresolved rather than dropping it on fields[0]', () => {
    // A proposal is title / summary / scope / price / next: nothing body-ish, nothing description-y.
    const keys = messagingKeys('proposal')
    expect(keys.headline).toBe('title')
    expect(keys.primaryText).toBeUndefined()
    expect(keys.description).toBeUndefined()
  })

  it('keeps a CTA writable on an organic format that defines none', () => {
    // Instagram's schema is a single caption, but the card still renders a CTA row.
    expect(messagingKeys('instagram')).toMatchObject({ primaryText: 'caption', cta: 'cta' })
  })
})

describe('applying a write', () => {
  it('does not let primaryText overwrite the headline it just wrote', () => {
    const { messaging, mapped, unmapped } = applyCopyFields('proposal', undefined, {}, {
      headline: 'Retainer proposal',
      primaryText: 'Twelve weeks of paid social.',
    })
    expect(messaging.title).toBe('Retainer proposal')
    expect(mapped.headline).toBe('title')
    // Not stored, and SAID so — the old code stored it over the title and reported success.
    expect(unmapped).toContain('primaryText')
    expect(Object.values(messaging)).not.toContain('Twelve weeks of paid social.')
  })

  it('reaches the components no alias names', () => {
    const { messaging, unmapped } = applyCopyFields('website', undefined, {}, {
      fields: {
        headline: 'Ship campaigns faster',
        subhead: 'One canvas for every channel',
        body: 'Breadcrumbs keeps the brief and the copy in one place.',
        'proof-social': 'Trusted by 40 studios',
        'proof-stat': '3x faster handoff',
        'cta-mid': 'See a demo',
        faq: 'Do you replace our CMS? No.',
        'cta-footer': 'Start free',
        cta: 'Get started',
      },
    })
    expect(fieldCoverage('website', undefined, messaging).complete).toBe(true)
    expect(unmapped).toEqual([])
  })

  it('lets an explicit key beat the alias that resolved onto it', () => {
    const { messaging } = applyCopyFields('email', undefined, {}, {
      headline: 'via alias',
      fields: { headline: 'via key' },
    })
    expect(messaging.headline).toBe('via key')
  })

  it('refuses a key the card does not render, and names the ones it does', () => {
    // Storing it would look exactly like success and show up nowhere.
    try {
      applyCopyFields('instagram', undefined, {}, { fields: { headline: 'nope' } })
      expect.unreachable('expected an UnknownAssetFieldError')
    } catch (e) {
      expect(e).toBeInstanceOf(UnknownAssetFieldError)
      expect((e as UnknownAssetFieldError).unknownKeys).toEqual(['headline'])
      expect((e as UnknownAssetFieldError).validKeys).toContain('caption')
    }
  })

  it('trims a value past its hard limit instead of rejecting the write', () => {
    const { messaging, clamped } = applyCopyFields('google-search', undefined, {}, {
      fields: { headline: 'x'.repeat(60) },
    })
    expect(messaging.headline.length).toBeLessThanOrEqual(30)
    expect(clamped).toContain('headline')
  })

  it('keeps components the write did not mention', () => {
    const { messaging } = applyCopyFields('email', undefined, { subject: 'Kept', body: 'Kept too' }, {
      fields: { preview: 'New' },
    })
    expect(messaging).toMatchObject({ subject: 'Kept', body: 'Kept too', preview: 'New' })
  })
})

describe('coverage', () => {
  it('counts a card finished only when every component its format defines carries text', () => {
    const partial = fieldCoverage('website', undefined, { headline: 'Hi', body: 'There' })
    expect(partial.complete).toBe(false)
    expect(partial.filled).toEqual(['headline', 'body'])
    expect(partial.missing).toContain('subhead')
    expect(partial.missing).toContain('cta-footer')
  })

  it('ignores keys the format does not define', () => {
    // A caption stored under a key this format dropped is not this card's copy.
    const { filled, complete } = fieldCoverage('instagram', undefined, { headline: 'orphan', caption: 'Real' })
    expect(filled).toEqual(['caption'])
    expect(complete).toBe(true)
  })
})

describe('describing a format', () => {
  it('hands back the keys in the order the card renders them, with their limits', () => {
    const fields = describeAssetFields('google-search')
    expect(fields.map((f) => f.key)).toEqual(['headline', 'description', 'path'])
    expect(fields[0]).toMatchObject({ label: 'Headline', hardLimit: 30 })
  })

  it('honours a per-type override', () => {
    expect(describeAssetFields('tiktok', 'video').map((f) => f.key)).toEqual(['caption', 'hook'])
  })
})
