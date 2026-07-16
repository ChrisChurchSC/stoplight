import { jsonRoute } from '../server/apiRoute.js'
import { runFlowAgent } from '../server/flowAgentHandler.js'

export default jsonRoute(runFlowAgent)
