import { jsonRoute } from '../server/apiRoute.js'
import { runAgent } from '../server/agentHandler.js'

export default jsonRoute(runAgent)
