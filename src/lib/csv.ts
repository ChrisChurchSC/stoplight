import type { TrafficRow } from '../domain/types'

const COLUMNS: (keyof TrafficRow)[] = [
  'id',
  'assetName',
  'mediaType',
  'channel',
  'caption',
  'campaign',
  'audience',
  'scheduledAt',
  'status',
  'approvedAt',
  'postedAt',
]

function escape(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Serialize the sheet's rows to CSV in the canonical column order. */
export function rowsToCsv(rows: TrafficRow[]): string {
  const header = COLUMNS.join(',')
  const lines = rows.map((r) => COLUMNS.map((c) => escape(r[c])).join(','))
  return [header, ...lines].join('\n')
}

/** Trigger a browser download of the given CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
