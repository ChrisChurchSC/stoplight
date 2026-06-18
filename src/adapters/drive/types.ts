/** A file as seen in Google Drive (or the Demo Drive fixture). The fields here
 *  mirror what Drive's files.get returns with
 *  fields=id,name,mimeType,size,parents,imageMediaMetadata,videoMediaMetadata —
 *  i.e. exactly the dimensions a local upload can't provide, plus the folder
 *  path that is the strongest channel signal. */
export interface DriveFile {
  id: string
  name: string
  mimeType: string
  /** Slash-joined folder path the file lives in, e.g. "Acme Co/Q2 Launch/LinkedIn". */
  folderPath: string
  size?: number
  width?: number
  height?: number
  durationSec?: number
  /** Optional preview image URL (Drive thumbnailLink, or absent for the fixture). */
  thumbnailUrl?: string
}

/** A place we can pull files from. The Demo Drive fixture and the real Google
 *  Picker/REST source both implement this, so one importer + one classifier
 *  serve both. */
export interface DriveSource {
  /** Display label shown in the picker header. */
  label: string
  /** True for the seeded fixture (drives the "Demo" badge + disclaimer). */
  isDemo: boolean
  /** List the files the user can import. The real source opens the Google
   *  Picker for per-file consent; the fixture returns its seeded records. */
  list(): Promise<DriveFile[]>
}
