import { jsonRoute } from '../server/apiRoute.js'
import { runRecordsAgent } from '../server/recordsAgentHandler.js'

export default jsonRoute(runRecordsAgent)
