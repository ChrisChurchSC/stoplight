import { jsonRoute } from '../server/apiRoute.js'
import { runIcpReview } from '../server/icpReviewHandler.js'

export default jsonRoute(runIcpReview)
