import { jsonRoute } from '../server/apiRoute.js'
import { runCoherenceCheck } from '../server/coherenceHandler.js'

export default jsonRoute(runCoherenceCheck)
