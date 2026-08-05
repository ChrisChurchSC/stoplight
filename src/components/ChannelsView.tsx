import { type ReactNode, useState } from 'react'
import {
  siApple,
  siCrunchyroll,
  siDiscord,
  siFubo,
  siIheartradio,
  siMax,
  siNetflix,
  siNextdoor,
  siPandora,
  siParamountplus,
  siQuora,
  siRoku,
  siSamsung,
  siSoundcloud,
  siSpotify,
  siTelegram,
  siThreads,
  siTubi,
  siTwitch,
  siWaze,
  siYelp,
} from 'simple-icons'
import { CHANNELS, CHANNEL_LIST, KIND_ORDER, type ChannelKind, channelsByKind } from '../domain/channels'
import { EMAIL_TOOLS } from '../domain/emailTools'
import type { ChannelId } from '../domain/types'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { BrandPicker } from './BrandPicker'

/**
 * Channels — pick the channels (and adjacent tools) a brand publishes on. Grouped
 * by kind (Paid / Organic / Owned); Paid is further split into sub-categories
 * (Social, Search, Streaming, Native, OOH, TV & radio, Print & direct mail, ...)
 * so the long paid list stays scannable. Supplementary picks that aren't full
 * ChannelId citizens (more paid platforms, streaming, offline, email tools) live
 * alongside the canonical channels. The selection is the brand's roster and
 * persists to its profile (`channels`).
 */

interface PickItem {
  id: string
  label: string
  color: string
  path: string | null
}
const mk = (id: string, label: string, color: string, path: string | null = null): PickItem => ({ id, label, color, path })

// The Paid category, split into sub-groups. Each lists canonical channel ids
// (rendered with their brand logo) and extra picks (rendered from a color/path).
const PAID_SUBGROUPS: { label: string; channels: ChannelId[]; items: PickItem[] }[] = [
  {
    label: 'Social',
    channels: ['meta-ads', 'tiktok-ads', 'linkedin-ads', 'x-ads', 'pinterest-ads', 'snapchat-ads', 'reddit-ads', 'youtube-ads'],
    items: [
      mk('quora-ads', 'Quora Ads', `#${siQuora.hex}`, siQuora.path),
      mk('nextdoor-ads', 'Nextdoor Ads', `#${siNextdoor.hex}`, siNextdoor.path),
      mk('twitch-ads', 'Twitch Ads', `#${siTwitch.hex}`, siTwitch.path),
      mk('threads-ads', 'Threads Ads', `#${siThreads.hex}`, siThreads.path),
      mk('yelp-ads', 'Yelp Ads', `#${siYelp.hex}`, siYelp.path),
      mk('waze-ads', 'Waze Ads', `#${siWaze.hex}`, siWaze.path),
      mk('telegram-ads', 'Telegram Ads', `#${siTelegram.hex}`, siTelegram.path),
      mk('discord-ads', 'Discord Ads', `#${siDiscord.hex}`, siDiscord.path),
    ],
  },
  {
    label: 'Search & shopping',
    channels: ['google-search', 'google-demand', 'pmax'],
    items: [
      mk('microsoft-ads', 'Microsoft Ads', '#00A4EF'),
      mk('amazon-ads', 'Amazon Ads', '#FF9900'),
      mk('apple-search-ads', 'Apple Search Ads', `#${siApple.hex}`, siApple.path),
    ],
  },
  {
    label: 'Streaming, CTV & audio',
    channels: [],
    items: [
      mk('spotify-ads', 'Spotify Ads', `#${siSpotify.hex}`, siSpotify.path),
      mk('netflix-ads', 'Netflix Ads', `#${siNetflix.hex}`, siNetflix.path),
      mk('hulu-ads', 'Hulu Ads', '#1CE783'),
      mk('disney-plus-ads', 'Disney+ Ads', '#113CCF'),
      mk('max-ads', 'Max Ads', `#${siMax.hex}`, siMax.path),
      mk('peacock-ads', 'Peacock Ads', '#05A6F0'),
      mk('paramount-plus-ads', 'Paramount+ Ads', `#${siParamountplus.hex}`, siParamountplus.path),
      mk('prime-video-ads', 'Prime Video Ads', '#00A8E1'),
      mk('roku-ads', 'Roku Ads', `#${siRoku.hex}`, siRoku.path),
      mk('tubi-ads', 'Tubi Ads', `#${siTubi.hex}`, siTubi.path),
      mk('pluto-tv-ads', 'Pluto TV Ads', '#0B0C63'),
      mk('samsung-tv-ads', 'Samsung TV+ Ads', `#${siSamsung.hex}`, siSamsung.path),
      mk('fubo-ads', 'Fubo Ads', `#${siFubo.hex}`, siFubo.path),
      mk('crunchyroll-ads', 'Crunchyroll Ads', `#${siCrunchyroll.hex}`, siCrunchyroll.path),
      mk('pandora-ads', 'Pandora Ads', `#${siPandora.hex}`, siPandora.path),
      mk('iheart-ads', 'iHeartRadio Ads', `#${siIheartradio.hex}`, siIheartradio.path),
      mk('soundcloud-ads', 'SoundCloud Ads', `#${siSoundcloud.hex}`, siSoundcloud.path),
    ],
  },
  {
    label: 'Native & display',
    channels: [],
    items: [mk('taboola', 'Taboola', '#044093'), mk('outbrain', 'Outbrain', '#EE6513'), mk('criteo', 'Criteo', '#F26B21')],
  },
  {
    label: 'Out-of-home',
    channels: [],
    items: [
      mk('ooh', 'Out-of-Home (Billboard)', '#0EA5E9'),
      mk('dooh', 'Digital OOH', '#6366F1'),
      mk('transit', 'Transit Ads', '#F59E0B'),
      mk('street-furniture', 'Street Furniture', '#0D9488'),
      mk('airport', 'Airport Ads', '#2563EB'),
      mk('cinema', 'Cinema Ads', '#7C3AED'),
      mk('wild-posting', 'Wild Posting', '#DB2777'),
    ],
  },
  {
    label: 'TV & radio',
    channels: [],
    items: [
      mk('broadcast-tv', 'Broadcast TV', '#9333EA'),
      mk('cable-tv', 'Cable TV', '#4F46E5'),
      mk('radio', 'Radio', '#EF4444'),
      mk('satellite-radio', 'Satellite Radio', '#0033A0'),
    ],
  },
  {
    label: 'Print & direct mail',
    channels: [],
    items: [
      mk('newspaper', 'Newspaper', '#374151'),
      mk('magazine', 'Magazine', '#6B7280'),
      mk('eddm', 'Every Door Direct Mail', '#5B7C99'),
      mk('shared-mail', 'Shared Mail / Coupons', '#D97706'),
    ],
  },
  {
    label: 'Other',
    channels: [],
    items: [mk('podcast-ads', 'Podcast Ads', '#10B981'), mk('sponsorships', 'Sponsorships', '#F43F5E')],
  },
]

// Owned extras: email / form providers (shared with the canvas email-card marks),
// plus offline owned media (your list / events).
const OFFLINE_OWNED: PickItem[] = [mk('direct-mail', 'Direct Mail', '#8B5E3C'), mk('events', 'Events & Experiential', '#EC4899')]

const PAID_ITEMS = PAID_SUBGROUPS.flatMap((g) => g.items)
const EXTRA_BY_KIND: Record<ChannelKind, PickItem[]> = {
  paid: PAID_ITEMS,
  organic: [],
  owned: [...EMAIL_TOOLS, ...OFFLINE_OWNED],
  // Sales & commerce surfaces are all first-class channels; no tool extras yet
  // (a CRM / store connector would layer in here).
  sales: [],
}
const ALL_EXTRAS = [...PAID_ITEMS, ...EMAIL_TOOLS, ...OFFLINE_OWNED]

// A stored roster value is sometimes a social profile URL (from channel connect).
const HOST_TO_CHANNEL: Record<string, ChannelId> = {
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'instagram.com': 'instagram',
  'linkedin.com': 'linkedin',
  'tiktok.com': 'tiktok',
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'x.com': 'x',
  'twitter.com': 'x',
  'pinterest.com': 'pinterest',
}

/** Resolve a stored value (id, label, or short tag) to a canonical channel id. */
function canonChannel(value: string): ChannelId | null {
  const key = value.trim().toLowerCase()
  const hit = CHANNEL_LIST.find(
    (c) => c.id.toLowerCase() === key || c.label.toLowerCase() === key || c.short.toLowerCase() === key,
  )
  return hit ? hit.id : null
}

/** Resolve a stored value (id, label, short, or profile URL) to a known channel
 *  id OR extra-item id, else null. */
function resolveId(value: string): string | null {
  const c = canonChannel(value)
  if (c) return c
  if (/^https?:\/\//i.test(value)) {
    try {
      const host = new URL(value).hostname.replace(/^www\./, '')
      for (const [h, id] of Object.entries(HOST_TO_CHANNEL)) if (host === h || host.endsWith(`.${h}`)) return id
    } catch {
      // not a parseable URL — fall through
    }
  }
  const key = value.trim().toLowerCase()
  const item = ALL_EXTRAS.find((t) => t.id === key || t.label.toLowerCase() === key)
  return item ? item.id : null
}

// Ensure a pasted console URL is launchable (prepend https:// when missing).
const withProto = (u: string) => (/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`)

function PickIcon({ path, color, size = 16 }: { path: string | null; color: string; size?: number }) {
  if (!path) {
    return (
      <span
        style={{ width: size * 0.62, height: size * 0.62, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }}
      />
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={path} />
    </svg>
  )
}

export function ChannelsView({ scopeClient }: { scopeClient?: string }) {
  const { canvases } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)

  const brand = scopeClient ?? (clientFilter !== 'all' ? clientFilter : null)

  if (!brand) {
    return (
      <div className="mtx">
        <BrandPicker verb="choose its channels" />
      </div>
    )
  }

  // Assets already on each channel, resolved to a known id where possible.
  const usage = new Map<string, number>()
  for (const c of canvases) {
    if (c.client !== brand) continue
    for (const r of c.rows) {
      const id = resolveId(r.channel) ?? r.channel
      usage.set(id, (usage.get(id) ?? 0) + 1)
    }
  }

  // Which pickable ids are on (a stored URL / label / id all resolve to one).
  const stored = clientProfiles[brand]?.channels ?? []
  const selected = new Set<string>()
  for (const v of stored) {
    const id = resolveId(v)
    if (id) selected.add(id)
  }

  // Turning a channel off removes every stored value that resolves to it (its id
  // and any profile URL); turning it on appends the canonical id. Unresolvable
  // custom values are left untouched.
  const toggle = (id: string) => {
    const next = selected.has(id) ? stored.filter((v) => resolveId(v) !== id) : [...stored, id]
    setClientProfile(brand, { channels: next })
  }

  // Per-channel console links (launch shortcuts, never credentials). The link editor
  // lives behind a per-row ⋯ menu so the roster reads as a clean list of channels.
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const links = clientProfiles[brand]?.channelLinks ?? {}
  const setLink = (id: string, url: string) => {
    const next = { ...links }
    if (url.trim()) next[id] = url.trim()
    else delete next[id]
    setClientProfile(brand, { channelLinks: next })
  }

  const Chip = ({ id, label, icon, kindLabel }: { id: string; label: string; icon: ReactNode; kindLabel: string }) => {
    const isOn = selected.has(id)
    const used = usage.get(id) ?? 0
    const link = links[id]
    return (
      <div className={`chn-pick-wrap${isOn ? ' on' : ''}`}>
        <button
          className={`chn-pick${isOn ? ' on' : ''}`}
          onClick={() => toggle(id)}
          aria-pressed={isOn}
          title={`${label} · ${kindLabel}${used ? ` · ${used} assets` : ''}`}
        >
          {icon}
          <span className="chn-pick-label">{label}</span>
          {used > 0 && <span className="chn-pick-badge">{used}</span>}
          {!isOn && <span className="chn-pick-check">+</span>}
        </button>
        {isOn && (
          <button
            className={`chn-pick-menu-btn${link ? ' set' : ''}${openMenu === id ? ' active' : ''}`}
            onClick={() => setOpenMenu(openMenu === id ? null : id)}
            title={link ? 'Console link' : 'Add a console link'}
            aria-label={`${label} console link`}
          >
            ⋯
          </button>
        )}
        {isOn && openMenu === id && (
          <>
            <div className="chn-menu-scrim" onClick={() => setOpenMenu(null)} />
            <div className="chn-roster-menu" role="dialog" aria-label={`${label} console link`}>
              <div className="chn-roster-menu-label">Console / admin link</div>
              <input
                className="chn-roster-link"
                type="text"
                autoFocus
                placeholder="e.g. studio.youtube.com"
                value={link ?? ''}
                onChange={(e) => setLink(id, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setOpenMenu(null)}
              />
              <div className="chn-roster-menu-foot">
                {link ? (
                  <a className="chn-roster-go" href={withProto(link)} target="_blank" rel="noopener noreferrer" title={`Open ${label}`}>
                    ↗ Open
                  </a>
                ) : (
                  <span className="chn-roster-go off">↗ Open</span>
                )}
              </div>
              <div className="chn-roster-menu-note">Launch link only, never a password.</div>
            </div>
          </>
        )}
      </div>
    )
  }

  const paidIds = PAID_SUBGROUPS.flatMap((g) => [...g.channels, ...g.items.map((t) => t.id)])
  const paidOn = paidIds.filter((id) => selected.has(id)).length

  return (
    <div className="mtx">
      <header className="mtx-head">
        <h2>{brand} · Channels</h2>
        <span className="mtx-sub">{selected.size} selected · pick the channels this brand publishes on</span>
      </header>

      {/* A selected channel's ⋯ menu (below) opens a console-link editor right on its tile. */}

      {/* Paid — sub-grouped */}
      <section className="ins-card ins-wide">
        <div className="ins-card-head">
          <h3>Paid</h3>
          <span className="ins-card-hint">
            {paidOn} of {paidIds.length} selected
          </span>
        </div>
        {PAID_SUBGROUPS.map((g) => (
          <div className="chn-subgroup" key={g.label}>
            <div className="chn-sublabel">{g.label}</div>
            <div className="chn-grid">
              {g.channels.map((id) => (
                <Chip key={id} id={id} label={CHANNELS[id].label} kindLabel="Paid" icon={<ChannelIcon channel={id} size={16} />} />
              ))}
              {g.items.map((t) => (
                <Chip key={t.id} id={t.id} label={t.label} kindLabel="Paid" icon={<PickIcon path={t.path} color={t.color} />} />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Organic + Owned — flat */}
      {KIND_ORDER.filter((k) => k.kind !== 'paid').map((k) => {
        const list = channelsByKind(k.kind)
        // Extras layer on tools/offline media that aren't first-class channels. Drop any
        // whose id already exists as a canonical channel (e.g. 'events') so it renders once.
        const items = EXTRA_BY_KIND[k.kind].filter((t) => !list.some((c) => c.id === t.id))
        const on =
          list.filter((c) => selected.has(c.id)).length + items.filter((t) => selected.has(t.id)).length
        return (
          <section className="ins-card ins-wide" key={k.kind}>
            <div className="ins-card-head">
              <h3>{k.label}</h3>
              <span className="ins-card-hint">
                {on} of {list.length + items.length} selected
              </span>
            </div>
            <div className="chn-grid">
              {list.map((cfg) => (
                <Chip
                  key={cfg.id}
                  id={cfg.id}
                  label={cfg.label}
                  kindLabel={k.label}
                  icon={<ChannelIcon channel={cfg.id} size={16} />}
                />
              ))}
              {items.map((t) => (
                <Chip key={t.id} id={t.id} label={t.label} kindLabel={k.label} icon={<PickIcon path={t.path} color={t.color} />} />
              ))}
            </div>
          </section>
        )
      })}

      <div className="mtx-foot">
        Selected channels become the brand's roster (saved to its profile). Badge numbers show assets
        already on a channel. Connect a channel on the Connectors page to publish and pull real
        performance.
      </div>
    </div>
  )
}
