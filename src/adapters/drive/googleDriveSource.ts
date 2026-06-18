import type { DriveFile, DriveSource } from './types'

/**
 * Real Google Drive source — the "flip the switch" follow-up to the Demo Drive.
 *
 * Wiring (no app secret, no backend; mirrors the key-gate pattern):
 *  1. Set VITE_GOOGLE_CLIENT_ID to an OAuth client (type: Web) from a Google
 *     Cloud project with the Picker API + Drive API enabled.
 *  2. Load Google Identity Services + the Picker script, request an access
 *     token for scope https://www.googleapis.com/auth/drive.file (per-file
 *     consent — the lightest verification, the user only exposes what they pick).
 *  3. Open google.picker, and for each picked id call
 *     GET drive/v3/files/{id}?fields=id,name,mimeType,size,parents,thumbnailLink,
 *       imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis)
 *     then walk parents to build folderPath. Map the result into DriveFile —
 *     the same shape the Demo Drive returns, so driveFilesToAssets + the
 *     classifier + the confirm board all work unchanged.
 *
 * Until step 1 is done, this source is never selected (see index.ts), so the
 * app falls back to the Demo Drive. list() throws a clear message if it is ever
 * called without configuration, rather than failing obscurely.
 */
export const isGoogleDriveConfigured = !!import.meta.env.VITE_GOOGLE_CLIENT_ID

export const googleDriveSource: DriveSource = {
  label: 'Google Drive',
  isDemo: false,
  async list(): Promise<DriveFile[]> {
    throw new Error(
      'Google Drive is not configured. Set VITE_GOOGLE_CLIENT_ID and implement the Picker flow (see googleDriveSource.ts).',
    )
  },
}
