/**
 * Reports — saved, Claude-generated write-ups over a brand's library. The narrative
 * and recommendations layer that sits on top of the live Signals data: Signals is the
 * always-current instrument read, a Report is a dated synthesis you can keep and share.
 * Stored as self-contained HTML so it renders in-app (in an isolated frame) exactly as
 * generated. Everything a computed panel can't do — the story, the before/after copy —
 * lives here.
 */

export type ReportKind = 'patterns' | 'recommendations' | 'analysis'

export interface BrandReport {
  id: string
  client: string
  title: string
  kind: ReportKind
  createdAt: number
  /** One-line description shown on the report card. */
  summary?: string
  /** Self-contained HTML (title + inline styles + body), rendered in an isolated frame. */
  html: string
}

export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  patterns: 'Patterns',
  recommendations: 'Recommendations',
  analysis: 'Analysis',
}
