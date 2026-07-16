import { jsonRoute } from '../server/apiRoute.js'
import { runAsk } from '../server/askHandler.js'

export default jsonRoute(runAsk)
