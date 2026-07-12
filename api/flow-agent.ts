import { jsonRoute } from '../server/apiRoute'
import { runFlowAgent } from '../server/flowAgentHandler'

export default jsonRoute(runFlowAgent)
