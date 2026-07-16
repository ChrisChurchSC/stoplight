import { jsonRoute } from '../server/apiRoute.js'
import { runMediaMix } from '../server/mediaMixHandler.js'

export default jsonRoute(runMediaMix)
