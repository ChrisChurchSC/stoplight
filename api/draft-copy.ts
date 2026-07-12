import { jsonRoute } from '../server/apiRoute'
import { runCopyDraft } from '../server/copyDraftHandler'

export default jsonRoute(runCopyDraft)
