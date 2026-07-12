import { jsonRoute } from '../server/apiRoute'
import { runAsk } from '../server/askHandler'

export default jsonRoute(runAsk)
