import { jsonRoute } from '../server/apiRoute.js'
import { runPublish } from '../server/publishHandler.js'

export default jsonRoute(runPublish)
