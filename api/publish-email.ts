import { jsonRoute } from '../server/apiRoute'
import { runPublishEmail } from '../server/resendHandler'

export default jsonRoute(runPublishEmail)
