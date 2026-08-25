import { describe, expect, it } from 'vitest'
import { CHANNELS, resolveChannelId } from '../channels'

/**
 * A CHANNEL'S LABEL NAMES A PLACE, AND RENAMING ONE IS NOT FREE.
 *
 * Two labels had a format baked into them — 'LinkedIn post' and 'Blog article'. Standing alone that
 * reads fine, which is why it survived; printed next to the asset type on a card it comes out as
 * "LinkedIn post · post", redundant and wrong. The channel is LinkedIn; post is one of several
 * formats it takes.
 *
 * The renaming is the easy half. Channels are stored loosely all over this app — a label, a
 * sub-format, a pasted brief, a tool call — and resolveChannelId is what turns any of those back
 * into an id. So the old display names have to keep working, or an import that says "Blog article"
 * silently stops finding the channel it always found. That is the half worth a test.
 */
describe('channel labels name a place, not a format', () => {
  it('no longer carries a format in the label', () => {
    expect(CHANNELS.linkedin.label).toBe('LinkedIn')
    expect(CHANNELS.blog.label).toBe('Blog')
  })

  it('still resolves the names those channels used to answer to', () => {
    expect(resolveChannelId('LinkedIn post')).toBe('linkedin')
    expect(resolveChannelId('linkedin post')).toBe('linkedin')
    expect(resolveChannelId('Blog article')).toBe('blog')
    expect(resolveChannelId('blog article')).toBe('blog')
  })

  it('still resolves them by their new labels, and keeps paid separate from organic', () => {
    expect(resolveChannelId('LinkedIn')).toBe('linkedin')
    expect(resolveChannelId('Blog')).toBe('blog')
    // The rename must not make the organic channel swallow the ad one.
    expect(resolveChannelId('LinkedIn Ads')).toBe('linkedin-ads')
  })
})
