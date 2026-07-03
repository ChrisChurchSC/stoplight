import { siFormspree, siKit, siMailchimp, siResend, siSubstack } from 'simple-icons'

/**
 * Email / form providers — the tool a brand sends email THROUGH, distinct from the
 * Email channel itself. Selected in the brand's Channels roster (Owned), and used
 * to brand a brand's email cards on the canvas. Tools with no mark in simple-icons
 * (Neon One, Klaviyo) fall back to a tinted envelope.
 */

export interface EmailTool {
  id: string
  label: string
  color: string
  path: string | null
  /** viewBox for `path` when it isn't the default 24x24 grid (e.g. a vendor logo). */
  viewBox?: string
}

// A generic envelope, tinted per tool when the tool has no brand mark.
const ENVELOPE = 'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z'

// Neon One's brand mark (their Safari pinned-tab silhouette), in its native 260 grid.
const NEON_ONE_LOGO =
  'M0 37.9v38l10.3.1c16 0 23.5 1.3 35.7 6.3 11.8 4.8 22 12.5 29.8 22.7 4.1 5.3 12.3 20.8 18.3 34.3 13.4 30.6 21.2 45.8 29.8 58.2 19.1 27.5 45.8 46.8 77.6 56 7.9 2.3 12.7 3.2 25.4 5 6.6 1 29.7 1.4 31 .6.8-.5 1.1-11.3.9-38l-.3-37.4-13-.2c-15.3-.3-19.6-.9-29-4.2-10.8-3.8-19.3-9-26.6-16.2-11-10.9-14.7-17.3-33.9-59.6-10.2-22.2-16.1-32.8-25.5-45.5C112.6 34 89.4 17.1 62 8 45.6 2.7 36.3 1.1 15.3.4L0-.1v38zM233 4.1c-10.5 5.4-24.9 8.6-41.1 9.1l-5.6.3-.1 16.7c0 14.8.2 16.8 1.7 17 .9.1 4.5.2 8.1.2l6.5.1V73c.1 28.9.7 33 6.4 41.8 8.3 12.8 19.2 17.8 42.7 19.7l7.1.6V0l-9.1.2c-8.4.1-9.7.4-16.6 3.9zM.6 135.9c-1.3 2-.4 82.5.9 88.7 2.8 13 11.2 23.8 23 29.3 19.6 9.2 39.4 6.2 53.7-8.1 15.9-15.9 18.2-39.9 5.7-58.3-4.7-7-11-11.9-24.9-19.7-2.5-1.4-10.6-6-18-10.3-38.1-22-39.7-22.8-40.4-21.6z'

export const EMAIL_TOOLS: EmailTool[] = [
  { id: 'resend', label: 'Resend', color: `#${siResend.hex}`, path: siResend.path },
  { id: 'formspree', label: 'Formspree', color: `#${siFormspree.hex}`, path: siFormspree.path },
  { id: 'mailchimp', label: 'Mailchimp', color: `#${siMailchimp.hex}`, path: siMailchimp.path },
  { id: 'kit', label: 'Kit (ConvertKit)', color: `#${siKit.hex}`, path: siKit.path },
  { id: 'substack', label: 'Substack', color: `#${siSubstack.hex}`, path: siSubstack.path },
  { id: 'klaviyo', label: 'Klaviyo', color: '#232426', path: ENVELOPE },
  { id: 'neon-one', label: 'Neon One', color: '#00b3b0', path: NEON_ONE_LOGO, viewBox: '0 0 260 260' },
]

/** The email tool selected in a brand's channel roster, if any. */
export function emailToolFromRoster(channels: string[] | undefined | null): EmailTool | null {
  if (!channels) return null
  for (const v of channels) {
    const key = v.trim().toLowerCase()
    const t = EMAIL_TOOLS.find((tool) => tool.id === key || tool.label.toLowerCase() === key)
    if (t) return t
  }
  return null
}
