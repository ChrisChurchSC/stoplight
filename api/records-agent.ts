import { jsonRoute } from '../server/apiRoute'
import { runRecordsAgent } from '../server/recordsAgentHandler'

export default jsonRoute(runRecordsAgent)
