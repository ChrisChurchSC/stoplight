import { jsonRoute } from '../server/apiRoute.js'
import { runDraftCell } from '../server/draftCellHandler.js'

export default jsonRoute(runDraftCell)
