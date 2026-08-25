import { getActiveWorkspaceId } from '../../lib/session'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

/**
 * THE BYTES, IN THE WORKSPACE — Supabase Storage.
 *
 * The durable half of a card's creative. The metadata rides the workspace-state mirror with every
 * other synced slice (see domain/cardMedia); the file itself goes here, because a jsonb column is
 * not where a 40MB cut of a Reel belongs.
 *
 * THE BUCKET IS PRIVATE and reads are signed. A public bucket would be simpler and is the wrong
 * trade: these are unreleased campaign assets, and a public object URL is guessable-adjacent
 * forever — it outlives the campaign, the client relationship, and anyone's memory of having
 * uploaded it. RLS on storage.objects scopes both halves to workspace membership, keyed on the
 * first path segment; see supabase/migrations/0015_creative_storage.sql.
 *
 * PATH SHAPE: `<workspace_id>/<row_id>/<media_id>.<ext>`. The workspace goes first because that is
 * what the storage policy reads (storage.foldername(name))[1]. The row is next so a campaign's
 * files group by card when someone browses the bucket in the dashboard. The media id — not the
 * filename — names the object: two people uploading "final.png" to one card must not collide, and a
 * filename with a slash, a quote, or an emoji in it must not have to be sanitised into something
 * that no longer matches what the tile says.
 */

export const CREATIVE_BUCKET = 'creative'

/** Whether a workspace can hold files at all. False → uploads stay on the device and say so. */
export const isCreativeBackendConfigured = (): boolean => isSupabaseConfigured

/**
 * Put one file in the workspace's bucket. Resolves the object path on success, null on any failure
 * — no backend, signed out, bucket not created yet, offline, over quota.
 *
 * NULL IS NOT SWALLOWED, it is the answer: the caller records a media entry with no `path`, the
 * tile renders as "On this device", and a later retry can fill it in. The alternative — throwing —
 * would mean an upload that reached IndexedDB fine gets reported to the user as a failure, and they
 * would upload it again.
 */
export async function uploadCreative(
  rowId: string,
  mediaId: string,
  ext: string,
  blob: Blob,
): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null
  try {
    const ws = await getActiveWorkspaceId()
    if (!ws) return null
    const path = `${ws}/${encodeURIComponent(rowId)}/${mediaId}${ext ? `.${ext}` : ''}`
    const { error } = await supabase.storage.from(CREATIVE_BUCKET).upload(path, blob, {
      // The media id makes the path unique, so an upsert can only ever be a retry of the same
      // file — which is exactly when overwriting is right.
      upsert: true,
      contentType: blob.type || 'application/octet-stream',
      // A campaign asset is replaced by uploading a new one, never edited in place, so a long cache
      // is safe. The signed URL's own expiry is the shorter of the two anyway.
      cacheControl: '3600',
    })
    if (error) return null
    return path
  } catch {
    return null
  }
}

/** Take one file out of the bucket. Best-effort: a card whose metadata is gone must not be blocked
 *  from deleting by a storage call that failed, or the tile comes back on the next render. */
export async function removeCreative(path: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  try {
    await supabase.storage.from(CREATIVE_BUCKET).remove([path])
  } catch {
    /* orphaned object; the metadata is what the UI reads */
  }
}

/**
 * SIGNED URLS ARE CACHED until shortly before they expire.
 *
 * Without this, every re-render of the panel asks the server for a fresh URL for every tile — and
 * because a new URL is a new `src`, the <img> re-downloads the file each time. A six-slide carousel
 * in a panel that re-renders on each keystroke of the copy field is not a theoretical cost.
 */
const SIGNED_TTL_SEC = 3600
/** Re-sign a minute early so a URL handed out now cannot expire between render and load. */
const REFRESH_MARGIN_MS = 60_000
const signed = new Map<string, { url: string; expires: number }>()

export async function creativeUrl(path: string): Promise<string | null> {
  const hit = signed.get(path)
  if (hit && hit.expires - REFRESH_MARGIN_MS > Date.now()) return hit.url
  if (!isSupabaseConfigured || !supabase) return null
  try {
    const { data, error } = await supabase.storage
      .from(CREATIVE_BUCKET)
      .createSignedUrl(path, SIGNED_TTL_SEC)
    if (error || !data?.signedUrl) return null
    signed.set(path, { url: data.signedUrl, expires: Date.now() + SIGNED_TTL_SEC * 1000 })
    return data.signedUrl
  } catch {
    return null
  }
}

/**
 * A URL that downloads under the file's real name rather than opening in the tab.
 *
 * The `download` param is Storage's own: it sets Content-Disposition on the response, which is the
 * only way to name a downloaded file across origins. An `<a download="...">` attribute is IGNORED
 * for a cross-origin href, so without this every saved file would land in Downloads named after the
 * media id — which is the one name nobody can recognise.
 */
export async function creativeDownloadUrl(path: string, filename: string): Promise<string | null> {
  const url = await creativeUrl(path)
  if (!url) return null
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(filename)}`
}
