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
  if (!s || s.kind !== 'aggregator' || !s.syncedAt) return undefined
  const d = windowDays(s.query)
  return d ? `${d} days to ${day(s.syncedAt)}` : `as at ${day(s.syncedAt)}`
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
  // `now` is the clock the 'stale' tier will read once Phase 4 lands. Threaded through every caller
  // from the start so adding staleness is a change to this function only, not to six call sites.
  void now
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
    return {
      tier: 'measured',
      badge: period ? `${sourceName(ds)}, ${period}` : sourceName(ds),
      detail: `${sourceName(ds)}${period ? `, ${period}` : ''}.${partialSuffix}`,
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
