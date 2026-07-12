import { jsonRoute } from '../server/apiRoute'
import { runAgent } from '../server/agentHandler'

export default jsonRoute(runAgent)
