import type { ObjectReference } from './objectReference'
import { freshRecordId } from './records'

/**
 * A BRAND AS AN OBJECT: authored on a campaign canvas, like an audience or a product.
 *
 * NOT the workspace client. That is a name string threaded through roughly seventy persisted slices
 * — every campaign name, every record's brand tag, a dozen maps keyed by it — and it is what binds a
 * canvas to a voice so one client's proof cannot reach another's copy. It stays exactly as it is.
 *
 * This is the other thing people mean by "brand": something you describe on a board, in a campaign,
 * to shape what gets written. You can put several on one canvas (a co-brand, a partner, a
 * sub-brand), and reuse one elsewhere by turning its card into a smart object and filing it under
 * the brand's assets — the same mechanism every other card already uses to travel between campaigns.
 *
 * Keeping the two apart is deliberate. Folding them together would mean either a text field on a
 * card silently renaming an account's whole dataset, or the workspace binding quietly becoming
 * editable per campaign, and the second is how one client's voice ends up in another's copy.
 */
export interface BrandObject {
  id: string
  /** The workspace this was authored in, so a rail can scope it. Not an identity. */
  brand?: string
  name: string
  /** One line: what this brand does, for someone who has not heard of it. */
  oneLiner?: string
  /** What it sells. Names only; a Product card carries the detail. */
  products?: string[]
  /** What sets it apart. The claims copy is allowed to make. */
  differentiators?: string[]
  /** The position it owns that no competitor can say. */
  wedge?: string
  /** The mission, in their words. */
  mission?: string
  /** The brand's own site. Also the input for filling this card in from it. */
  website?: string
  industry?: string
  /** How it sounds. Sets register for everything written under it. */
  voice?: string
  /** What it must never sound like. The inverse of voice, and the one people forget to write down. */
  avoidVoice?: string
  notes?: string
  /** The document this record is, kept whole. Not a column: see Voice.reference for why. */
  reference?: ObjectReference
}

export function freshBrandObjectId(): string {
  return freshRecordId('bo')
}
