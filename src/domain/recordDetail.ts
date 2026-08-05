/**
 * THE ONE LINE A RECORD SHOWS UNDER ITS NAME.
 *
 * What a Message argues, what a Product is, what fires a Trigger. A list of thirty names is a list
 * of thirty things you have to already know, so every surface that offers records to pick from
 * prints this underneath each one.
 *
 * SHARED, because there is more than one such surface: the object card's picker on the canvas and
 * the "Made from" drawer in the grid both read it, and they used to each pick their own field. Two
 * lists claiming to be the same library is the bug this file exists to prevent — the same Voice
 * cannot read as its tone in one place and its summary in the next.
 *
 * A kind is absent here when its records carry no such line, rather than being padded with
 * something invented to fill the row.
 */
import type { AudienceType } from './audiences'
import type { BrandDataset } from './brandDataset'
import type { BrandObject } from './brandObject'
import type { Company } from './companies'
import type { Concept } from './concept'
import type { Message } from './message'
import type { Pattern } from './pattern'
import type { Person } from './people'
import type { Product } from './product'
import type { Rtb } from './rtb'
import type { Season } from './season'
import type { Trigger } from './trigger'
import type { Voice } from './voice'

/** Keyed by object kind, camel-cased where the kind is hyphenated. */
export const recordDetail = {
  audience: (a: AudienceType) => a.role,
  brand: (b: BrandObject) => b.oneLiner,
  company: (c: Company) => c.description || c.segment,
  concept: (c: Concept) => c.idea,
  /** A table says what it is by its size and its headings; it has no prose line to read. */
  dataSource: (d: BrandDataset) =>
    d.columns?.length ? `${d.rows?.length ?? 0} rows · ${d.columns.join(', ')}` : undefined,
  message: (m: Message) => m.angle,
  /**
   * Description first, then the type, because a list of pattern NAMES is the one list here where
   * the names are least self-explanatory: "Ladder", "Open loop" and "Third rail" mean nothing
   * until somebody says what shape they are.
   */
  pattern: (p: Pattern) => p.description || p.type,
  person: (p: Person) => p.title,
  product: (p: Product) => p.summary,
  /** A proof point IS its detail — the substantiating sentence, or the figure when that is all there is. */
  proofPoint: (r: Rtb) => r.detail || r.metric,
  season: (s: Season) => s.moment,
  trigger: (t: Trigger) => t.signal,
  voice: (v: Voice) => v.summary || v.tone,
}
