import type { TrafficRow } from '../../domain/types'
import { messagingAllText } from '../../domain/messaging'

export interface CopyPiece {
  label: string
  text: string
  source: 'caption' | 'body' | 'extracted'
}

/** Every piece of reviewable copy attached to a row, for the review panel. */
export function copyPieces(row: TrafficRow): CopyPiece[] {
  const pieces: CopyPiece[] = [{ label: 'Messaging', text: messagingAllText(row), source: 'caption' }]
  if (row.body) pieces.push({ label: 'Body', text: row.body, source: 'body' })
  if (row.extractedCopy) {
    pieces.push({ label: 'In-creative copy', text: row.extractedCopy, source: 'extracted' })
  }
  return pieces
}

export interface ExtractResult {
  text: string
  /** How the copy was obtained — or why it couldn't be (stubbed in v1). */
  via: 'body' | 'vision' | 'page' | 'stub'
}

/** Transport that turns a creative into its in-creative text. Wire this to
 *  Claude vision (server-side) for images/video; until then it's stubbed. */
export type ExtractTransport = (row: TrafficRow) => Promise<ExtractResult>

/**
 * Pull the copy baked INTO the creative so a reviewer can read it alongside the
 * caption. Text assets resolve from their body (real today). Image/video need
 * OCR/transcription and link needs a page fetch — those run through `transport`
 * when wired, and otherwise return an honest stub.
 */
export async function extractInCreativeCopy(
  row: TrafficRow,
  transport?: ExtractTransport,
): Promise<ExtractResult> {
  if (row.mediaType === 'text') {
    return { text: row.body ?? '', via: 'body' }
  }
  if (transport) return transport(row)

  if (row.mediaType === 'image' || row.mediaType === 'video') {
    return {
      text: '(Vision OCR not wired — connect Claude vision to transcribe the text in this creative.)',
      via: 'stub',
    }
  }
  return { text: '(Landing-page fetch not wired — connect a fetch to pull page copy.)', via: 'stub' }
}
