import type { AudienceType } from './audiences'
import { liveCampaignNames, type FlowReference } from './clients'
import { BUILDER_BOARD_KEY } from './flowBoard'

/**
 * WHICH OF A BRAND'S AUDIENCES ANYTHING ACTUALLY POINTS AT.
 *
 * The shelf accumulates. Every campaign build seeds records for the audiences it writes to, and
 * the chat mints one whenever copy targets a segment that does not exist yet — deliberately, and
 * deduped, but each build still leaves a few behind. For as long as the pickers read the wrong
 * shelf none of this showed; the moment the scope was fixed, an Audience card's dropdown opened
 * onto thirty-six options nobody remembered making. The records are real. Most are just unused.
 *
 * This says which is which, so a cleanup can remove ONLY what nothing references. The net is cast
 * deliberately wide across the LIVING workspace — an asset's pins, its plain-string audience,
 * every live board's Audience cards, a smart object's refs and its bundled contents, and every
 * live campaign record's pins, matched by id AND by name — because the cost of keeping an unused
 * record is a noisy picker, and the cost of dropping a used one is a hole in an asset's Made from.
 * When in doubt, it is used.
 *
 * A DOMAIN FUNCTION, not a store action, for the same reason the scope rules are: what "unused"
 * means is a boundary worth a test, and the store's job is only to apply the answer.
 */
export interface RecordUsage {
  rows: readonly { audience?: string; references?: readonly FlowReference[] }[]
  boards: readonly { objects: readonly { kind: string; refId?: string }[] }[]
  smartObjects: readonly {
    refs?: readonly FlowReference[]
    contents?: readonly { kind: string; refId?: string }[]
  }[]
  campaigns: readonly { references?: readonly FlowReference[] }[]
}

/** Kept under its old name for the audience-specific caller below. */
export type AudienceUsage = RecordUsage

/**
 * THE LIVING WORKSPACE, which is the only part whose references count.
 *
 * The first cut of this scanned everything — archived rows, archived campaign records, and every
 * stored board — reasoning that restoring a campaign must not surface holes. What that actually
 * did was let the dead keep the shelf: a workspace that has generated for months holds boards for
 * campaigns that no longer exist (renamed, rebuilt, deleted — the board outlives the name) and
 * dozens of archived campaigns, and between them they reference nearly every record ever minted.
 * The sweep dutifully kept the lot, and the user asking "why are all these old messages still
 * here" was right: a cleanup that defers to ghosts cleans nothing.
 *
 * So references count from work that is ALIVE: unarchived rows, unarchived campaign records, the
 * boards of campaigns that still exist (liveCampaignNames — records or live rows, the same test
 * the tab strip and the gallery use) plus the builder's own board, and the smart-object library.
 * A record referenced only by archived work goes; restoring that work later shows its pins by
 * their stored labels with the record gone — exactly the state the app already handles for a
 * record deleted by hand, which every record page allows without ceremony.
 */
export function liveRecordUsage<
  R extends { campaign?: string; archivedAt?: number } & RecordUsage['rows'][number],
  B extends { key: string } & RecordUsage['boards'][number],
  C extends { name: string; archivedAt?: number } & RecordUsage['campaigns'][number],
>(state: {
  rows: readonly R[]
  boards: readonly B[]
  smartObjects: RecordUsage['smartObjects']
  campaigns: readonly C[]
}): { rows: R[]; boards: B[]; smartObjects: RecordUsage['smartObjects']; campaigns: C[] } {
  const live = liveCampaignNames(state.rows, state.campaigns)
  return {
    rows: state.rows.filter((r) => !r.archivedAt),
    boards: state.boards.filter((b) => b.key === BUILDER_BOARD_KEY || live.has(b.key)),
    smartObjects: state.smartObjects,
    campaigns: state.campaigns.filter((c) => !c.archivedAt),
  }
}

const norm = (s: string | undefined): string => (s ?? '').trim().toLowerCase()

/**
 * The generic splitter: audiences are the shelf this was built for, but every minted kind
 * accumulates the same way — messages, concepts, voices — and each one's "unused" must mean the
 * same thing or the sweep button on one page would be a different promise on the next.
 *
 * `refType` is the FlowReference type a pin uses for this kind; `cardKind` is the canvas card that
 * names one. `namesOf` lists every name a record answers to (the audience caller adds aliases);
 * `rowName` reads a kind's plain-string mirror off an asset, for the one kind that has one.
 */
export function splitRecordsByUse<T extends { id: string; name?: string }>(
  shelf: readonly T[],
  usage: RecordUsage,
  opts: {
    refType: FlowReference['type']
    cardKind: string
    namesOf?: (record: T) => (string | undefined)[]
    rowName?: (row: RecordUsage['rows'][number]) => string | undefined
  },
): { used: T[]; unused: T[] } {
  const ids = new Set<string>()
  const names = new Set<string>()
  const takeRefs = (refs: readonly FlowReference[] | undefined) => {
    for (const r of refs ?? []) {
      if (r.type !== opts.refType) continue
      if (r.id) ids.add(r.id)
      // The label is the record's name as it was pinned; a rename since should not orphan the pin's
      // record, which is why ids are collected too — but a label match alone still counts.
      if (norm(r.label)) names.add(norm(r.label))
    }
  }
  const takeCards = (cards: readonly { kind: string; refId?: string }[] | undefined) => {
    for (const o of cards ?? []) if (o.kind === opts.cardKind && o.refId) ids.add(o.refId)
  }
  for (const r of usage.rows) {
    const mirrored = opts.rowName?.(r)
    if (norm(mirrored)) names.add(norm(mirrored))
    takeRefs(r.references)
  }
  for (const b of usage.boards) takeCards(b.objects)
  for (const o of usage.smartObjects) {
    takeRefs(o.refs)
    takeCards(o.contents)
  }
  for (const c of usage.campaigns) takeRefs(c.references)

  const used: T[] = []
  const unused: T[] = []
  for (const rec of shelf) {
    const answersTo = opts.namesOf?.(rec) ?? [rec.name]
    const hit = ids.has(rec.id) || answersTo.some((n) => norm(n) && names.has(norm(n)))
    ;(hit ? used : unused).push(rec)
  }
  return { used, unused }
}

export function splitAudiencesByUse(
  shelf: readonly AudienceType[],
  usage: AudienceUsage,
): { used: AudienceType[]; unused: AudienceType[] } {
  return splitRecordsByUse(shelf, usage, {
    refType: 'segment',
    cardKind: 'audience',
    // row.audience is the one plain-string mirror on an asset, and half the app writes it.
    rowName: (r) => r.audience,
    namesOf: (a) => [a.name, ...(a.aliases ?? [])],
  })
}
