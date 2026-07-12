import { jsonRoute } from '../server/apiRoute'
import { runExtractCopy } from '../server/extractCopyHandler'

export default jsonRoute(runExtractCopy)
