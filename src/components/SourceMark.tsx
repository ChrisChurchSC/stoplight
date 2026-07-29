/**
 * Small identifying marks for data sources: the aggregator a table came through, and the platform it
 * came from.
 *
 * WHY A MARK AND NOT JUST THE NAME. A Data source card is read at a glance, often zoomed out, and
 * "Top search queries · World Within" does not tell you at that size whether you are looking at
 * search data or LinkedIn data. Colour and shape do.
 *
 * WHAT THESE ARE. Simple geometry in each platform's own colour, drawn here rather than fetched:
 * the app ships no remote assets, and a logo that 404s is worse than none. They identify a service
 * the way a favicon does; they are not reproductions of anyone's trademark artwork, and the
 * aggregators (which have no widely-recognised glyph) get a monogram instead of an invented logo.
 */

/** Platform colours, so a mark is recognisable before the label is read. */
const TONE: Record<string, string> = {
  google_search_console: '#4285F4',
  google_analytics_4: '#E8710A',
  youtube_analytics: '#FF0033',
  linkedin_company_pages: '#0A66C2',
  facebook_pages: '#C13584',
  tiktok: '#25F4EE',
  email: '#8B5CF6',
  crm: '#10B981',
  summer: '#F5A524',
  supermetrics: '#00B2A9',
  databox: '#6C5CE7',
}

const box = { width: 14, height: 14, viewBox: '0 0 24 24' } as const

/** A monogram tile, for sources with no simple recognisable glyph. */
function Monogram({ text, tone }: { text: string; tone: string }) {
  return (
    <svg {...box} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" fill={tone} />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize={text.length > 1 ? 9 : 12}
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        {text}
      </text>
    </svg>
  )
}

export function SourceMark({ id }: { id: string }) {
  const tone = TONE[id] ?? 'currentColor'
  switch (id) {
    // Bars: what an analytics property reports.
    case 'google_analytics_4':
      return (
        <svg {...box} aria-hidden="true">
          <rect x="4" y="13" width="4" height="8" rx="1.6" fill={tone} opacity="0.55" />
          <rect x="10" y="8" width="4" height="13" rx="1.6" fill={tone} opacity="0.78" />
          <rect x="16" y="3" width="4" height="18" rx="1.6" fill={tone} />
        </svg>
      )
    // A magnifier: the search surface.
    case 'google_search_console':
      return (
        <svg {...box} aria-hidden="true" fill="none" stroke={tone} strokeWidth="2.4" strokeLinecap="round">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5L21 21" />
        </svg>
      )
    // Rounded tile with a play triangle.
    case 'youtube_analytics':
      return (
        <svg {...box} aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="4.5" fill={tone} />
          <path d="M10 8.8l6 3.2-6 3.2z" fill="#fff" />
        </svg>
      )
    case 'linkedin_company_pages':
      return <Monogram text="in" tone={tone} />
    case 'facebook_pages':
      return <Monogram text="f" tone={tone} />
    case 'tiktok':
      return <Monogram text="t" tone={tone} />
    // A tray: mail.
    case 'email':
      return (
        <svg {...box} aria-hidden="true" fill="none" stroke={tone} strokeWidth="2.2" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M3.5 7.5L12 13l8.5-5.5" />
        </svg>
      )
    case 'crm':
      return (
        <svg {...box} aria-hidden="true" fill="none" stroke={tone} strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="8" r="3.4" />
          <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
        </svg>
      )
    // Aggregators: a monogram rather than an invented logo.
    case 'summer':
      return <Monogram text="S" tone={tone} />
    case 'supermetrics':
      return <Monogram text="SM" tone={tone} />
    case 'databox':
      return <Monogram text="DB" tone={tone} />
    // Unknown source: a neutral tile, so layout does not shift when something new appears.
    default:
      return (
        <svg {...box} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
        </svg>
      )
  }
}
