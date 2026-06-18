import { CHANNELS } from '../domain/channels'
import { clientForCampaign } from '../domain/clients'
import { messagingMap } from '../domain/messaging'
import { previewSpec } from '../domain/channelPreview'
import type { ChannelId, TrafficRow } from '../domain/types'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18) || 'brand'
const initial = (s: string) => (s.trim()[0] ?? 'B').toUpperCase()

const platformFamily = (channel: ChannelId): string => {
  if (channel === 'meta-ads' || channel === 'facebook') return 'meta'
  if (channel === 'instagram') return 'ig'
  if (channel === 'linkedin-ads' || channel === 'linkedin') return 'linkedin'
  if (channel === 'x-ads' || channel === 'x') return 'x'
  if (channel === 'tiktok-ads' || channel === 'tiktok') return 'tiktok'
  if (channel === 'youtube-ads' || channel === 'youtube') return 'youtube'
  if (channel === 'pinterest-ads' || channel === 'pinterest') return 'pinterest'
  if (channel === 'reddit-ads') return 'reddit'
  if (channel === 'snapchat-ads') return 'snap'
  return 'generic'
}

// ---- inline icons (stroke = currentColor) ----
const ic = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9 } as const
const Heart = () => (<svg {...ic}><path d="M12 21s-7-4.6-9.3-8.5C1 9.5 2.6 6 6 6c2 0 3.3 1.3 4 2.3C10.7 7.3 12 6 14 6c3.4 0 5 3.5 3.3 6.5C19 16.4 12 21 12 21z" /></svg>)
const Comment = () => (<svg {...ic}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>)
const Share = () => (<svg {...ic}><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v14" /></svg>)
const ThumbsUp = () => (<svg {...ic}><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3z" /><path d="M7 11l4-7a2 2 0 0 1 2 1v4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17 19H7" /></svg>)
const PaperPlane = () => (<svg {...ic}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>)
const Bookmark = () => (<svg {...ic}><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" /></svg>)
const Repost = () => (<svg {...ic}><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>)
const Views = () => (<svg {...ic}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></svg>)
const Globe = () => (<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: '-1px' }}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg>)

export function ChannelPreview({ row }: { row: TrafficRow }) {
  const ch = CHANNELS[row.channel]
  const spec = previewSpec(row.channel, row.assetType)
  const m = messagingMap(row)
  const paid = ch.kind === 'paid'
  const accent = ch.color
  const brand = clientForCampaign(row.campaign)
  const handle = '@' + slug(brand)
  const host = `${slug(brand)}.com`
  const fmt = spec.format
  const fam = platformFamily(row.channel)
  const adLabel =
    row.channel === 'x-ads' ? 'Ad' : paid ? (fam === 'linkedin' || fam === 'reddit' || fam === 'pinterest' ? 'Promoted' : 'Sponsored') : ''

  const pick = (slot: string): string => {
    for (const k of spec.slots[slot] ?? []) {
      const v = (m[k] ?? '').trim()
      if (v) return v
    }
    return ''
  }
  const pickAll = (slot: string): string[] => {
    const out: string[] = []
    for (const k of spec.slots[slot] ?? []) {
      const v = (m[k] ?? '').trim()
      if (v && !out.includes(v)) out.push(v)
    }
    return out
  }

  const Avatar = ({ size = 40, square = false, ring = false }: { size?: number; square?: boolean; ring?: boolean }) => (
    <span
      className={`cpv-av${ring ? ' cpv-av--ring' : ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: square ? Math.round(size * 0.22) : '50%',
        background: accent,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {initial(brand)}
    </span>
  )

  const MediaInner = ({ video }: { video?: boolean }) => (
    <>
      {row.extractedCopy?.trim() ? (
        <span className="cpv-media-copy">{row.extractedCopy}</span>
      ) : (
        <span className="cpv-media-hint">Creative</span>
      )}
      {video && <span className={`cpv-play${fam === 'youtube' ? ' cpv-play--yt' : ''}`} />}
    </>
  )
  const isVideo = fmt === 'video' || fmt === 'reel'

  const Cta = ({ label, variant }: { label: string; variant: string }) =>
    label ? <span className={`cpv-cta ${variant}`} style={variant === 'cpv-cta--accent' ? { background: accent } : undefined}>{label}</span> : null

  // ================= SOCIAL FEEDS =================
  const tall = fmt === 'story' || fmt === 'reel'

  // -- vertical short-form (TikTok, Reels-as-vertical, Shorts) --
  function Vertical() {
    const cap = pick('overlay') || pick('body')
    const cta = pick('cta')
    const reel = fam === 'tiktok' || row.channel === 'youtube' || row.channel === 'youtube-ads'
    return (
      <div className="cpv-frame cpv-vert">
        <div className="cpv-media cpv-media--tall">
          <MediaInner />
          <div className="cpv-vrail">
            <Avatar size={42} />
            <span className="cpv-vrail-i"><Heart /><b>21.4K</b></span>
            <span className="cpv-vrail-i"><Comment /><b>318</b></span>
            <span className="cpv-vrail-i"><Bookmark /><b>1.2K</b></span>
            <span className="cpv-vrail-i"><PaperPlane /><b>Share</b></span>
            <span className="cpv-vdisc" style={{ background: accent }} />
          </div>
          <div className="cpv-vinfo">
            <span className="cpv-vhandle">{handle}{adLabel ? ` · ${adLabel}` : ''}</span>
            {cap && <span className="cpv-vcap">{cap}</span>}
            <span className="cpv-vmusic">♪ original sound — {brand}</span>
          </div>
        </div>
        {(paid && cta) && (
          <div className="cpv-vert-cta" style={{ background: reel && row.channel.startsWith('youtube') ? '#FF0000' : '#FE2C55' }}>
            {cta}
          </div>
        )}
      </div>
    )
  }

  // -- Story (Meta / IG / FB / Snapchat) --
  function Story() {
    const overlay = pick('overlay') || pick('body')
    const cta = pick('cta')
    const ig = fam === 'ig'
    return (
      <div className="cpv-frame cpv-story">
        <div className="cpv-media cpv-media--tall">
          <MediaInner />
          <div className="cpv-story-progress"><i className="on" /><i /><i /></div>
          <div className="cpv-story-head">
            <Avatar size={26} ring={ig} />
            <span className="cpv-story-name">{ig ? slug(brand) : brand}</span>
            <span className="cpv-story-time">· {paid ? adLabel : '2h'}</span>
            <span className="cpv-story-x">✕</span>
          </div>
          {overlay && <div className="cpv-story-overlay">{overlay}</div>}
          {cta && (
            <div className="cpv-story-cta">
              <span className="cpv-snap-up">⌃ {cta}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // -- Meta / Facebook feed --
  function MetaFeed() {
    const body = pick('body')
    const headline = pick('headline')
    const description = pick('description')
    const cta = pick('cta')
    const overlay = pick('overlay')
    const cards = pickAll('cardHeadlines')
    return (
      <div className="cpv-frame cpv--meta">
        <div className="cpv-head">
          <Avatar />
          <div className="cpv-head-meta">
            <span className="cpv-name">{brand}</span>
            <span className="cpv-sub">{paid ? adLabel : '2h'} · <Globe /></span>
          </div>
          <span className="cpv-head-more">⋯</span>
        </div>
        {body && <p className="cpv-body">{body}</p>}

        {fmt === 'carousel' ? (
          <div className="cpv-carousel"><div className="cpv-track">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cpv-card">
                <div className="cpv-media cpv-media--square"><MediaInner /></div>
                <div className="cpv-card-foot">
                  <span className="cpv-card-title">{cards[i] || headline || 'Headline'}</span>
                  {cta && <span className="cpv-card-cta">{cta}</span>}
                </div>
              </div>
            ))}
          </div></div>
        ) : fmt === 'collection' ? (
          <>
            <div className="cpv-media cpv-media--wide"><MediaInner />{overlay && <span className="cpv-collection-title">{overlay}</span>}</div>
            <div className="cpv-tiles cpv-tiles--collection">{[0, 1, 2, 3].map((i) => <span key={i} />)}</div>
          </>
        ) : fmt === 'text' ? null : (
          <div className="cpv-media cpv-media--wide"><MediaInner video={isVideo} /></div>
        )}

        {(headline || cta) && fmt !== 'carousel' && (
          <div className="cpv-linkbar cpv-linkbar--meta">
            <div className="cpv-linkbar-text">
              <span className="cpv-linkbar-domain">{host}</span>
              <span className="cpv-linkbar-head">{headline || 'Learn more'}</span>
              {description && <span className="cpv-linkbar-desc">{description}</span>}
            </div>
            <Cta label={cta} variant="cpv-cta--meta" />
          </div>
        )}

        <div className="cpv-reactions"><span className="cpv-react-pile">👍❤️</span><span>You and 24 others</span></div>
        <div className="cpv-engage cpv-engage--fb">
          <span><ThumbsUp /> Like</span>
          <span><Comment /> Comment</span>
          <span><Share /> Share</span>
        </div>
      </div>
    )
  }

  // -- Instagram feed --
  function IgFeed() {
    const body = pick('body')
    const user = slug(brand)
    return (
      <div className="cpv-frame cpv--ig">
        <div className="cpv-head cpv-ig-head">
          <Avatar size={30} ring />
          <span className="cpv-name">{user}</span>
          <span className="cpv-head-more">⋯</span>
        </div>
        <div className="cpv-media cpv-media--square">
          <MediaInner video={isVideo} />
          {fmt === 'carousel' && <span className="cpv-ig-count">1/3</span>}
        </div>
        <div className="cpv-ig-actions">
          <Heart /><Comment /><PaperPlane />
          <span className="cpv-ig-spacer" />
          <Bookmark />
        </div>
        <div className="cpv-ig-likes">1,204 likes</div>
        {body && <p className="cpv-body"><b>{user}</b> {body}</p>}
      </div>
    )
  }

  // -- LinkedIn feed --
  function LiFeed() {
    const body = pick('body')
    const headline = pick('headline')
    const cta = pick('cta')
    const isCompany = row.assetType !== 'thought-leader'
    if (fmt === 'poll') {
      return (
        <div className="cpv-frame cpv--li">
          <LiHead isCompany={isCompany} />
          {body && <p className="cpv-body">{body}</p>}
          <div className="cpv-poll">
            {['Option A', 'Option B', 'Option C'].map((o) => (
              <div key={o} className="cpv-poll-opt cpv-poll-opt--li"><span>{o}</span></div>
            ))}
            <span className="cpv-poll-meta">128 votes · 3d left</span>
          </div>
          {liEngage()}
        </div>
      )
    }
    if (fmt === 'document') {
      return (
        <div className="cpv-frame cpv--li">
          <LiHead isCompany={isCompany} />
          {body && <p className="cpv-body">{body}</p>}
          <div className="cpv-media cpv-media--doc"><MediaInner /><span className="cpv-doc-page">1 / 8</span></div>
          <div className="cpv-doc-bar"><span className="cpv-doc-title">{headline || 'Document title'}</span></div>
          {liEngage()}
        </div>
      )
    }
    return (
      <div className="cpv-frame cpv--li">
        <LiHead isCompany={isCompany} />
        {body && <p className="cpv-body cpv-body--clamp">{body}</p>}
        {fmt !== 'text' && (
          fmt === 'carousel'
            ? <div className="cpv-carousel"><div className="cpv-track">{[0, 1, 2].map((i) => <div key={i} className="cpv-card"><div className="cpv-media cpv-media--square"><MediaInner /></div></div>)}</div></div>
            : <div className="cpv-media cpv-media--wide"><MediaInner video={isVideo} /></div>
        )}
        {(headline || cta) && (
          <div className="cpv-linkbar cpv-linkbar--li">
            <div className="cpv-linkbar-text">
              <span className="cpv-linkbar-head">{headline || 'Learn more'}</span>
              <span className="cpv-linkbar-domain">{host}</span>
            </div>
            <Cta label={cta} variant="cpv-cta--outline" />
          </div>
        )}
        {liEngage()}
      </div>
    )
    function LiHead({ isCompany }: { isCompany: boolean }) {
      return (
        <div className="cpv-head">
          <Avatar square={isCompany} />
          <div className="cpv-head-meta">
            <span className="cpv-name">{brand}</span>
            <span className="cpv-sub">{paid ? 'Promoted' : '4,182 followers'}</span>
            {!paid && <span className="cpv-sub cpv-sub2">2h · <Globe /></span>}
          </div>
          {!paid && <span className="cpv-head-follow">+ Follow</span>}
          <span className="cpv-head-more">⋯</span>
        </div>
      )
    }
    function liEngage() {
      return (
        <>
          <div className="cpv-reactions"><span className="cpv-react-pile">👍❤️💡</span><span>1,204 · 86 comments</span></div>
          <div className="cpv-engage cpv-engage--li">
            <span><ThumbsUp /> Like</span>
            <span><Comment /> Comment</span>
            <span><Repost /> Repost</span>
            <span><PaperPlane /> Send</span>
          </div>
        </>
      )
    }
  }

  // -- X feed --
  function XFeed() {
    const body = pick('body')
    const headline = pick('headline')
    const cta = pick('cta')
    return (
      <div className="cpv-frame cpv--x">
        <div className="cpv-x-head">
          <Avatar size={40} />
          <div className="cpv-x-id">
            <span className="cpv-x-name">{brand}</span>
            <span className="cpv-x-handle">{handle} · now{paid ? ' · Ad' : ''}</span>
          </div>
          <span className="cpv-x-more">⋯</span>
        </div>
        {body && <p className="cpv-x-text">{body}</p>}
        {fmt === 'poll' ? (
          <div className="cpv-poll">{['Yes', 'No'].map((o) => <div key={o} className="cpv-poll-opt"><span>{o}</span></div>)}</div>
        ) : fmt !== 'text' ? (
          headline || cta ? (
            <div className="cpv-x-card">
              <div className="cpv-media cpv-media--wide16"><MediaInner video={isVideo} /></div>
              <div className="cpv-x-card-foot">
                <span className="cpv-x-card-domain">{host}</span>
                <span className="cpv-x-card-title">{headline || 'Learn more'}</span>
              </div>
            </div>
          ) : (
            <div className="cpv-media cpv-media--wide16 cpv-media--xr"><MediaInner video={isVideo} /></div>
          )
        ) : null}
        <div className="cpv-x-actions">
          <span><Comment /> 24</span>
          <span><Repost /> 18</span>
          <span><Heart /> 312</span>
          <span><Views /> 12K</span>
          <span><Share /></span>
        </div>
      </div>
    )
  }

  // -- YouTube organic --
  function YtFeed() {
    const title = pick('body') || pick('overlay')
    const community = row.assetType === 'community'
    if (community) {
      return (
        <div className="cpv-frame">
          <div className="cpv-head"><Avatar size={36} /><div className="cpv-head-meta"><span className="cpv-name">{brand}</span><span className="cpv-sub">2d</span></div><span className="cpv-head-more">⋯</span></div>
          {title && <p className="cpv-body">{title}</p>}
          <div className="cpv-engage cpv-yt-react"><span><ThumbsUp /> 1.2K</span><span><Comment /> 84</span></div>
        </div>
      )
    }
    return (
      <div className="cpv-frame cpv-yt">
        <div className="cpv-media cpv-media--wide16">
          <MediaInner video />
          <span className="cpv-yt-dur">12:04</span>
        </div>
        <div className="cpv-yt-meta">
          <span className="cpv-yt-title">{title || 'Video title'}</span>
          <div className="cpv-yt-chan">
            <Avatar size={34} />
            <div className="cpv-yt-cname"><span>{brand}</span><span className="cpv-sub">24.1K subscribers</span></div>
            <span className="cpv-yt-sub-btn">Subscribe</span>
          </div>
        </div>
      </div>
    )
  }

  // -- Pinterest --
  function PinFeed() {
    const title = pick('headline') || pick('overlay')
    const description = pick('description')
    return (
      <div className="cpv-frame cpv-pin">
        <div className="cpv-media cpv-media--pin">
          <MediaInner video={isVideo} />
          <span className="cpv-pin-save">Save</span>
        </div>
        {paid && <span className="cpv-pin-promoted">Promoted by {brand}</span>}
        {title && <span className="cpv-pin-title">{title}</span>}
        {description && <span className="cpv-pin-desc">{description}</span>}
        <span className="cpv-pin-attr"><span className="cpv-av cpv-av--sm" style={{ background: accent }}>{initial(brand)}</span>{brand}</span>
      </div>
    )
  }

  // -- Reddit --
  function RedditFeed() {
    const title = pick('title') || pick('headline') || pick('body')
    const body = pick('body')
    return (
      <div className="cpv-frame cpv-reddit">
        <div className="cpv-rdt-top">
          <span className="cpv-rdt-icon" style={{ background: accent }} />
          <span className="cpv-rdt-sub">r/{slug(brand)}</span>
          {paid && <span className="cpv-rdt-promoted">Promoted</span>}
        </div>
        <span className="cpv-rdt-title">{title || 'Post title'}</span>
        {fmt !== 'text' && <div className="cpv-media cpv-media--reddit"><MediaInner video={isVideo} /></div>}
        {fmt === 'text' && body && title !== body && <p className="cpv-body">{body}</p>}
        {paid && <div className="cpv-rdt-cta"><span>{host}</span><Cta label={pick('cta') || 'Learn more'} variant="cpv-cta--accent" /></div>}
        <div className="cpv-rdt-actions"><span className="cpv-rdt-vote">▲ Vote ▼</span><span><Comment /> 42</span><span><Share /> Share</span></div>
      </div>
    )
  }

  // ================= NON-FEED =================
  function Search() {
    const business = pick('header')
    const path = pick('url')
    const headlines = pickAll('headline').slice(0, 3)
    const descriptions = pickAll('description')
    const breadcrumb = path ? ' › ' + path.replace(/\//g, ' › ') : ''
    return (
      <div className="cpv-frame cpv-search">
        <div className="cpv-serp-sponsored">Sponsored</div>
        <div className="cpv-serp-url">
          <span className="cpv-serp-fav" style={{ background: accent }} />
          <div className="cpv-serp-site">
            <span className="cpv-serp-biz">{business || brand}</span>
            <span className="cpv-serp-host">{host}{breadcrumb}</span>
          </div>
        </div>
        <div className="cpv-serp-title">{headlines.join(' - ') || 'Your headline'}</div>
        <div className="cpv-serp-desc">{descriptions.join(' ') || 'Your ad description.'}</div>
        {fmt === 'call' && <span className="cpv-serp-call">📞 Call (555) 012-3456</span>}
      </div>
    )
  }

  function Display() {
    const business = pick('header')
    const headline = pick('headline') || pick('overlay')
    const description = pick('description')
    const cta = pick('cta')
    const ytAd = row.channel === 'youtube-ads'
    if (ytAd && fmt !== 'product') {
      return (
        <div className="cpv-frame cpv-ytad">
          <div className="cpv-media cpv-media--wide16">
            <MediaInner video />
            <span className="cpv-yt-adtag">Ad</span>
            <span className="cpv-yt-skip">Skip Ad ▷|</span>
          </div>
          <div className="cpv-ytad-companion">
            <Avatar size={28} />
            <div className="cpv-ytad-text"><span className="cpv-name">{headline || brand}</span><span className="cpv-sub">{business || brand}</span></div>
            <span className="cpv-cta cpv-cta--yt">{cta || 'Visit'}</span>
          </div>
        </div>
      )
    }
    return (
      <div className="cpv-frame cpv-display">
        {fmt === 'product' ? (
          <div className="cpv-prods">{[0, 1, 2].map((i) => (
            <div key={i} className="cpv-prod"><div className="cpv-media cpv-media--square" /><span className="cpv-prod-price">$—</span><span className="cpv-prod-title">Product {i + 1}</span></div>
          ))}</div>
        ) : (
          <div className="cpv-media cpv-media--wide"><MediaInner video={isVideo} /></div>
        )}
        <div className="cpv-display-body">
          {headline && <span className="cpv-display-head">{headline}</span>}
          {description && <span className="cpv-display-desc">{description}</span>}
          <div className="cpv-display-foot">
            <span className="cpv-display-biz"><span className="cpv-serp-fav" style={{ background: accent }} /> {business || brand} · {paid ? 'Sponsored' : 'Ad'}</span>
            <Cta label={cta} variant="cpv-cta--gads" />
          </div>
        </div>
      </div>
    )
  }

  function Email() {
    const subject = pick('subject')
    const previewT = pick('preview')
    const hero = pick('overlay')
    const body = pick('body')
    const cta = pick('cta')
    return (
      <div className="cpv-frame cpv-email">
        <div className="cpv-email-from">
          <Avatar size={38} />
          <div className="cpv-email-fmeta">
            <span className="cpv-email-row1"><b>{brand}</b><span className="cpv-email-time">9:41 AM</span></span>
            <span className="cpv-email-row2">to me · {slug(brand)}@{host}</span>
          </div>
        </div>
        <div className="cpv-email-subject">{subject || 'Subject line'}</div>
        {previewT && <div className="cpv-email-preview">{previewT}</div>}
        <div className="cpv-email-body">
          {hero && <div className="cpv-media cpv-media--wide"><MediaInner /><span className="cpv-collection-title">{hero}</span></div>}
          {body && <p className="cpv-email-text">{body}</p>}
          <div className="cpv-email-cta"><Cta label={cta} variant="cpv-cta--accent" /></div>
        </div>
      </div>
    )
  }

  function Landing() {
    const headline = pick('headline')
    const description = pick('description')
    const body = pick('body')
    const proof = pick('proof')
    const cta = pick('cta')
    const form = row.assetType === 'lead-capture' || row.assetType === 'waitlist' || row.assetType === 'webinar-reg'
    return (
      <div className="cpv-frame cpv-landing">
        <div className="cpv-browser">
          <span className="cpv-dot" /><span className="cpv-dot" /><span className="cpv-dot" />
          <span className="cpv-url">{host}/{slug(row.campaign ?? 'lp')}</span>
        </div>
        <div className="cpv-lp-nav">
          <span className="cpv-av cpv-av--sm" style={{ background: accent }}>{initial(brand)}</span>
          <span className="cpv-name">{brand}</span>
          <span className="cpv-cta cpv-cta--accent cpv-lp-navcta" style={{ background: accent }}>{cta || 'Sign up'}</span>
        </div>
        <div className="cpv-hero">
          <span className="cpv-hero-h1">{headline || 'Your headline'}</span>
          {description && <span className="cpv-hero-sub">{description}</span>}
          {body && <p className="cpv-hero-body">{body}</p>}
          {proof && <span className="cpv-hero-proof">“{proof}”</span>}
          {form ? (
            <div className="cpv-lp-form">
              <span className="cpv-lp-input">you@email.com</span>
              <Cta label={cta || 'Get access'} variant="cpv-cta--accent" />
            </div>
          ) : (
            cta && <Cta label={cta} variant="cpv-cta--accent" />
          )}
        </div>
      </div>
    )
  }

  function Blog() {
    const title = pick('headline')
    const dek = pick('description')
    const body = pick('body')
    return (
      <div className="cpv-frame cpv-blog">
        <span className="cpv-blog-kicker">{brand} · Blog</span>
        <span className="cpv-blog-title">{title || 'Article title'}</span>
        {dek && <span className="cpv-blog-dek">{dek}</span>}
        <div className="cpv-blog-byline"><span className="cpv-av cpv-av--sm" style={{ background: accent }}>{initial(brand)}</span>{brand} · 5 min read</div>
        <div className="cpv-media cpv-media--wide cpv-blog-img"><MediaInner /></div>
        {body && <p className="cpv-blog-body">{body}</p>}
      </div>
    )
  }

  function Lead() {
    const title = pick('headline')
    const meta = pick('meta')
    const description = pick('description')
    const cta = pick('cta')
    const kind = (row.assetType || 'guide').toUpperCase()
    return (
      <div className="cpv-frame cpv-lead">
        <div className="cpv-lead-cover" style={{ background: accent }}>
          <span className="cpv-lead-cover-kicker">{kind}</span>
          <span className="cpv-lead-cover-title">{title || 'Lead magnet'}</span>
        </div>
        <div className="cpv-lead-body">
          <span className="cpv-lead-badge">{kind}</span>
          <span className="cpv-lead-title">{title || 'Lead magnet'}</span>
          {meta && <span className="cpv-lead-meta">{meta}</span>}
          {description && <p className="cpv-lead-desc">{description}</p>}
          <Cta label={cta || 'Download'} variant="cpv-cta--accent" />
        </div>
      </div>
    )
  }

  function Notification() {
    const body = pick('body')
    const url = pick('url')
    const ctas = pickAll('cta')
    const title = pick('header')
    if (row.channel === 'sms') {
      return (
        <div className="cpv-frame cpv-sms">
          <div className="cpv-sms-meta">{brand} · Text Message · now</div>
          <div className="cpv-bubble">
            {body || 'Your message'}
            {url && <span className="cpv-bubble-link">{url}</span>}
          </div>
        </div>
      )
    }
    if (row.channel === 'push') {
      return (
        <div className="cpv-frame cpv-pushwrap">
          <div className="cpv-push">
            <span className="cpv-av" style={{ background: accent, width: 34, height: 34, borderRadius: '22%', fontSize: 15 }}>{initial(brand)}</span>
            <div className="cpv-push-meta">
              <span className="cpv-push-line1"><span className="cpv-push-app">{brand}</span><span className="cpv-push-time">now</span></span>
              <span className="cpv-push-title">{title || 'New message'}</span>
              <span className="cpv-push-body">{body}</span>
            </div>
          </div>
        </div>
      )
    }
    // LinkedIn conversation / message ad
    return (
      <div className="cpv-frame cpv-chat">
        <div className="cpv-chat-head"><Avatar size={28} square /><span className="cpv-chat-name">{brand}</span><span className="cpv-chat-spon">Sponsored</span></div>
        <div className="cpv-chat-row"><div className="cpv-chat-bubble">{body || 'Your message'}</div></div>
        {ctas.length > 0 && (
          <div className="cpv-chat-replies">
            {ctas.map((c) => <span key={c} className="cpv-cta cpv-cta--outline" style={{ color: accent, borderColor: accent }}>{c}</span>)}
          </div>
        )}
      </div>
    )
  }

  const render = () => {
    if (spec.archetype === 'search') return <Search />
    if (spec.archetype === 'display') return <Display />
    if (spec.archetype === 'email') return <Email />
    if (spec.archetype === 'landing') return <Landing />
    if (spec.archetype === 'blog') return <Blog />
    if (spec.archetype === 'lead') return <Lead />
    if (spec.archetype === 'notification') return <Notification />
    // feed family routing
    if (fam === 'tiktok' || row.assetType === 'short' || row.assetType === 'shorts') return <Vertical />
    if (tall) return fam === 'tiktok' ? <Vertical /> : <Story />
    if (fam === 'meta') return <MetaFeed />
    if (fam === 'ig') return <IgFeed />
    if (fam === 'linkedin') return <LiFeed />
    if (fam === 'x') return <XFeed />
    if (fam === 'youtube') return <YtFeed />
    if (fam === 'pinterest') return <PinFeed />
    if (fam === 'reddit') return <RedditFeed />
    if (fam === 'snap') return <Story />
    return <MetaFeed />
  }

  return <div className="cpv">{render()}</div>
}
