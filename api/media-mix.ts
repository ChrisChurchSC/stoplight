import { jsonRoute } from '../server/apiRoute'
import { runMediaMix } from '../server/mediaMixHandler'

export default jsonRoute(runMediaMix)
