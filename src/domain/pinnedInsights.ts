/**
 * Pinned insights — a finding lifted out of a saved report and kept in view on the
 * Overview. A report is a dated synthesis you open on purpose; a pin is the one line
 * from it you want to keep looking at. Captured from the highlighted text in a report,
 * with a pointer back to the report it came from.
 */
export interface PinnedInsight {
  id: string
  client: string
  /** The exact text lifted from the report (a sentence or a finding). */
  text: string
  /** Optional note the user adds when pinning. */
  note?: string
  /** Provenance: the report this was pinned from, so the pin can link back. */
  sourceReportId?: string
  sourceTitle?: string
  createdAt: number
}
