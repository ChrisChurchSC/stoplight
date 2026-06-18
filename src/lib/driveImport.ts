import type { Asset, MediaType } from '../domain/types'
import type { DriveFile } from '../adapters/drive/types'

function mediaTypeFor(mime: string): MediaType {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  // PDFs and docs are non-text bodies; the classifier keys off mimeType.
  return 'text'
}

/**
 * Convert picked Drive files into Asset records — the same shape filesToAssets
 * produces, so one classifier and one confirm board serve both paths. Unlike
 * local uploads, Drive hands us dimensions + the folder path directly, so no
 * async metadata read is needed and the channel signal is far stronger.
 */
export function driveFilesToAssets(files: DriveFile[]): Asset[] {
  return files.map((f) => ({
    // Stable id derived from the Drive file id so re-importing the same file
    // de-dupes (see addAssets) instead of creating duplicate rows.
    id: `drv_${f.id}`,
    name: f.name,
    mediaType: mediaTypeFor(f.mimeType),
    mimeType: f.mimeType,
    size: f.size,
    width: f.width,
    height: f.height,
    durationSec: f.durationSec,
    folderPath: f.folderPath,
    previewUrl: f.thumbnailUrl,
    channels: [],
    caption: '',
    createdAt: Date.now(),
  }))
}
