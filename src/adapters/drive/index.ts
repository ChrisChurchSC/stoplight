import { mockDriveSource } from './mockDrive'
import { googleDriveSource, isGoogleDriveConfigured } from './googleDriveSource'
import type { DriveSource } from './types'

/** The active Drive source: real Google Drive once VITE_GOOGLE_CLIENT_ID is set,
 *  the seeded Demo Drive otherwise. Swapping is a single env var — the importer,
 *  classifier, and confirm board don't change. */
export const driveSource: DriveSource = isGoogleDriveConfigured ? googleDriveSource : mockDriveSource

export type { DriveFile, DriveSource } from './types'
