import type { ChannelId, TrafficRow } from '../../domain/types'

export interface IcpField {
  label: string
  value: string
}

/**
 * The target buyer, as consumed from Clay. Supports both shapes: structured
 * firmographic fields + scored segment, and a narrative summary used as
 * interpretive context. The review reads fields when present, falls back to
 * the summary.
 */
export interface Icp {
  name: string
  segment?: string
  summary: string
  firmographics: IcpField[]
  pains: string[]
}

export type AssetVerdict = 'on-message' | 'drift' | 'off-icp'
export type CampaignVerdict = 'coherent' | 'mixed' | 'incoherent'

export interface AssetFlag {
  rowId: string
  assetName: string
  channel: ChannelId
  verdict: AssetVerdict
  /** The specific messaging component this flag is about (key + label). */
  field?: { key: string; label: string }
  issue?: string
  suggestion?: string
}

/** The single, actionable output of a batch messaging review. */
export interface BatchReview {
  verdict: CampaignVerdict
  /** Do these assets tell one story to one buyer in one voice? */
  oneStory: boolean
  summary: string
  flags: AssetFlag[]
}

/** Pulls the ICP from Clay (table / scored segment / written profile). */
export interface IcpSource {
  fetch(): Promise<Icp>
}

/** Evaluates the whole batch against the ICP — together, not one at a time. */
export interface IcpReviewer {
  review(icp: Icp, rows: TrafficRow[]): Promise<BatchReview>
}
