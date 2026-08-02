/**
 * Descriptors — the voice/tone attributes for how to speak to an audience
 * (warm, bold, precise…). Audience-specific, so they live under the audience
 * alongside its RTBs: the audience is the container for everything about how you
 * talk to a group — the proof that convinces them and the voice you sound in.
 *
 * Modelled as first-class objects (their own id) from day one — even though voice
 * doesn't accumulate outcomes the way an RTB does — so the foundation can rank,
 * reuse and reason over them, and the connection check can read "on-voice" as a
 * concrete check against real descriptor objects rather than a free-text blob.
 */
export interface Descriptor {
  id: string
  /** The trait, e.g. "Warm", "Bold", "Precise". */
  label: string
  /** Optional guidance: what this sounds like / how to apply it. */
  note?: string
}

let descSeq = 0
export function newDescriptor(patch: Partial<Descriptor> = {}): Descriptor {
  descSeq += 1
  return {
    id: patch.id ?? `desc_${Date.now().toString(36)}_${descSeq}`,
    label: patch.label ?? '',
    note: patch.note,
  }
}
