import type { TrafficRow } from '../domain/types'
import { effectiveMessaging } from '../domain/assetMode'
import { utmQuery } from '../domain/tracking'

const COLUMNS: (keyof TrafficRow)[] = [
  'id',
  'assetName',
  'mediaType',
  'channel',
  'assetType',
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

/**
 * Serialize the sheet's rows to CSV. Messaging components are flattened into a single "messaging"
 * column (label: value pairs).
 *
 * AN EXPORT IS A RECORD, NOT A PLAN, so a live asset exports what it actually ran with (see
 * effectiveMessaging). This is the file somebody opens to answer "what did we put out", and handing
 * them the draft of a post that went out saying something else is the one way an export can be
 * wrong without looking wrong. A planned asset has nothing else to give and is unchanged.
 *
 * Joined the way messagingAllText joins — every stored key, not just the ones this format defines —
 * because an export that silently dropped copy sitting under a retired key would be lying by
 * omission about a row it is claiming to describe.
 */
export function rowsToCsv(rows: TrafficRow[]): string {
  const header = [...COLUMNS, 'messaging', 'utm'].join(',')
  const lines = rows.map((r) =>
    [
      ...COLUMNS.map((c) => escape(r[c])),
      escape(Object.values(effectiveMessaging(r)).filter((v) => v?.trim()).join(' ')),
      escape(r.utm ? utmQuery(r.utm) : ''),
    ].join(','),
  )
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
