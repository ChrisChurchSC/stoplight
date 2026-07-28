import type { RowStatus, SheetSnapshot, TrafficRow } from '../../domain/types'
import type { SheetAdapter } from './types'

const STORAGE_KEY = 'stoplight.sheet.v1'

/**
 * Mock sheet backed by localStorage. Stands in for Google Sheets / Airtable so
 * v1 runs with zero credentials. Persists across reloads within the browser.
 *
 * A real adapter would implement the same interface against an API; the rest
 * of the app is unaware of the difference.
 */
export class MockSheetAdapter implements SheetAdapter {
  private read(): SheetSnapshot {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return { rows: [] }
      const parsed = JSON.parse(raw) as SheetSnapshot
      return { rows: Array.isArray(parsed.rows) ? parsed.rows : [] }
    } catch {
      return { rows: [] }
    }
  }

  private write(snapshot: SheetSnapshot): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  }

  async list(): Promise<TrafficRow[]> {
    return this.read().rows
  }

  async append(rows: TrafficRow[]): Promise<void> {
    const snap = this.read()
    snap.rows.push(...rows)
    this.write(snap)
  }

  async update(id: string, patch: Partial<TrafficRow>): Promise<void> {
    const snap = this.read()
    snap.rows = snap.rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
    this.write(snap)
  }

  async setStatus(ids: string[], status: RowStatus): Promise<void> {
    const idSet = new Set(ids)
    const stamp = Date.now()
    const snap = this.read()
    snap.rows = snap.rows.map((r) => {
      if (!idSet.has(r.id)) return r
      const next: TrafficRow = { ...r, status }
      if (status === 'approved') next.approvedAt = stamp
      if (status === 'posted') next.postedAt = stamp
      return next
    })
    this.write(snap)
  }

  async remove(id: string): Promise<void> {
    const snap = this.read()
    snap.rows = snap.rows.filter((r) => r.id !== id)
    this.write(snap)
  }

  async clear(): Promise<void> {
    this.write({ rows: [] })
  }

  async replaceAll(rows: TrafficRow[]): Promise<void> {
    this.write({ rows })
  }
}
