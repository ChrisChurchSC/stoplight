/**
 * THE BYTES, ON THIS DEVICE — IndexedDB, not localStorage.
 *
 * The app keeps every other slice of state in localStorage and mirrors it to the workspace. Binary
 * creative cannot go there and the failure is not a graceful one: the quota is ~5MB for the WHOLE
 * app, and persistState rewrites an entire slice on every call, so one 3MB hero image does not just
 * fail to save itself — it starts failing the writes for campaigns, boards and comments too.
 *
 * IndexedDB is the right-sized local store for this: it holds Blobs natively (no base64 inflation),
 * has a quota measured in hundreds of MB, and survives a reload — which the object URLs this
 * replaces did not. A card that said "Upload" again after every refresh is exactly the thing that
 * teaches a campaign manager the tool loses their work.
 *
 * It is a CACHE when a workspace is configured (previews render from disk instead of waiting on a
 * signed URL round trip) and the store of record when one is not, so the feature works before the
 * backend is provisioned and keeps working offline. Either way the workspace copy is the durable
 * one; see adapters/media/creativeStore.
 */

const DB_NAME = 'stoplight.creative'
const DB_VERSION = 1
const STORE = 'blobs'

/** True where IndexedDB exists at all. Absent in jsdom (tests), and in some private modes. */
const available = (): boolean => typeof indexedDB !== 'undefined' && indexedDB != null

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (!available()) return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    // Blocked, corrupt, or storage denied. Resolving null rather than rejecting means every caller
    // degrades to "no local copy" instead of having to guard an await that can throw.
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null)
        try {
          const t = db.transaction(STORE, mode)
          const req = run(t.objectStore(STORE))
          req.onsuccess = () => resolve(req.result as T)
          req.onerror = () => resolve(null)
          t.onabort = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

/** Keep a file's bytes on this device. Resolves false when there is nowhere to put them (quota,
 *  private mode, no IndexedDB) — the caller decides whether that is fatal. */
export async function putBytes(id: string, blob: Blob): Promise<boolean> {
  const res = await tx<IDBValidKey>('readwrite', (s) => s.put(blob, id) as IDBRequest<IDBValidKey>)
  return res != null
}

export async function getBytes(id: string): Promise<Blob | null> {
  const res = await tx<Blob | undefined>('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>)
  return res instanceof Blob ? res : null
}

export async function dropBytes(id: string): Promise<void> {
  await tx<undefined>('readwrite', (s) => s.delete(id) as IDBRequest<undefined>)
  revokeUrl(id)
}

/**
 * OBJECT URLS ARE CACHED AND REUSED, keyed by media id.
 *
 * Minting one per render leaks a blob handle every time React re-runs — and a panel that re-renders
 * on every keystroke in the copy field above it would leak one per keystroke, holding the whole file
 * in memory each time. One URL per file, revoked when the file is deleted.
 */
const urls = new Map<string, string>()

/** A displayable URL for a locally-held file, or null when this device has no copy. */
export async function localUrl(id: string): Promise<string | null> {
  const cached = urls.get(id)
  if (cached) return cached
  const blob = await getBytes(id)
  if (!blob) return null
  // Two callers can race the await above; the loser's URL would be orphaned, so re-check.
  const won = urls.get(id)
  if (won) return won
  const url = URL.createObjectURL(blob)
  urls.set(id, url)
  return url
}

export function revokeUrl(id: string): void {
  const url = urls.get(id)
  if (!url) return
  urls.delete(id)
  try {
    URL.revokeObjectURL(url)
  } catch {
    /* already revoked / no URL API */
  }
}
