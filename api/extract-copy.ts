import { jsonRoute } from '../server/apiRoute.js'
import { runExtractCopy } from '../server/extractCopyHandler.js'

export default jsonRoute(runExtractCopy)
