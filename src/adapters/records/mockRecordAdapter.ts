import type { RecordAdapter } from './types'

/**
 * localStorage-backed record list — the same read/modify/write on a single JSON array key that the
 * store's loadRecordList/saveRecordList did, now behind the RecordAdapter interface. Behavior is
 * unchanged when there's no backend configured.
 */
export class MockRecordAdapter<T extends { id: string }> implements RecordAdapter<T> {
  constructor(private key: string) {}

  private read(): T[] {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key) ?? '[]')
      return Array.isArray(raw) ? (raw as T[]) : []
    } catch {
      return []
    }
  }
  private write(list: T[]): void {
    localStorage.setItem(this.key, JSON.stringify(list))
  }

  async list(): Promise<T[]> {
    return this.read()
  }
  async upsert(record: T): Promise<void> {
    const list = this.read()
    const i = list.findIndex((r) => r.id === record.id)
    if (i >= 0) list[i] = record
    else list.unshift(record)
    this.write(list)
  }
  async remove(id: string): Promise<void> {
    this.write(this.read().filter((r) => r.id !== id))
  }
  async replaceAll(records: T[]): Promise<void> {
    this.write(records)
  }
}
