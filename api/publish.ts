import { jsonRoute } from '../server/apiRoute'
import { runPublish } from '../server/publishHandler'

export default jsonRoute(runPublish)
