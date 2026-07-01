import type { TrafficRow } from './types'

/**
 * Editable vs linked-external (Build Brief: Asset Types & the Re-Check).
 *
 * - Editable: copy authored in Hyperfocus — drafts it can regenerate. On a frame
 *   change we re-check AND offer to redraft (AI draft, human finishes).
 * - Linked-external: a produced video, a finished static image, or a live webpage
 *   linked in — Hyperfocus reads only the WORDS, never the visual, and cannot
 *   change the asset (the words are welded into a file or live in someone's CMS).
 *   On a frame change we re-check the words, FLAG the mismatch, and route the fix
 *   outside the tool. Never fake-edit produced media.
 *
 * Heuristic for now, by media kind. The faithful source is an explicit tag set at
 * creation/ingestion; when that exists it should override this.
 */
export function isLinkedExternal(r: Pick<TrafficRow, 'mediaType'>): boolean {
  return r.mediaType === 'video' || r.mediaType === 'image' || r.mediaType === 'link'
}

export function isEditableAsset(r: Pick<TrafficRow, 'mediaType'>): boolean {
  return !isLinkedExternal(r)
}

/** Split a set of assets into the two re-check verbs: editable copy we can
 *  redraft vs produced/linked assets we can only flag for external rework. */
export function splitByKind<T extends Pick<TrafficRow, 'mediaType'>>(rows: T[]): {
  editable: T[]
  linked: T[]
} {
  const editable: T[] = []
  const linked: T[] = []
  for (const r of rows) (isLinkedExternal(r) ? linked : editable).push(r)
  return { editable, linked }
}
