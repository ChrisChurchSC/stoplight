import type { BrandDataset } from './brandDataset'

/**
 * WHAT A DATA SET IS WORTH, AND WHICH OF ITS NUMBERS MAY BE QUOTED.
 *
 * Two functions, one file, because they answer halves of the same question and must never disagree.
 * `datasetProvenance` decides what a table IS. `citableFigures` decides what may leave it. Six
 * surfaces read the first (the canvas card, the picker sub-line, the contribution panel, the data set
 * page, the gallery, the coherence check) and exactly one path reads the second (the copy writer), so
 * a table cannot look measured on the card and arrive as evidence it has not earned.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the app computes every number that reaches the writer, and
 * the writer only quotes it. No model does arithmetic over a table. Every `value` below is either a
 * cell taken verbatim or a string this file formatted from exactly one cell, which is what makes a
 * figure defensible: you can point at the cell it came from.
 *
 * CITABLE IS THE EXCEPTION, NOT THE DEFAULT. A table earns automatic citation by being measured or
 * uploaded, unedited, and inside its own window. Everything else is still useful for planning and
 * still wireable. Its numbers reach copy only when a person types one into "The figure" and owns it.
 */

export type DatasetTier = 'measured' | 'uploaded' | 'typed' | 'sketched' | 'edited' | 'stale'

export interface DatasetProvenance {
  tier: DatasetTier
  /** Short label for a card read at a glance. */
  badge: string
  /** The full sentence, for the inspector and the tooltip. */
  detail: string
  tone: 'plain' | 'amber'
  /** May the app hand figures from this table to the copy writer without a human typing them? */
  citable: boolean
  /** Why not, in the user's words. Empty when citable. */
  why: string
  /** The table is the top of something rather than all of it. */
  partial: boolean
  /** The stretch of time the numbers cover, when the app knows it. */
  periodLabel?: string
}

const day = (t: number): string =>
  new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Parse a date-only coverage string as LOCAL noon.
 *
 * "2026-07-25" parses as UTC midnight, which renders as 24 July anywhere west of Greenwich, so the
 * card claimed a window ending the day before the one the warehouse reported. Noon puts it far enough
 * from both boundaries that no timezone can move the date.
 */
const dateOnly = (v: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime()
  return Date.parse(v)
}

/** Window in days, parsed out of the stored query ("gsc-pages:90d"). */
export function windowDays(query?: string): number | undefined {
  const m = /:(\d+)d$/.exec(query ?? '')
  return m ? Number(m[1]) : undefined
}

/** The pull this table came from ("gsc-pages"), which is how columns are typed. */
export function pullId(query?: string): string | undefined {
  const q = query ?? ''
  const i = q.lastIndexOf(':')
  return i > 0 ? q.slice(0, i) : q || undefined
}

/**
 * The period a pulled table covers, anchored to WHEN IT WAS FETCHED rather than to now.
 *
 * "The last 90 days" silently re-anchors itself every time it is read, so a table pulled in March and
 * quoted in July would claim to describe July. The end of the window is the day of the pull, always.
 */
export function periodOf(ds: BrandDataset): string | undefined {
  const s = ds.source
  if (!s || s.kind !== 'aggregator') return undefined
  const d = windowDays(s.query)
  // COVERAGE WINS over the request. It is what the rows say about themselves.
  if (s.coverage?.to) {
    const to = dateOnly(s.coverage.to)
    if (!Number.isNaN(to)) return d ? `${d} days to ${day(to)}` : `to ${day(to)}`
  }
  if (!s.syncedAt) return undefined
  // No coverage: do NOT date this to the request. Saying "the 90 days to today" when the rows end
  // four days ago is the exact false precision this field exists to stop.
  return undefined
}

/** The end of what the rows cover, for staleness. Falls back to the request when nothing else. */
export function coverageEnd(ds: BrandDataset): number | undefined {
  const s = ds.source
  if (!s || s.kind !== 'aggregator') return undefined
  if (s.coverage?.to) {
    const t = dateOnly(s.coverage.to)
    if (!Number.isNaN(t)) return t
  }
  return s.syncedAt
}

/**
 * What this table is, in one answer.
 *
 * PRECEDENCE MATTERS AND IS DELIBERATE: sketched beats everything (an invented table stays invented
 * however it is later handled), then edited (a touched table is no longer what the source said), then
 * stale, then how it arrived. Reading them in any other order lets a worse state hide behind a
 * better one.
 */
export function datasetProvenance(ds: BrandDataset, now: number = Date.now()): DatasetProvenance {
  const s = ds.source
  const partial = !!(s && s.kind === 'aggregator' && s.truncated)
  const partialSuffix = partial ? ' Top 500 rows.' : ''
  const period = periodOf(ds)

  if (s?.kind === 'composite') {
    return {
      tier: 'sketched',
      badge: 'Sketched, not measured',
      detail: `Sketched, not measured. Every figure here was invented to show the shape, on ${day(s.generatedAt)}.`,
      tone: 'amber',
      citable: false,
      why: 'This is a sketch, so the writer is told nothing about it, not even its name.',
      partial: false,
    }
  }

  // An edit outranks how the table arrived. A pulled table typed over is not a pulled table.
  if (ds.editedAt && (s?.kind === 'aggregator' || s?.kind === 'upload')) {
    const n = ds.editedCells ?? 0
    const came = s.kind === 'aggregator' ? sourceName(ds) : s.filename
    return {
      tier: 'edited',
      badge: 'Edited after it came in',
      detail: `Edited after it came in. ${n} cell${n === 1 ? '' : 's'} changed since ${came} returned this.${partialSuffix}`,
      tone: 'amber',
      citable: false,
      why: `${n} cell${n === 1 ? ' was' : 's were'} changed by hand after ${came} returned this, so it is no longer what it said.`,
      partial,
      periodLabel: period,
    }
  }

  if (s?.kind === 'aggregator') {
    /**
     * STALE ONCE ITS OWN WINDOW HAS CLOSED. A 30 day pull expires in 30 days and a 365 day pull in a
     * year, because the window is the user's own statement of how current this needs to be. A single
     * hardcoded 90 would be a number nobody could defend to them.
     *
     * A stale set stops being citable, so its numbers leave the copy writer until it is pulled again.
     * That is deliberately stronger than a warning: a figure quoted as current when its window shut
     * four months ago is wrong in the one way this app must not be.
     */
    const win = windowDays(s.query)
    const end = coverageEnd(ds)
    const ageDays = end ? Math.floor((now - end) / 86_400_000) : undefined
    if (win && ageDays !== undefined && ageDays > win) {
      return {
        tier: 'stale',
        badge: period ? `${sourceName(ds)}, ${period}. Old now.` : `${sourceName(ds)}. Old now.`,
        detail: `${sourceName(ds)}${period ? `, ${period}` : ''}. That window closed ${ageDays - win} day${ageDays - win === 1 ? '' : 's'} ago.${partialSuffix}`,
        tone: 'amber',
        citable: false,
        why: period
          ? `This covers ${period}, and that window closed ${ageDays - win} days ago. Its numbers are held back until you pull it again.`
          : 'This is older than the window it was pulled for. Its numbers are held back until you pull it again.',
        partial,
        periodLabel: period,
      }
    }
    return {
      tier: 'measured',
      badge: period ? `${sourceName(ds)}, ${period}` : sourceName(ds),
      // Without coverage the source did not say what it returned, and the request is not a substitute.
      detail: period
        ? `${sourceName(ds)}, ${period}.${partialSuffix}`
        : `${sourceName(ds)}. We asked for ${win ? `${win} days` : 'a window'}. What came back does not say what it covers.${partialSuffix}`,
      tone: 'plain',
      citable: true,
      why: '',
      partial,
      periodLabel: period,
    }
  }

  if (s?.kind === 'upload') {
    return {
      tier: 'uploaded',
      badge: `From ${s.filename}`,
      detail: `From ${s.filename}, ${day(s.importedAt)}.`,
      tone: 'plain',
      citable: true,
      why: '',
      partial: false,
    }
  }

  // No source, or a hand-made sheet. Typed numbers are real to the person who typed them and mean
  // nothing to anyone else, so they are never quoted automatically.
  return {
    tier: 'typed',
    badge: 'Typed by hand',
    detail: 'Typed by hand.',
    tone: 'plain',
    citable: false,
    why: 'A table you typed is not evidence on its own. Write the figure you want cited into The figure, so the claim belongs to somebody.',
    partial: false,
  }
}

/** The platform this came from, in the user's words. */
function sourceName(ds: BrandDataset): string {
  const s = ds.source
  if (!s || s.kind !== 'aggregator') return 'a connected source'
  const named: Record<string, string> = {
    google_search_console: 'Search Console',
    google_analytics_4: 'GA4',
    youtube_analytics: 'YouTube',
    linkedin_company_pages: 'LinkedIn',
  }
  return named[s.service ?? ''] ?? 'a connected source'
}

// ---------------------------------------------------------------------------------------------

export interface CitableFigure {
  /** Stable across a re-pull: dataset + column + row key, never a row index. */
  id: string
  /** The number as the writer will quote it, character for character. */
  value: string
  /** Read aloud in the panel and in a coherence break, so it is written for a person. */
  label: string
  basis: 'cell' | 'sum' | 'share' | 'rank'
  period?: string
  source: string
  partial: boolean
  datasetId: string
}

/** Per-set cap. A card that contributes 30 numbers is not contributing, it is flooding. */
export const MAX_FIGURES_PER_SET = 8
/** Per-campaign cap, applied after flattening every wired set. */
export const MAX_FIGURES_PER_CAMPAIGN = 12

/**
 * Which columns hold the dimension and which hold measures, keyed off the PULL ID rather than the
 * header text.
 *
 * The warehouse and the direct route return different headers for the same question (Summer's
 * gsc-queries says "Avg position", a direct Search Console pull could be relabelled tomorrow), and an
 * upload has whatever somebody typed. Matching on the pull id is the one key that survives both.
 */
const PULL_SHAPE: Record<string, { dim: number; measures: { col: number; noun: string; unit?: string }[] }> = {
  'gsc-queries': { dim: 0, measures: [{ col: 1, noun: 'clicks' }, { col: 2, noun: 'impressions' }] },
  'gsc-pages': { dim: 0, measures: [{ col: 1, noun: 'clicks' }, { col: 2, noun: 'impressions' }] },
  'ga4-channels': { dim: 0, measures: [{ col: 1, noun: 'sessions' }, { col: 2, noun: 'users' }] },
  'ga4-pages': { dim: 0, measures: [{ col: 1, noun: 'views' }, { col: 2, noun: 'users' }] },
  'yt-videos': { dim: 0, measures: [{ col: 1, noun: 'views' }, { col: 2, noun: 'minutes watched' }] },
  'li-posts': { dim: 1, measures: [{ col: 2, noun: 'impressions' }, { col: 3, noun: 'clicks' }] },
}

const numeric = (v: string): number | null => {
  const t = (v ?? '').trim().replace(/,/g, '').replace(/%$/, '')
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

/** Group digits the way a person writes them, without touching the value's own precision. */
const grouped = (n: number): string => n.toLocaleString('en-US')

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

/**
 * The figures this table may contribute, each traceable to a cell.
 *
 * Every refusal here is enforced in code rather than asked for in a prompt, because a prompt is a
 * request and this has to be a rule.
 */
export function citableFigures(ds: BrandDataset, now: number = Date.now()): CitableFigure[] {
  // Belt and braces on the sketched exclusion: checked here as well as via the tier, so the rule
  // survives a future caller that reaches this function by another route.
  if (ds.source?.kind === 'composite') return []

  const prov = datasetProvenance(ds, now)
  if (!prov.citable) return []

  const out: CitableFigure[] = []
  const push = (f: Omit<CitableFigure, 'datasetId' | 'partial' | 'source' | 'period'>) => {
    if (out.length >= MAX_FIGURES_PER_SET) return
    out.push({ ...f, datasetId: ds.id, partial: prov.partial, source: prov.badge, period: prov.periodLabel })
  }

  const shape = PULL_SHAPE[pullId(ds.source?.kind === 'aggregator' ? ds.source.query : undefined) ?? '']
  const rows = ds.rows.filter((r) => r.some((c) => (c ?? '').trim() !== ''))
  if (!rows.length) return []

  if (shape) {
    const dimName = ds.columns[shape.dim] ?? 'row'
    for (const m of shape.measures) {
      const colLabel = ds.columns[m.col] ?? m.noun
      const ranked = rows
        .map((r) => ({ key: (r[shape.dim] ?? '').trim(), n: numeric(r[m.col] ?? '') }))
        .filter((x): x is { key: string; n: number } => x.key !== '' && x.n !== null)
      if (!ranked.length) continue
      ranked.sort((a, b) => b.n - a.n)
      const top = ranked[0]

      // The top row's own value, verbatim from one cell.
      push({
        id: `${ds.id}:${slug(colLabel)}:${slug(top.key)}`,
        value: grouped(top.n),
        label: `${colLabel} on ${dimName.toLowerCase()} ${top.key}`,
        basis: 'cell',
      })

      /**
       * A SUM OVER A TRUNCATED TABLE IS NOT A TOTAL, and a share computed from one is not a share.
       * The pull stopped at the row cap, so the denominator is missing and every percentage built on
       * it would be too high. Rank survives truncation because it names its own population.
       */
      if (!prov.partial) {
        const total = ranked.reduce((n, x) => n + x.n, 0)
        push({
          id: `${ds.id}:${slug(colLabel)}:total`,
          value: grouped(total),
          label: `Total ${colLabel.toLowerCase()} across every ${dimName.toLowerCase()} in the table`,
          basis: 'sum',
        })
        if (total > 0) {
          push({
            id: `${ds.id}:${slug(colLabel)}:share`,
            value: `${Math.round((top.n / total) * 1000) / 10}%`,
            label: `Share of ${colLabel.toLowerCase()} from ${dimName.toLowerCase()} ${top.key}`,
            basis: 'share',
          })
        }
      } else {
        push({
          id: `${ds.id}:${slug(colLabel)}:rank`,
          value: grouped(top.n),
          // The label names the population, so a truncated leader cannot read as an outright leader.
          label: `The highest ${colLabel.toLowerCase()} of the ${rows.length} rows we fetched, ${dimName.toLowerCase()} ${top.key}`,
          basis: 'rank',
        })
      }
    }
    return out
  }

  /**
   * AN UPLOAD, whose shape the app does not know. Sniff a numeric column, take its largest cell
   * verbatim, and attach NO PERIOD: nothing here says what stretch of time somebody's CSV covers,
   * and inventing one would be the exact failure this file exists to prevent.
   */
  const firstText = ds.columns.findIndex((_, i) => rows.every((r) => numeric(r[i] ?? '') === null))
  const dim = firstText >= 0 ? firstText : 0
  for (let c = 0; c < ds.columns.length; c++) {
    if (c === dim) continue
    const vals = rows.map((r) => ({ key: (r[dim] ?? '').trim(), n: numeric(r[c] ?? '') })).filter((x): x is { key: string; n: number } => x.n !== null)
    if (vals.length < Math.max(2, Math.ceil(rows.length / 2))) continue
    vals.sort((a, b) => b.n - a.n)
    const colLabel = ds.columns[c] || `column ${c + 1}`
    out.push({
      id: `${ds.id}:${slug(colLabel)}:${slug(vals[0].key || 'top')}`,
      value: grouped(vals[0].n),
      label: vals[0].key ? `${colLabel} for ${vals[0].key}` : `The highest ${colLabel.toLowerCase()} in the table`,
      basis: 'cell',
      datasetId: ds.id,
      partial: false,
      source: prov.badge,
      period: undefined,
    })
    if (out.length >= MAX_FIGURES_PER_SET) break
  }
  return out
}

// ---------------------------------------------------------------------------------------------

/**
 * WHAT THE TABLE SAYS.
 *
 * A grid of 500 rows is not a decision, and the gap between "here are your search queries" and "so
 * write about this" is the whole point of the card. Everything below is plain arithmetic: no model
 * reads the table, so this works with no API key, costs nothing, and returns the same answer twice.
 *
 * WHAT IT WILL NOT SAY, enforced here rather than asked for in a prompt:
 *   - No trend, ever, from a single pull. One pull is one snapshot. "Up" and "down" need two.
 *   - No share of a truncated table. The denominator is missing, so every percentage would be too
 *     high, and a share that is too high is worse than no share.
 *   - No rate from a tiny denominator. One impression and one click is a 100% clickthrough rate and
 *     means nothing, which is how a table of noise becomes a confident sentence.
 *   - Nothing at all from a sketched table, including its headline.
 *   - No comparison to the benchmark constants in this repo: they are PAID CPM, CTR and CVR, and
 *     holding organic search up against a paid benchmark is a category error that reads as insight.
 */

export interface Finding {
  id: string
  /** The sentence a person reads. Every number in it is also one of `figures`. */
  claim: string
  /** Which columns and how many rows it rests on, so the claim can be checked. */
  detail: string
  figures: CitableFigure[]
}

export interface DatasetRead {
  ok: boolean
  headline?: string
  /** The clause after the headline: "The top 10 pages are 58% of them." */
  read?: string
  period?: string
  findings: Finding[]
  caveats: string[]
}

/**
 * Floors, each naming what it protects against. One object so they can be found and argued with,
 * rather than scattered as magic numbers down the file.
 */
export const FLOORS = {
  /**
   * The top ten needs a tail to be a share OF something. A table of exactly ten rows returns "the
   * top 10 are 100% of them", which is true, vacuous, and reads as a finding. Twice the top N is the
   * floor, so the sentence always describes a genuine concentration.
   */
  concentrationRows: 10,
  /** Below this a percentage is noise: 1 click on 1 impression is not a 100% rate. */
  rateDenominator: 50,
  /** Below this, subscribers per 1000 views swings wildly on one subscriber. */
  perThousandViews: 500,
  /** Never claim more than this many outliers in either direction; a list is not a finding. */
  maxOutliers: 3,
} as const

/** Which column carries the count everything else is weighed against, and the rate to test. */
const READ_SHAPE: Record<
  string,
  { dim: number; primary: { col: number; noun: string }; rate?: { col: number; noun: string; denom: number; denomNoun: string } }
> = {
  'gsc-queries': { dim: 0, primary: { col: 1, noun: 'clicks' }, rate: { col: 3, noun: 'clickthrough rate', denom: 2, denomNoun: 'impressions' } },
  'gsc-pages': { dim: 0, primary: { col: 1, noun: 'clicks' }, rate: { col: 3, noun: 'clickthrough rate', denom: 2, denomNoun: 'impressions' } },
  'ga4-channels': { dim: 0, primary: { col: 1, noun: 'sessions' } },
  'ga4-pages': { dim: 0, primary: { col: 1, noun: 'views' } },
  'yt-videos': { dim: 0, primary: { col: 1, noun: 'views' } },
  'li-posts': { dim: 1, primary: { col: 2, noun: 'impressions' }, rate: { col: 5, noun: 'engagement rate', denom: 2, denomNoun: 'impressions' } },
}

const numOf = (v: string): number | null => {
  const t = (v ?? '').trim().replace(/,/g, '').replace(/%$/, '')
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}
const group = (n: number): string => n.toLocaleString('en-US')
/** English plural, enough for the column names these tables actually carry. */
const plural = (w: string): string => {
  const t = w.trim()
  if (/[^aeiou]y$/i.test(t)) return `${t.slice(0, -1)}ies`
  if (/(s|x|z|ch|sh)$/i.test(t)) return `${t}es`
  return `${t}s`
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * A column header, said out loud. "CTR %" is a header; "clickthrough rate" is what a person calls it,
 * and this string ends up mid-sentence in a finding.
 */
function rateNoun(header: string): string {
  const bare = header.replace(/\s*%\s*$/, '').trim().toLowerCase()
  if (!bare || bare === 'ctr') return 'clickthrough rate'
  if (/^engagement$/.test(bare)) return 'engagement rate'
  return /rate$/.test(bare) ? bare : `${bare} rate`
}

/**
 * WORK OUT THE SHAPE OF A TABLE NOBODY DECLARED.
 *
 * A pasted or uploaded export is the only route available until a connector is configured, and it was
 * getting the thinnest possible reading: a headline and nothing else. The original refusal said the
 * app cannot know "what population or period somebody's CSV covers", which is true and was too broad.
 * Concentration and rate outliers are comparisons INSIDE the table: "the top 10 of these rows hold
 * 74% of the clicks in this table" is self-contained and stays true whatever period the export spans.
 * What genuinely needs the period is anything dated or any claim about now, and those are still
 * refused, and the period caveat still rides along.
 *
 * Deliberately conservative: no shape unless a text-ish dimension and a real count column are both
 * found, and no rate unless a column looks like a percentage AND a bigger count column exists to be
 * its denominator.
 */
function sniffShape(ds: BrandDataset, rows: string[][]): {
  dim: number
  primary: { col: number; noun: string }
  rate?: { col: number; noun: string; denom: number; denomNoun: string }
} | null {
  const cols = ds.columns
  if (cols.length < 2 || rows.length < 3) return null
  const numericShare = (i: number): number => rows.filter((r) => numOf(r[i] ?? '') !== null).length / rows.length
  // The dimension is the first column that is mostly NOT numbers: a label, a query, a page.
  const dim = cols.findIndex((_, i) => numericShare(i) < 0.2)
  if (dim < 0) return null

  const numericCols = cols.map((_, i) => i).filter((i) => i !== dim && numericShare(i) > 0.8)
  if (!numericCols.length) return null

  const looksRate = (i: number): boolean => /%|rate|ctr/i.test(cols[i] ?? '')
  const magnitude = (i: number): number => rows.reduce((n, r) => n + (numOf(r[i] ?? '') ?? 0), 0)

  /**
   * A COUNT IS A WHOLE NUMBER OF THINGS, and that is the test.
   *
   * Header words are unreliable across exports, but integrality is not: clicks, impressions,
   * sessions and views are counts, while a clickthrough rate of 13.4 and an average position of 3.1
   * are not, and neither can be summed. Without this the sniffer added up "Avg position" across 28
   * rows and headlined a Search Console export with "582.6 avg position", which is arithmetic
   * performed on something that was never a quantity.
   */
  const isCount = (i: number): boolean => {
    const nums = rows.map((r) => numOf(r[i] ?? '')).filter((n): n is number => n !== null)
    if (!nums.length) return false
    const whole = nums.filter((n) => Number.isInteger(n)).length / nums.length
    return whole > 0.8 && !/avg|average|position|rank|per\b/i.test(cols[i] ?? '')
  }

  const counts = numericCols.filter((i) => !looksRate(i) && isCount(i))
  if (!counts.length) return null
  const rateCol = numericCols.find((i) => looksRate(i))
  const bySize = [...counts].sort((a, b) => magnitude(a) - magnitude(b))

  /**
   * WHICH COUNT IS THE HEADLINE.
   *
   * With a percentage column present, the two counts either side of it are its numerator and its
   * denominator, and the NUMERATOR is the outcome somebody cares about: clicks, not impressions;
   * conversions, not sessions. Picking the biggest column instead headlines a Search Console export
   * with "50,210 impressions", which is the least interesting true thing in the table.
   *
   * With no rate column there is nothing to be a numerator of, so the biggest count is the subject.
   */
  const primary = rateCol !== undefined && counts.length >= 2 ? bySize[0] : bySize[bySize.length - 1]
  const denom = rateCol !== undefined && counts.length >= 2 ? bySize[bySize.length - 1] : null
  const rate =
    rateCol !== undefined && denom !== null && denom !== primary && magnitude(denom) > magnitude(primary)
      ? { col: rateCol, noun: rateNoun(cols[rateCol] ?? ''), denom, denomNoun: (cols[denom] ?? 'the denominator').toLowerCase() }
      : undefined

  return { dim, primary: { col: primary, noun: (cols[primary] ?? 'count').toLowerCase() }, rate }
}

/** Read a table. Pure, and fast enough to run inside a card render. */
export function readDataset(ds: BrandDataset, now: number = Date.now()): DatasetRead {
  const prov = datasetProvenance(ds, now)

  // A sketch has nothing to read. Not a headline with a warning under it: a headline IS a reading,
  // and putting a number nobody measured at the top of a card is the thing to avoid.
  if (prov.tier === 'sketched') {
    return { ok: false, findings: [], caveats: ['Every figure in this table was invented to show the shape. Nothing here can be read as a result.'] }
  }

  const rows = ds.rows.filter((r) => r.some((c) => (c ?? '').trim() !== ''))
  if (!rows.length) return { ok: false, findings: [], caveats: ['Nothing to read yet. There are no numbers in this sheet.'] }

  const pid = pullId(ds.source?.kind === 'aggregator' ? ds.source.query : undefined) ?? ''
  /**
   * A declared pull wins, because its columns are a contract. Failing that, work the shape out from
   * the table: a pasted export deserves the same reading as the same data pulled through a connector.
   */
  const declared = READ_SHAPE[pid]
  const shape = declared ?? sniffShape(ds, ds.rows.filter((r) => r.some((c) => (c ?? '').trim() !== '')))
  const sniffed = !declared && !!shape
  const caveats: string[] = []
  const figures: CitableFigure[] = []
  const mk = (id: string, value: string, label: string, basis: CitableFigure['basis']): CitableFigure => ({
    id: `${ds.id}:${id}`,
    value,
    label,
    basis,
    period: prov.periodLabel,
    source: prov.badge,
    partial: prov.partial,
    datasetId: ds.id,
  })

  /**
   * NOT A PULL WE KNOW THE SHAPE OF: an upload, a paste, or a sheet somebody typed. We can add up a
   * numeric column and we genuinely cannot say what population or what stretch of time it covers, so
   * it gets a headline and no findings at all rather than a confident sentence about somebody's CSV.
   */
  if (!shape) {
    const dim = ds.columns.findIndex((_, i) => rows.every((r) => numOf(r[i] ?? '') === null))
    const firstNum = ds.columns.findIndex((_, i) => i !== dim && rows.filter((r) => numOf(r[i] ?? '') !== null).length >= Math.ceil(rows.length / 2))
    if (firstNum < 0) return { ok: false, findings: [], caveats: ['Nothing to read yet. There are no numbers in this sheet.'] }
    const total = rows.reduce((n, r) => n + (numOf(r[firstNum] ?? '') ?? 0), 0)
    const col = ds.columns[firstNum] || 'the first number column'
    return {
      ok: true,
      headline: `${group(total)} ${col.toLowerCase()}`,
      read: `Across ${rows.length} rows.`,
      findings: [],
      caveats: [
        prov.tier === 'uploaded'
          ? 'We can add this up, but we do not know what period it covers, so nothing here is dated.'
          : 'This is a sheet you typed, so it is added up as given.',
      ],
    }
  }

  const dimName = (ds.columns[shape.dim] ?? 'row').toLowerCase()
  const dimPlural = plural(dimName)
  const primaryName = (ds.columns[shape.primary.col] ?? shape.primary.noun).toLowerCase()
  const vals = rows
    .map((r) => ({ key: (r[shape.dim] ?? '').trim(), n: numOf(r[shape.primary.col] ?? '') }))
    .filter((x): x is { key: string; n: number } => x.key !== '' && x.n !== null)
  if (!vals.length) return { ok: false, findings: [], caveats: ['Nothing to read yet. There are no numbers in this sheet.'] }

  const total = vals.reduce((n, x) => n + x.n, 0)
  const findings: Finding[] = []

  // The headline is the total, unless the table is capped, in which case a total is a lie and the
  // headline says what it actually is.
  const headline = prov.partial ? `${group(total)} ${primaryName} in the top ${vals.length}` : `${group(total)} ${primaryName}`
  let read: string | undefined

  if (prov.partial) {
    caveats.push('This is the top 500 rows, so anything about the long tail is not in here.')
  }
  caveats.push('One pull is one snapshot. Nothing here says whether this is going up or down.')
  if (sniffed) {
    // The one thing a worked-out shape genuinely cannot know. Said plainly, and it does not stop the
    // internal comparisons above from being true.
    caveats.push(
      prov.tier === 'uploaded'
        ? 'These columns were worked out from the table itself, and we do not know what period the file covers, so nothing here is dated.'
        : 'These columns were worked out from the table itself, and nothing here is dated.',
    )
  }

  /**
   * CONCENTRATION. Suppressed on a truncated table because the denominator is missing: the top ten
   * of a capped table is a share of what we fetched, not of what exists, and stating it as a share
   * overstates it every time.
   */
  if (!prov.partial && vals.length >= FLOORS.concentrationRows * 2 && total > 0) {
    const sorted = [...vals].sort((a, b) => b.n - a.n)
    const topN = Math.min(10, sorted.length)
    const topSum = sorted.slice(0, topN).reduce((n, x) => n + x.n, 0)
    const pct = Math.round((topSum / total) * 1000) / 10
    const f = [
      mk('conc:pct', `${pct}%`, `Share of ${primaryName} from the top ${topN}`, 'share'),
      mk('conc:n', String(topN), `How many ${dimPlural} that is`, 'rank'),
    ]
    read = `The top ${topN} ${dimPlural} are ${pct}% of them.`
    findings.push({
      id: `${ds.id}:concentration`,
      claim: `The top ${topN} ${dimPlural} are ${pct}% of all ${primaryName}.`,
      detail: `From ${ds.columns[shape.primary.col]}, across ${vals.length} rows.`,
      figures: f,
    })
    figures.push(...f)
  }

  /**
   * RATE OUTLIERS. Weighted by the denominator, and every row below the floor is excluded before the
   * average is taken, not after: a table full of one-impression rows would otherwise drag the average
   * to nonsense and then every real row would look like an outlier against it.
   */
  if (shape.rate) {
    const rate = shape.rate
    const withRate = rows
      .map((r) => ({ key: (r[shape.dim] ?? '').trim(), rate: numOf(r[rate.col] ?? ''), denom: numOf(r[rate.denom] ?? '') }))
      .filter((x): x is { key: string; rate: number; denom: number } => x.key !== '' && x.rate !== null && x.denom !== null)
    const floor = Math.max(FLOORS.rateDenominator, median(withRate.map((x) => x.denom)))
    const eligible = withRate.filter((x) => x.denom >= floor)
    if (eligible.length >= 3) {
      const wSum = eligible.reduce((n, x) => n + x.rate * x.denom, 0)
      const dSum = eligible.reduce((n, x) => n + x.denom, 0)
      const avg = dSum > 0 ? wSum / dSum : 0
      const below = eligible.filter((x) => x.rate < avg / 2).sort((a, b) => b.denom - a.denom).slice(0, FLOORS.maxOutliers)
      if (below.length && avg > 0) {
        const avgStr = `${Math.round(avg * 10) / 10}%`
        const f = [
          mk('rate:avg', avgStr, `Average ${rate.noun} across the table`, 'share'),
          mk('rate:n', String(below.length), `How many ${dimPlural} are well under it`, 'rank'),
        ]
        findings.push({
          id: `${ds.id}:rate-low`,
          claim: `${below.length} ${below.length === 1 ? dimName : dimPlural} get plenty of ${rate.denomNoun} and a ${rate.noun} under half the table average of ${avgStr}.`,
          detail: `From ${ds.columns[rate.col]} against ${ds.columns[rate.denom]}, across ${eligible.length} rows above ${group(Math.round(floor))} ${rate.denomNoun}.`,
          figures: f,
        })
        figures.push(...f)
      }
      caveats.push(`Rates are only read for rows above ${group(Math.round(floor))} ${rate.denomNoun}. Below that a percentage is noise.`)
    }
  }

  /** SUBSCRIBERS PER 1000 VIEWS, the one YouTube claim worth making from a single pull. */
  if (pid === 'yt-videos' && ds.columns.length >= 5) {
    const subsCol = 4
    const eligible = rows
      .map((r) => ({ key: (r[0] ?? '').trim(), views: numOf(r[1] ?? ''), subs: numOf(r[subsCol] ?? '') }))
      .filter((x): x is { key: string; views: number; subs: number } => x.key !== '' && x.views !== null && x.subs !== null && x.views >= FLOORS.perThousandViews)
    if (eligible.length >= 3) {
      const best = [...eligible].sort((a, b) => b.subs / b.views - a.subs / a.views)[0]
      const per = Math.round((best.subs / best.views) * 1000 * 10) / 10
      const f = [mk('yt:per1k', String(per), `Subscribers per 1000 views on ${best.key}`, 'share')]
      findings.push({
        id: `${ds.id}:yt-per1k`,
        claim: `The best video for turning views into subscribers gets ${per} per 1000 views.`,
        detail: `From ${ds.columns[subsCol]} against ${ds.columns[1]}, across ${eligible.length} videos above ${group(FLOORS.perThousandViews)} views.`,
        figures: f,
      })
      figures.push(...f)
    }
  }

  return { ok: true, headline, read, period: prov.periodLabel, findings, caveats }
}


/**
 * WHICH FIGURES ACTUALLY LANDED IN A PIECE OF COPY.
 *
 * Computed by looking at the text, never by asking the model what it used. A model will cite a
 * figure it did not use and use one it did not cite, so a self-report rendered as provenance is a
 * guess laundered into an audit trail, and an audit trail that is wrong is worse than none because
 * somebody will trust it.
 *
 * Matching is on the value as the writer was told to reproduce it, allowing for the thousands
 * separator being present or absent, since that is the one thing a writer legitimately varies.
 */
export function figuresUsedIn(texts: string[], figures: CitableFigure[]): string[] {
  const hay = texts.join(' \u0000 ')
  const out: string[] = []
  for (const f of figures) {
    const bare = f.value.replace(/,/g, '')
    const grouped = Number(bare.replace(/%$/, ''))
    const alt = Number.isFinite(grouped) && !bare.endsWith('%') ? grouped.toLocaleString('en-US') : ''
    const forms = [...new Set([f.value, bare, alt].filter(Boolean))]
    if (forms.some((v) => whole(hay, v))) out.push(f.id)
  }
  return out
}

/**
 * Does this number appear as a NUMBER, rather than inside a bigger one?
 *
 * A plain substring test says the figure 443 landed in copy reading "4,430 sessions", which is a
 * provenance line asserting something the copy does not say. An audit trail that is wrong is worse
 * than none, because somebody will act on it.
 */
function whole(hay: string, value: string): boolean {
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\d.,])${esc}(?![\\d,]*\\d)`).test(hay)
}
