import type { DriveFile } from './types'

/**
 * Real Google Drive import via Google Identity Services + the Google Picker.
 *
 * No app secret, no backend: the user's OAuth consent IS the key-gate (mirrors
 * how ANTHROPIC_API_KEY gates the ICP review). Scope is drive.file — the user
 * only exposes the files they actually pick, which is the lightest Google
 * verification path. Picked files flow through the SAME driveFilesToAssets +
 * classifier + confirm board as the Demo Drive.
 *
 * To turn it on (see ConnectorsPage / the Phase-4 checklist):
 *   1. Google Cloud project with the Picker API + Drive API enabled.
 *   2. OAuth client ID (Web) + an API key (browser).
 *   3. Put them in .env as VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY.
 * Until then isGoogleDriveConfigured is false and the app uses the Demo Drive.
 *
 * NOTE: this path needs a live client ID to exercise end-to-end; it is written
 * to Google's documented Picker + GIS API but has not been run without creds.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

export const isGoogleDriveConfigured = !!CLIENT_ID && !!API_KEY

// The Picker needs the Cloud project number (setAppId) for drive.file files.get
// /files.list to resolve. It's the numeric prefix of the OAuth client id.
const APP_ID = CLIENT_ID ? CLIENT_ID.split('-')[0] : undefined

// Minimal ambient access to the Google globals (no @types needed).
type AnyObj = Record<string, unknown>
function g(): AnyObj {
  return (window as unknown as { google?: AnyObj }).google ?? {}
}
function gapi(): AnyObj {
  return (window as unknown as { gapi?: AnyObj }).gapi ?? {}
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

async function ensurePicker(): Promise<void> {
  await loadScript('https://apis.google.com/js/api.js')
  await new Promise<void>((resolve) => {
    ;(gapi().load as (m: string, cb: () => void) => void)('picker', () => resolve())
  })
}

async function ensureGis(): Promise<void> {
  await loadScript('https://accounts.google.com/gsi/client')
}

// Cache the access token so connect / file-pick / folder-pick reuse one sign-in.
let tokenCache: { token: string; exp: number } | null = null

async function getToken(): Promise<string> {
  const now = Date.now()
  if (tokenCache && tokenCache.exp > now + 60_000) return tokenCache.token
  await ensureGis()
  const { token, expiresIn } = await requestAccessToken()
  tokenCache = { token, exp: now + expiresIn * 1000 }
  return token
}

/** Drop the cached token (e.g. after a 401) so the next call re-auths. */
function clearToken(): void {
  tokenCache = null
}

/** "Connect account": run the Google sign-in/consent flow up front so the
 *  connection is an explicit step, not a side effect of the first import. */
export async function connectGoogleDrive(): Promise<void> {
  if (!isGoogleDriveConfigured) {
    throw new Error('Google Drive is not configured (set VITE_GOOGLE_CLIENT_ID + VITE_GOOGLE_API_KEY).')
  }
  await getToken()
}

/** Open the GIS consent flow and resolve an access token (drive.file). */
function requestAccessToken(): Promise<{ token: string; expiresIn: number }> {
  return new Promise((resolve, reject) => {
    const oauth2 = (g().accounts as AnyObj | undefined)?.oauth2 as AnyObj | undefined
    if (!oauth2) return reject(new Error('Google Identity Services not loaded'))
    const initTokenClient = oauth2.initTokenClient as (cfg: AnyObj) => { requestAccessToken: () => void }
    const client = initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => {
        if (resp.access_token) resolve({ token: resp.access_token, expiresIn: resp.expires_in ?? 3600 })
        else reject(new Error(resp.error || 'Authorization was cancelled'))
      },
    })
    client.requestAccessToken()
  })
}

/** Show the native Google Picker and resolve the documents the user picks. */
function showPicker(token: string): Promise<Array<{ id: string; parentId?: string }>> {
  return new Promise((resolve) => {
    const picker = g().picker as AnyObj
    const DocsView = picker.DocsView as new (viewId?: unknown) => AnyObj
    const view = new DocsView((picker.ViewId as AnyObj).DOCS)
    ;(view.setIncludeFolders as (b: boolean) => AnyObj)?.(true)

    const builder = new (picker.PickerBuilder as new () => AnyObj)()
    const chain = (m: string, ...args: unknown[]) =>
      (builder[m] as (...a: unknown[]) => AnyObj).apply(builder, args)
    chain('addView', view)
    chain('setOAuthToken', token)
    if (API_KEY) chain('setDeveloperKey', API_KEY)
    if (APP_ID) chain('setAppId', APP_ID)
    chain('enableFeature', (picker.Feature as AnyObj).MULTISELECT_ENABLED)
    chain('setCallback', (data: AnyObj) => {
      const Response = picker.Response as AnyObj
      const Action = picker.Action as AnyObj
      const action = data[Response.ACTION as string]
      // Resolve empty on cancel/close so the await never hangs; ignore transient
      // actions (LOADED) which fire on open.
      if (action === (Action as AnyObj).CANCEL) return resolve([])
      if (action !== (Action as AnyObj).PICKED) return
      const Doc = picker.Document as AnyObj
      const docs = (data[Response.DOCUMENTS as string] as AnyObj[]) ?? []
      resolve(
        docs.map((d) => ({
          id: d[Doc.ID as string] as string,
          parentId: d[Doc.PARENT_ID as string] as string | undefined,
        })),
      )
    })
    const built = chain('build') as AnyObj
    ;(built.setVisible as (v: boolean) => void)(true)
  })
}

interface DriveMeta {
  id: string
  name: string
  mimeType: string
  size?: string
  parents?: string[]
  imageMediaMetadata?: { width?: number; height?: number }
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string }
}

/** Log a failed Drive REST call so a first real connect has diagnostics instead
 *  of silently importing nothing. Clears the token on 401 so the next call re-auths. */
async function logDriveError(label: string, res: Response): Promise<void> {
  if (res.status === 401) clearToken()
  let body = ''
  try {
    body = await res.text()
  } catch {
    /* ignore */
  }
  console.error(`[drive] ${label} → ${res.status} ${res.statusText}`, body.slice(0, 300))
}

async function fileMeta(id: string, token: string): Promise<DriveMeta | null> {
  const fields =
    'id,name,mimeType,size,parents,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis)'
  const url = `https://www.googleapis.com/drive/v3/files/${id}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    await logDriveError(`files.get ${id}`, res)
    return null
  }
  return (await res.json()) as DriveMeta
}

/** Best-effort immediate parent folder name (enough for channel detection).
 *  Under drive.file the parent often isn't granted, so this commonly returns ''
 *  for per-file picks — channel then falls back to the filename. The folder-pick
 *  path (pickFolderFromGoogleDrive) gets the name reliably from the picked folder. */
async function folderName(parentId: string | undefined, token: string): Promise<string> {
  if (!parentId) return ''
  const url = `https://www.googleapis.com/drive/v3/files/${parentId}?fields=name&supportsAllDrives=true`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return '' // expected under drive.file; not an error worth logging
  const j = (await res.json()) as { name?: string }
  return j.name ?? ''
}

function toDriveFile(meta: DriveMeta, folder: string): DriveFile {
  const img = meta.imageMediaMetadata
  const vid = meta.videoMediaMetadata
  const width = img?.width ?? vid?.width
  const height = img?.height ?? vid?.height
  const durationSec = vid?.durationMillis ? Math.round(Number(vid.durationMillis) / 1000) : undefined
  return {
    id: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
    folderPath: folder,
    size: meta.size ? Number(meta.size) : undefined,
    width,
    height,
    durationSec,
  }
}

/** Open the real Google Picker and return the chosen files, enriched with the
 *  metadata (dimensions, parent folder) the classifier needs. */
export async function pickFromGoogleDrive(): Promise<DriveFile[]> {
  if (!isGoogleDriveConfigured) {
    throw new Error('Google Drive is not configured (set VITE_GOOGLE_CLIENT_ID + VITE_GOOGLE_API_KEY).')
  }
  await ensurePicker()
  const token = await getToken()
  const picked = await showPicker(token)
  const files = await Promise.all(
    picked.map(async ({ id, parentId }) => {
      const meta = await fileMeta(id, token)
      if (!meta) return null
      const folder = await folderName(parentId ?? meta.parents?.[0], token)
      return toDriveFile(meta, folder)
    }),
  )
  return files.filter((f): f is DriveFile => f !== null)
}

/** Show a folder-selection Picker and resolve the chosen folder. */
function showFolderPicker(token: string): Promise<{ id: string; name: string } | null> {
  return new Promise((resolve) => {
    const picker = g().picker as AnyObj
    const DocsView = picker.DocsView as new (viewId?: unknown) => AnyObj
    const view = new DocsView((picker.ViewId as AnyObj).DOCS)
    ;(view.setSelectFolderEnabled as (b: boolean) => AnyObj)?.(true)
    ;(view.setIncludeFolders as (b: boolean) => AnyObj)?.(true)
    ;(view.setMimeTypes as (m: string) => AnyObj)?.('application/vnd.google-apps.folder')

    const builder = new (picker.PickerBuilder as new () => AnyObj)()
    const chain = (m: string, ...args: unknown[]) =>
      (builder[m] as (...a: unknown[]) => AnyObj).apply(builder, args)
    chain('addView', view)
    chain('setOAuthToken', token)
    if (API_KEY) chain('setDeveloperKey', API_KEY)
    if (APP_ID) chain('setAppId', APP_ID)
    chain('setCallback', (data: AnyObj) => {
      const Response = picker.Response as AnyObj
      const Action = picker.Action as AnyObj
      const action = data[Response.ACTION as string]
      if (action === (Action as AnyObj).CANCEL) return resolve(null)
      if (action !== (Action as AnyObj).PICKED) return
      const Doc = picker.Document as AnyObj
      const docs = (data[Response.DOCUMENTS as string] as AnyObj[]) ?? []
      const d = docs[0]
      resolve(d ? { id: d[Doc.ID as string] as string, name: d[Doc.NAME as string] as string } : null)
    })
    const built = chain('build') as AnyObj
    ;(built.setVisible as (v: boolean) => void)(true)
  })
}

/** List the (supported) files directly inside a folder the user granted. */
async function listFolder(folderId: string, token: string): Promise<DriveMeta[]> {
  const fields =
    'files(id,name,mimeType,size,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis))'
  const q = `'${folderId}' in parents and trashed = false`
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    await logDriveError(`files.list ${folderId}`, res)
    return []
  }
  const j = (await res.json()) as { files?: DriveMeta[] }
  return j.files ?? []
}

/** "Connect folder": pick a Drive folder and import everything inside it,
 *  tagged with the folder name so the classifier reads the channel from it. */
export async function pickFolderFromGoogleDrive(): Promise<DriveFile[]> {
  if (!isGoogleDriveConfigured) {
    throw new Error('Google Drive is not configured (set VITE_GOOGLE_CLIENT_ID + VITE_GOOGLE_API_KEY).')
  }
  await ensurePicker()
  const token = await getToken()
  const folder = await showFolderPicker(token)
  if (!folder) return []
  const metas = await listFolder(folder.id, token)
  return metas
    .filter((m) => m.mimeType !== 'application/vnd.google-apps.folder')
    .map((m) => toDriveFile(m, folder.name))
}

export const googleDriveLabel = 'Google Drive'
