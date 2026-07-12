import { jsonRoute } from '../server/apiRoute'
import { runCoherenceCheck } from '../server/coherenceHandler'

export default jsonRoute(runCoherenceCheck)
