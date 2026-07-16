import { jsonRoute } from '../server/apiRoute.js'
import { runCopyDraft } from '../server/copyDraftHandler.js'

export default jsonRoute(runCopyDraft)
