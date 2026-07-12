import { jsonRoute } from '../server/apiRoute'
import { runDraftCell } from '../server/draftCellHandler'

export default jsonRoute(runDraftCell)
