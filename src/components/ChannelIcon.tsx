import {
  siMeta,
  siTiktok,
  siX,
  siPinterest,
  siSnapchat,
  siReddit,
  siYoutube,
  siGoogle,
  siInstagram,
  siFacebook,
} from 'simple-icons'
import { CHANNELS } from '../domain/channels'
import type { ChannelId } from '../domain/types'

// LinkedIn is not in simple-icons (removed on trademark request), so supply it.
const LINKEDIN =
  'M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z'

// Generic glyphs for owned/lifecycle platforms that have no brand mark.
const GENERIC: Record<string, string> = {
  Email: 'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z',
  SMS: 'M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM7 9h10v2H7V9zm6 4H7v-2h6v2z',
  Push: 'M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z',
  Web: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.7 15.7 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.93 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14a7.96 7.96 0 0 1 0-4h3.38a16.6 16.6 0 0 0 0 4H4.26zm.81 2h2.95c.32 1.25.78 2.45 1.38 3.56A8.03 8.03 0 0 1 5.07 16zm2.95-8H5.07a8.03 8.03 0 0 1 4.33-3.56A15.7 15.7 0 0 0 8.02 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82A13.8 13.8 0 0 1 12 19.96zM14.34 14H9.66a14.6 14.6 0 0 1 0-4h4.68a14.6 14.6 0 0 1 0 4zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.6 16.6 0 0 0 0-4h3.38a7.96 7.96 0 0 1 0 4h-3.38z',
}

const BRAND_PATH: Record<string, string> = {
  Meta: siMeta.path,
  TikTok: siTiktok.path,
  X: siX.path,
  Pinterest: siPinterest.path,
  Snapchat: siSnapchat.path,
  Reddit: siReddit.path,
  YouTube: siYoutube.path,
  Google: siGoogle.path,
  Instagram: siInstagram.path,
  Facebook: siFacebook.path,
  LinkedIn: LINKEDIN,
  ...GENERIC,
}

export function ChannelIcon({
  channel,
  size = 14,
  color,
}: {
  channel: ChannelId
  size?: number
  color?: string
}) {
  const c = CHANNELS[channel]
  const path = BRAND_PATH[c.platform]
  const fill = color ?? c.color

  if (!path) {
    return (
      <span
        style={{
          width: size * 0.62,
          height: size * 0.62,
          borderRadius: '50%',
          background: fill,
          flexShrink: 0,
        }}
      />
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d={path} />
    </svg>
  )
}
