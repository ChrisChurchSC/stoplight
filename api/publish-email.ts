import { jsonRoute } from '../server/apiRoute.js'
import { runPublishEmail } from '../server/resendHandler.js'

export default jsonRoute(runPublishEmail)
